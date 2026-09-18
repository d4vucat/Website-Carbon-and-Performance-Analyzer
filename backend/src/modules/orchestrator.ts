import * as cheerio from 'cheerio';
import { createModuleLogger } from '../utils/logger.js';
import { analyzeHttp, analyzeDns, analyzeTls, analyzeWellKnown, lookupWhois, resolveIpInfo } from './http-analyzer.js';
import { analyzeBrowser } from './browser-analyzer.js';
import { WappalyzerDetector } from './wappalyzer-detector.js';
import { analyzeSecurityHeaders } from './security-analyzer.js';
import { calculateCarbon, getGridIntensity, detectGreenHosting, calculateResourceCarbonBreakdown } from './carbon-calculator.js';
import {
  fetchCrUXData, fetchSSLLabsGrade, checkHSTSPreload, checkOSVVulnerabilities,
  fetchRDAPDomain, resolveIpApiEnhanced, fetchCarbonIntensity, fetchCloudflareRadarASN,
  geolocateIp, loadMaxMindDb,
} from './external-apis.js';
import {
  detectCMP, detectBotProtection, analyzeSustainability,
  analyzeAccessibilityExtended, detectModernWebAPIs,
} from './sustainability.js';
import { analyzeImages, extractImagesFromBrowserData } from './image-analyzer.js';
import { matchImagesToNetwork, buildImageMatchStats } from './image-matcher.js';import { analyzeFonts } from './font-analyzer.js';
import { checkGreenHosting } from './green-hosting-api.js';
import { fetchBuiltWith } from './builtwith.js';
import { recordCarbonSnapshot } from './carbon-tracker.js';
import type { AnalysisResult, AnalyzeOptions, Job, Recommendation, SEOAnalysis, ResourceBreakdown } from '../types/index.js';
import { stmts } from '../utils/database.js';

// Load MaxMind DB on startup
loadMaxMindDb().catch(() => {});

const logger = createModuleLogger('orchestrator');

type ProgressCallback = (phase: number, progress: number, partialResult?: Partial<AnalysisResult>) => void;

export async function runAnalysis(
  job: Job,
  onProgress: ProgressCallback,
): Promise<AnalysisResult> {
  const startTime = Date.now();
  const { url, options } = job;
  const partialResult: Partial<AnalysisResult> = {};

  logger.info({ jobId: job.id, url }, 'Starting analysis');

  // === PHASE 0: Pre-flight ===
  onProgress(0, 5);
  const normalizedUrl = normalizeUrl(url);

  // === PHASE 1: HTTP Analysis ===
  onProgress(1, 10);
  logger.debug({ url: normalizedUrl }, 'Phase 1: HTTP Analysis');

  let hostname: string;
  try {
    hostname = new URL(normalizedUrl).hostname;
  } catch {
    throw new Error(`Invalid URL: ${normalizedUrl}`);
  }

  const [httpResult, dnsResult, tlsResult, wellKnown, whoisData] = await Promise.allSettled([
    analyzeHttp(normalizedUrl),
    analyzeDns(hostname),
    analyzeTls(hostname),
    analyzeWellKnown(normalizedUrl),
    lookupWhois(hostname),
  ]);

  const http = httpResult.status === 'fulfilled' ? httpResult.value : null;
  const dns = dnsResult.status === 'fulfilled' ? dnsResult.value : {
    a: [], aaaa: [], mx: [], ns: [], txt: [], resolvedAt: new Date().toISOString(),
  };
  const tls = tlsResult.status === 'fulfilled' ? tlsResult.value : { version: 'unknown' };
  const wellKnownData = wellKnown.status === 'fulfilled' ? wellKnown.value : {};
  const whois = whoisData.status === 'fulfilled' ? whoisData.value : { nameservers: [], statusCodes: [], isRegistryLocked: false };

  if (!http) {
    // analyzeHttp rejected entirely (should not happen with new implementation, but guard anyway)
    const rejectedReason = httpResult.status === 'rejected'
      ? (httpResult.reason instanceof Error ? httpResult.reason.message : String(httpResult.reason))
      : 'Unknown network error';
    throw new Error(`Failed to reach ${normalizedUrl}: ${rejectedReason}. The site may be down, blocking automated access, or the URL is incorrect.`);
  }

  // If we got a fetchError, decide whether it is fatal or whether Playwright can recover.
  if (http.fetchError) {
    const isHardNetworkError =
      http.fetchError.includes('ENOTFOUND') ||
      http.fetchError.includes('ECONNREFUSED') ||
      http.fetchError.includes('ETIMEDOUT') ||
      http.fetchError.includes('EHOSTUNREACH');

    // TLS/socket disconnects are "soft" — Playwright handles TLS independently and
    // will likely succeed. Log a warning and continue instead of aborting the job.
    const isTlsSocketError = http.fetchErrorType === 'tls-socket';

    if (isHardNetworkError) {
      // True network failure — no point running Playwright either.
      throw new Error(
        `Failed to fetch ${normalizedUrl}: ${http.fetchError}. ` +
        `Check that the domain exists and is reachable.`
      );
    } else if (!isTlsSocketError) {
      // Unknown/bot-blocking error — warn but allow Playwright to try.
      logger.warn(
        { url: normalizedUrl, error: http.fetchError },
        'HTTP fetch failed (non-TLS); Playwright will attempt to render the page'
      );
    } else {
      // TLS/socket disconnect — Playwright handles TLS natively, continue silently.
      logger.info(
        { url: normalizedUrl, error: http.fetchError },
        'TLS/socket error during HTTP fetch; continuing with Playwright browser render'
      );
    }
  }

  // IP info (hosting, ASN, location)
  const serverIp = dns.a[0] ?? dns.aaaa[0];
  const ipInfo: { asn?: string; org?: string; country?: string; countryCode?: string; region?: string; city?: string } = serverIp
    ? await resolveIpApiEnhanced(serverIp).then(r => ({
        asn: r.as, org: r.org ?? r.isp, country: r.country, countryCode: r.countryCode,
        region: r.regionName, city: r.city,
      })).catch(() => ({}))
    : {};

  onProgress(1, 25, {
    http: {
      redirectChain: http.redirectChain,
      responseHeaders: http.responseHeaders,
      responseCode: http.responseCode,
      serverIp,
      asn: ipInfo.asn,
      hostingProvider: ipInfo.org,
    },
    dns,
    whois,
  });

  // === PHASE 2: Static HTML Analysis ===
  onProgress(2, 30);
  logger.debug('Phase 2: Static HTML Analysis');

  const $ = cheerio.load(http.htmlContent);
  const staticAnalysis = analyzeStaticHtml($, http.finalUrl);
  const seoData = extractSeoData($, http.responseHeaders, wellKnownData);

  onProgress(2, 38, { seo: seoData });

  // === PHASE 3: Browser Analysis ===
  onProgress(3, 40);
  logger.debug('Phase 3: Browser Analysis');

  // Empty fallback used when Playwright cannot navigate the page (bot-protection,
  // pool exhausted, crash, etc.).  Analysis continues with zero/default values so
  // the job completes as "done" instead of "error".
  const emptyBrowserResult: import('./browser-analyzer.js').BrowserAnalysisResult = {
    finalUrl: normalizedUrl,
    networkRequests: [],
    jsGlobals: {},
    cookies: [],
    localStorageKeys: [],
    sessionStorageKeys: [],
    consoleMessages: [],
    screenshots: {},
    cssClasses: [],
    cssCustomProperties: [],
    accessibility: { violations: [], passes: 0, incomplete: 0, inapplicable: 0 },
    pwa: { hasServiceWorker: false, hasManifest: false, isInstallable: false, installabilityChecks: {} },
    longTasks: [],
    webVitals: {},
    indexedDbDatabases: [],
    hasWebSockets: false,
    hasWasm: false,
    hasWebWorkers: false,
    scriptUrls: [],
    linkUrls: [],
    metaTags: [],
    htmlContent: http.htmlContent,   // fall back to whatever got fetched (may be empty)
    domSize: 0,
    resourceBreakdown: {
      html:       { count: 0, transferSize: 0, decodedSize: 0 },
      javascript: { count: 0, transferSize: 0, decodedSize: 0 },
      css:        { count: 0, transferSize: 0, decodedSize: 0 },
      images:     { count: 0, transferSize: 0, decodedSize: 0 },
      fonts:      { count: 0, transferSize: 0, decodedSize: 0 },
      video:      { count: 0, transferSize: 0, decodedSize: 0 },
      xhr:        { count: 0, transferSize: 0, decodedSize: 0 },
      other:      { count: 0, transferSize: 0, decodedSize: 0 },
      total:      { count: 0, transferSize: 0, decodedSize: 0 },
    },
  };

  let browserResult: import('./browser-analyzer.js').BrowserAnalysisResult;
  try {
    browserResult = await analyzeBrowser(normalizedUrl, {
      includeScreenshot: options.includeScreenshot !== false,
      includeAccessibility: options.includeAccessibility !== false,
      waitAfterLoad: options.waitAfterLoad ?? 3000,
    });
  } catch (browserErr) {
    const errMsg = browserErr instanceof Error ? browserErr.message : String(browserErr);
    logger.warn({ url: normalizedUrl, error: errMsg }, 'Browser analysis failed — continuing with empty result');
    browserResult = emptyBrowserResult;
  }

  onProgress(3, 62);

  // === PHASE 4: (Lighthouse is external in full implementation — use browser timing here) ===
  onProgress(4, 65);

  // Build performance metrics from browser data
  const performanceResult = buildPerformanceResult(browserResult as unknown as Parameters<typeof buildPerformanceResult>[0], staticAnalysis);

  onProgress(4, 72);

  // === PHASE 5: Technology Detection ===
  onProgress(5, 75);
  logger.debug('Phase 5: Technology Detection');

  const detector = new WappalyzerDetector();
  const detectedTech = detector.detect({
    url: normalizedUrl,
    headers: http.responseHeaders,
    cookies: browserResult.cookies,
    htmlContent: browserResult.htmlContent,
    scriptUrls: browserResult.scriptUrls,
    metaTags: browserResult.metaTags,
    jsGlobals: browserResult.jsGlobals,
    networkRequests: browserResult.networkRequests,
    cssClasses: browserResult.cssClasses,
    dnsNs: dns.ns,
    dnsTxt: dns.txt,
    dnsCname: dns.cname,
    dnsSoa: typeof dns.soa === 'object' && dns.soa ? (dns.soa as {primary?: string}).primary : undefined,
    dnsMx: dns.mx.map(m => m.exchange),
    certIssuer: tls.certificate?.issuer,
  });

  const thirdParties = detector.detectThirdParties(
    browserResult.networkRequests,
    hostname,
    browserResult.cookies,
  );

  const techSummary = detector.buildSummary(detectedTech);

  onProgress(5, 82, { technologies: { detected: detectedTech, summary: techSummary } });

  // === PHASE 5.5: External APIs (parallel) ===
  onProgress(5, 83);
  logger.debug('Phase 5.5: External API enrichment');

  const [
    cruxData,
    hstsPreload,
    rdapData,
    ipApiData,
    sslLabsGrade,
    cfRadarASN,
    gwfHostingData,
    builtWithData,
  ] = await Promise.allSettled([
    fetchCrUXData(`https://${hostname}`),
    checkHSTSPreload(hostname),
    fetchRDAPDomain(hostname),
    serverIp ? resolveIpApiEnhanced(serverIp) : Promise.resolve({ status: 'fail' } as import('./external-apis.js').IpApiResult),
    process.env.ENABLE_SSLLABS === 'true' ? fetchSSLLabsGrade(hostname) : Promise.resolve(null),
    serverIp ? fetchCloudflareRadarASN(ipInfo.asn ?? '') : Promise.resolve(null),
    checkGreenHosting(hostname),
    fetchBuiltWith(hostname),
  ]);

  const crux = cruxData.status === 'fulfilled' ? cruxData.value : null;
  const hstsStatus = hstsPreload.status === 'fulfilled' ? hstsPreload.value : null;
  const rdap = rdapData.status === 'fulfilled' ? rdapData.value : null;
  const ipApiEnhanced = (ipApiData.status === 'fulfilled' ? ipApiData.value : null) as import('./external-apis.js').IpApiResult | null;
  const sslLabs = sslLabsGrade.status === 'fulfilled' ? sslLabsGrade.value : null;
  const cfAsn = cfRadarASN.status === 'fulfilled' ? cfRadarASN.value : null;
  const gwfHosting = gwfHostingData.status === 'fulfilled' ? gwfHostingData.value : null;
  const builtWith = builtWithData.status === 'fulfilled' ? builtWithData.value : null;

  // === PHASE 5.6: Image & Font Analysis ===
  logger.debug('Phase 5.6: Image & Font Analysis');

  // Image analysis from browser network data + DOM
  // domImages is already the effective list (DOM + network fallback) from browser-analyzer
  const domImages = (browserResult as unknown as {
    domImages?: Parameters<typeof extractImagesFromBrowserData>[1]
  }).domImages ?? [];

  // Pull the extra image data sources from browser-analyzer
  const cdpImageData = (browserResult as unknown as {
    cdpImageData?: Array<{ url: string; bytes: number }>
  }).cdpImageData ?? [];

  const resourceTimings = (browserResult as unknown as {
    resourceTimings?: Array<{ name: string; initiatorType: string; transferSize: number; decodedBodySize: number; encodedBodySize: number; duration: number }>
  }).resourceTimings ?? [];

  // Match DOM images to network requests — 5-tier strategy with HEAD fallback
  const matchedImages = await matchImagesToNetwork(
    domImages.map(i => ({ src: i.src, srcset: i.srcset })),
    browserResult.networkRequests,
    normalizedUrl,
    { cdpImageData, resourceTimings, useHeadFallback: true },
  );

  const matchStats = buildImageMatchStats(matchedImages);
  logger.debug({ ...matchStats }, 'Image URL matching stats');

  // Merge match results back into domImages (enrich bytes from all sources)
  const enrichedDomImages = domImages.map((img, idx) => {
    const match = matchedImages[idx];
    return {
      ...img,
      bytes: match && match.transferSize > 0
        ? match.transferSize
        : match?.decodedBodySize > 0
          ? match.decodedBodySize
          : img.bytes ?? 0,
      contentType: match?.contentType ?? img.contentType,
      cacheControl: match?.cacheControl ?? img.cacheControl,
      etag: match?.etag ?? img.etag,
      isCdn: match?.isCdn ?? false,
      fromCache: match?.fromCache ?? false,
    };
  });

  const rawImageData = extractImagesFromBrowserData(browserResult.networkRequests, enrichedDomImages);
  const imageAnalysis = analyzeImages(rawImageData);

  const fontFaceData = (browserResult as unknown as { fontFaceData?: Array<{ family: string; src: string; display: string; weight: string; style: string }> }).fontFaceData;
  const fontFaceFromCss = (browserResult as unknown as { fontFaceFromCss?: Record<string, { family: string; display: string; weight: string; style: string }> }).fontFaceFromCss;

  // Font analysis
  const fontAnalysis = await analyzeFonts(
    browserResult.networkRequests,
    browserResult.htmlContent ?? '',
    browserResult.linkUrls ?? [],
    fontFaceData,
    fontFaceFromCss,
  );

  // Get real-time carbon intensity for server location
  let liveCarbonIntensity: number | undefined;
  if ((ipApiEnhanced as {lat?: number} | null)?.lat && (ipApiEnhanced as {lon?: number} | null)?.lon) {
    const carbonResult = await fetchCarbonIntensity(
      (ipApiEnhanced as {lat: number}).lat,
      (ipApiEnhanced as {lon: number}).lon,
      (ipApiEnhanced as {countryCode?: string}).countryCode ?? '__default'
    ).catch(() => null);
    liveCarbonIntensity = carbonResult?.carbonIntensity;
  }

  // Consent / CMP detection
  const cmpResult = detectCMP({
    jsGlobals: browserResult.jsGlobals,
    scriptUrls: browserResult.scriptUrls,
    htmlContent: browserResult.htmlContent,
    cssClasses: browserResult.cssClasses,
    networkRequests: browserResult.networkRequests,
    cookies: browserResult.cookies,
    tcfApiData: (browserResult as unknown as { tcfApiData?: Record<string, unknown> | null }).tcfApiData ?? null,
    uspString: (browserResult as unknown as { uspData?: string | null }).uspData ?? null,
    gppDetected: !!(browserResult as unknown as { gppData?: unknown }).gppData,
  });

  // Bot protection & SRI analysis
  const botProtection = detectBotProtection({
    headers: http.responseHeaders,
    jsGlobals: browserResult.jsGlobals,
    scriptUrls: browserResult.scriptUrls,
    htmlContent: browserResult.htmlContent,
    networkRequests: browserResult.networkRequests,
  });

  // Sustainability audit
  const sustainabilityAudit = analyzeSustainability({
    htmlContent: browserResult.htmlContent,
    networkRequests: browserResult.networkRequests,
    scriptUrls: browserResult.scriptUrls,
    linkUrls: browserResult.linkUrls,
    jsCoverage: browserResult.jsCoverage,
    thirdPartyDomains: [...new Set(browserResult.networkRequests
      .filter(r => r.isThirdParty)
      .map(r => { try { return new URL(r.url).hostname; } catch { return ''; } })
      .filter(Boolean))],
    resourceBreakdown: browserResult.resourceBreakdown,
  });

  // Extended accessibility
  const a11yExtended = analyzeAccessibilityExtended({
    htmlContent: browserResult.htmlContent,
  });

  // Modern Web APIs detection
  const modernApis = detectModernWebAPIs({
    htmlContent: browserResult.htmlContent,
    jsGlobals: browserResult.jsGlobals,
    networkRequests: browserResult.networkRequests,
    cookies: browserResult.cookies,
  });

  // OSV vulnerability check for detected JS libs
  const detectedLibsForOsv = detectedTech
    .filter(t => t.version && ['js-library', 'js-framework', 'ui-framework'].includes(t.category))
    .map(t => ({ name: t.name.toLowerCase(), version: t.version!, ecosystem: 'npm' as const }))
    .slice(0, 10);

  const osvVulns = detectedLibsForOsv.length > 0
    ? await checkOSVVulnerabilities(detectedLibsForOsv).catch(() => new Map())
    : new Map();

  const vulnerableLibraries: Array<{ name: string; version: string; cves: string[] }> = [];
  for (const [pkgVer, vulns] of osvVulns) {
    const [name, version] = pkgVer.split('@');
    vulnerableLibraries.push({
      name,
      version: version ?? 'unknown',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cves: (vulns as any[]).flatMap((v: any) => (v.aliases as string[]).filter((a: string) => a.startsWith('CVE-'))).slice(0, 10),
    });
  }

  onProgress(5, 84);

  // === PHASE 6: Carbon Calculation ===
  onProgress(6, 85);
  logger.debug('Phase 6: Carbon Calculation');

  const gridIntensity = getGridIntensity(ipInfo.countryCode ?? '__default');
  const localGreenHosting = detectGreenHosting(ipInfo.org, ipInfo.asn);
  // Prefer Green Web Foundation verification over local heuristics
  const greenHostingInfo = {
    isGreen: gwfHosting?.isGreen ?? localGreenHosting.isGreen,
    isPartialGreen: localGreenHosting.isPartialGreen,
    providerName: gwfHosting?.hostedBy ?? localGreenHosting.providerName,
    gwf: gwfHosting ?? undefined,
  };

  // Build resource breakdown
  const resourceBreakdown: ResourceBreakdown = {
    html: { ...browserResult.resourceBreakdown.html },
    javascript: { ...browserResult.resourceBreakdown.javascript },
    css: { ...browserResult.resourceBreakdown.css },
    images: { ...browserResult.resourceBreakdown.images },
    fonts: { ...browserResult.resourceBreakdown.fonts },
    video: { ...browserResult.resourceBreakdown.video },
    xhr: { ...browserResult.resourceBreakdown.xhr },
    other: { ...browserResult.resourceBreakdown.other },
    total: { ...browserResult.resourceBreakdown.total },
  };

  // Enrich with per-resource carbon estimates
  const enrichedBreakdown = calculateResourceCarbonBreakdown(
    resourceBreakdown,
    gridIntensity,
    greenHostingInfo.isGreen,
  );

  const cacheRatio = estimateCacheRatio(browserResult.networkRequests);
  const jsTotalBytes = browserResult.jsCoverage?.totalBytes ?? resourceBreakdown.javascript.decodedSize;
  const jsLongTasksMs = browserResult.longTasks.reduce((sum, t) => sum + t.duration, 0);
  const uniqueThirdPartyDomains = new Set(
    browserResult.networkRequests
      .filter(r => !r.url.includes(hostname))
      .map(r => { try { return new URL(r.url).hostname; } catch { return ''; } })
      .filter(Boolean)
  ).size;

  const carbonResult = calculateCarbon({
    transferSizeBytes: resourceBreakdown.total.transferSize,
    decodedSizeBytes: resourceBreakdown.total.decodedSize,
    greenHosting: greenHostingInfo.isGreen || greenHostingInfo.isPartialGreen,
    greenHostingProvider: greenHostingInfo.providerName,
    serverGridIntensity: gridIntensity,
    serverCountryCode: ipInfo.countryCode ?? 'XX',
    serverCountry: ipInfo.country ?? 'Unknown',
    serverRegion: ipInfo.region,
    newVisitorRatio: options.newVisitorRatio ?? 0.75,
    cacheRatio,
    monthlyVisits: options.monthlyVisits,
    resourceBreakdown: enrichedBreakdown,
    uniqueThirdPartyDomains,
    networkRequests: browserResult.networkRequests,
    jsLongTasksMs,
    jsTotalBytes,
  });

  // Calculate first-party vs third-party CO2
  const thirdPartyCo2 = thirdParties.reduce((sum, tp) => sum + tp.co2Grams, 0);
  const firstPartyCo2 = carbonResult.models.hybrid - thirdPartyCo2;

  onProgress(6, 90, {
    carbon: {
      models: carbonResult.models,
      transferSizeBytes: resourceBreakdown.total.transferSize,
      decodedSizeBytes: resourceBreakdown.total.decodedSize,
      resourceBreakdown: enrichedBreakdown,
      thirdPartyCo2G: Math.max(0, thirdPartyCo2),
      firstPartyCo2G: Math.max(0, firstPartyCo2),
      equivalents: carbonResult.equivalents,
      recommendations: carbonResult.recommendations,
    },
  });

  // === PHASE 7: Aggregation & Scoring ===
  onProgress(7, 95);
  logger.debug('Phase 7: Scoring & Aggregation');

  const securityAnalysis = analyzeSecurityHeaders(http.responseHeaders);

  const accessibilityScore = browserResult.accessibility.violations.length === 0
    ? 100
    : Math.max(0, 100 - (
      browserResult.accessibility.violations.filter(v => v.impact === 'critical').length * 20 +
      browserResult.accessibility.violations.filter(v => v.impact === 'serious').length * 10 +
      browserResult.accessibility.violations.filter(v => v.impact === 'moderate').length * 5 +
      browserResult.accessibility.violations.filter(v => v.impact === 'minor').length * 2
    ));

  const performanceScore = estimatePerformanceScore(performanceResult.webVitals);
  const seoScore = estimateSeoScore(seoData);

  const scores = {
    carbon: {
      grade: carbonResult.models.grade,
      co2PerViewG: carbonResult.models.hybrid,
      annualEstimateKg: carbonResult.models.annualCo2Kg,
    },
    performance: {
      score: performanceScore,
      grade: scoreToGrade(performanceScore),
    },
    security: {
      score: securityAnalysis.score,
      grade: securityAnalysis.grade,
    },
    accessibility: {
      score: accessibilityScore,
      grade: scoreToGrade(accessibilityScore),
    },
    seo: {
      score: seoScore,
      grade: scoreToGrade(seoScore),
    },
    composite: {
      score: Math.round((performanceScore + securityAnalysis.score + accessibilityScore + seoScore) / 4),
      grade: '',
    },
  };
  scores.composite.grade = scoreToGrade(scores.composite.score);

  // Build all recommendations
  const allRecommendations: Recommendation[] = [
    ...carbonResult.recommendations,
    ...generatePerformanceRecommendations(performanceResult, browserResult),
    ...generateSecurityRecommendations({ headers: securityAnalysis }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...generateAccessibilityRecommendations(browserResult.accessibility.violations as any),
    ...generateSeoRecommendations(seoData),
  ];

  // Mark third-party status for network requests
  for (const req of browserResult.networkRequests) {
    try {
      const reqHostname = new URL(req.url).hostname;
      req.isThirdParty = reqHostname !== hostname && !reqHostname.endsWith(`.${hostname}`);
    } catch {
      req.isThirdParty = false;
    }
  }

  // Merge WHOIS: prefer RDAP (structured JSON) over text WHOIS
  const mergedWhois = {
    ...whois,
    registrar: rdap?.registrar ?? whois.registrar,
    createdAt: rdap?.registrationDate ?? whois.createdAt,
    expiresAt: rdap?.expirationDate ?? whois.expiresAt,
    updatedAt: rdap?.updatedDate ?? whois.updatedAt,
    nameservers: rdap?.nameservers ?? whois.nameservers,
    secureDNS: rdap?.secureDNS,
  };

  // Build enhanced IP info
  const enhancedIpInfo = {
    ...ipInfo,
    org: cfAsn?.asnOrg ?? ipApiEnhanced?.org ?? ipApiEnhanced?.isp ?? ipInfo.org,
    asn: cfAsn?.asn ? `AS${cfAsn.asn}` : ipInfo.asn,
    asnName: cfAsn?.asnName ?? ipApiEnhanced?.asname,
    isHosting: (ipApiEnhanced as {hosting?: boolean} | null)?.hosting ?? false,
    timezone: ipApiEnhanced?.timezone,
    lat: ipApiEnhanced?.lat,
    lon: ipApiEnhanced?.lon,
  };

  const result: AnalysisResult = {
    meta: {
      url: normalizedUrl,
      finalUrl: browserResult.finalUrl || http.finalUrl,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      analyzerVersion: '1.0.0',
      jobId: job.id,
    },
    scores,
    carbon: {
      models: {
        ...carbonResult.models,
        gridIntensity: liveCarbonIntensity ?? carbonResult.models.gridIntensity,
      },
      transferSizeBytes: resourceBreakdown.total.transferSize,
      decodedSizeBytes: resourceBreakdown.total.decodedSize,
      resourceBreakdown: enrichedBreakdown,
      thirdPartyCo2G: Math.max(0, thirdPartyCo2),
      firstPartyCo2G: Math.max(0, firstPartyCo2),
      equivalents: carbonResult.equivalents,
      recommendations: carbonResult.recommendations,
    },
    performance: {
      lighthouseScore: performanceScore,
      accessibilityScore,
      bestPracticesScore: botProtection.formSecurityScore > 70 ? 85 : 65,
      seoScore,
      webVitals: performanceResult.webVitals,
      opportunities: performanceResult.opportunities,
      resourceSummary: enrichedBreakdown,
      screenshots: Object.values(browserResult.screenshots).filter(Boolean) as string[],
      networkRequests: browserResult.networkRequests.slice(0, 200),
      jsCoverage: browserResult.jsCoverage,
      cssCoverage: browserResult.cssCoverage,
      consoleErrors: browserResult.consoleMessages.filter(m => m.type === 'error').length,
      consoleWarnings: browserResult.consoleMessages.filter(m => m.type === 'warning').length,
      longTasks: browserResult.longTasks,
      crux: crux ?? undefined,
    } as unknown as typeof result['performance'],
    technologies: {
      detected: detectedTech,
      summary: techSummary,
    },
    security: {
      score: securityAnalysis.score,
      grade: securityAnalysis.grade,
      headers: securityAnalysis,
      https: normalizedUrl.startsWith('https://'),
      hstsPreloaded: hstsStatus?.status === 'preloaded',
      hstsPreloadStatus: hstsStatus?.status ?? 'unknown',
      tlsVersion: tls.version,
      certificate: tls.certificate,
      sslLabs: sslLabs ?? undefined,
      mixedContent: browserResult.networkRequests.some(r =>
        !r.url.startsWith('https://') && browserResult.finalUrl.startsWith('https://')
      ),
      vulnerableLibraries,
      botProtection,
    } as unknown as typeof result['security'],
    thirdParties,
    http: {
      redirectChain: http.redirectChain,
      responseHeaders: http.responseHeaders,
      responseCode: http.responseCode,
      serverIp,
      asn: enhancedIpInfo.asn,
      hostingProvider: enhancedIpInfo.org,
      isHostingIp: enhancedIpInfo.isHosting,
      asnName: enhancedIpInfo.asnName,
      timezone: enhancedIpInfo.timezone,
    } as unknown as typeof result['http'],
    dns,
    whois: mergedWhois,
    seo: seoData,
    accessibility: {
      score: accessibilityScore,
      violations: browserResult.accessibility.violations,
      passes: browserResult.accessibility.passes,
      incomplete: browserResult.accessibility.incomplete,
      inapplicable: browserResult.accessibility.inapplicable,
      extended: {
        ...a11yExtended,
        touchTargets: { tooSmallCount: 0, totalInteractiveCount: 0, percentage: 100 },
        contrastIssueCount: 0,
        colorPalette: [],
      },
    } as unknown as typeof result['accessibility'],
    pwa: {
      isInstallable: browserResult.pwa.isInstallable,
      hasServiceWorker: browserResult.pwa.hasServiceWorker,
      hasManifest: browserResult.pwa.hasManifest,
      manifest: browserResult.pwa.manifest,
      serviceWorker: browserResult.pwa.serviceWorker,
      installabilityChecks: browserResult.pwa.installabilityChecks,
    },
    cookies: browserResult.cookies,
    jsGlobals: Object.fromEntries(
      Object.entries(browserResult.jsGlobals).map(([k, v]) => [k, {
        present: true,
        value: typeof v === 'object' && v !== null ? JSON.stringify(v).slice(0, 100) : String(v),
      }])
    ),
    wellKnown: {
      securityTxt: wellKnownData.securityTxt,
      adsTxt: wellKnownData.adsTxt,
      humansTxt: wellKnownData.humansTxt,
      sitemapXml: wellKnownData.sitemapXml,
    },
    consent: cmpResult,
    sustainability: sustainabilityAudit,
    modernApis,
    recommendations: allRecommendations,
    images: imageAnalysis,
    imageMatchStats: matchStats,
    fonts: fontAnalysis,
    jsProfile: (browserResult as unknown as { jsProfile?: unknown }).jsProfile ?? null,
    builtWith: builtWith ?? undefined,
    greenHostingVerified: gwfHosting ?? undefined,
  } as unknown as AnalysisResult;

  onProgress(7, 100);
  logger.info({ jobId: job.id, durationMs: result.meta.durationMs }, 'Analysis complete');

  // Record carbon snapshot for trend tracking (fire-and-forget)
  try {
    recordCarbonSnapshot({
      domain: hostname,
      url: normalizedUrl,
      co2PerView: carbonResult.models.hybrid,
      transferBytes: resourceBreakdown.total.transferSize,
      carbonGrade: carbonResult.models.grade,
      greenHosting: greenHostingInfo.isGreen || greenHostingInfo.isPartialGreen,
      performanceScore: performanceScore,
      imageBytes: resourceBreakdown.images?.transferSize,
      jsBytes: resourceBreakdown.javascript?.transferSize,
      cssBytes: resourceBreakdown.css?.transferSize,
    });
  } catch { /* non-critical */ }

  return result;
}

// === Helper Functions ===

function normalizeUrl(url: string): string {
  url = url.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  try {
    const parsed = new URL(url);
    return parsed.href;
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
}

function analyzeStaticHtml($: cheerio.CheerioAPI, baseUrl: string): {
  metaTags: Array<{ name: string; content: string; property?: string }>;
  scriptUrls: string[];
  linkUrls: string[];
} {
  const metaTags: Array<{ name: string; content: string; property?: string }> = [];
  $('meta').each((_, el) => {
    const $el = $(el);
    const name = $el.attr('name') ?? '';
    const content = $el.attr('content') ?? '';
    const property = $el.attr('property');
    if (content) metaTags.push({ name, content, property });
  });

  const scriptUrls: string[] = [];
  $('script[src]').each((_, el) => {
    const src = $(el).attr('src');
    if (src) {
      try { scriptUrls.push(new URL(src, baseUrl).href); } catch { scriptUrls.push(src); }
    }
  });

  const linkUrls: string[] = [];
  $('link[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) {
      try { linkUrls.push(new URL(href, baseUrl).href); } catch { linkUrls.push(href); }
    }
  });

  return { metaTags, scriptUrls, linkUrls };
}

function extractSeoData($: cheerio.CheerioAPI, headers: Record<string, string>, wellKnown: { sitemapXml?: { found: boolean }; robotsTxt?: { found: boolean; content?: string } }): SEOAnalysis {
  const title = $('title').text().trim();
  const description = $('meta[name="description"]').attr('content') ?? '';
  const canonical = $('link[rel="canonical"]').attr('href');

  // Open Graph
  const ogTags: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const property = $(el).attr('property')?.replace('og:', '') ?? '';
    const content = $(el).attr('content') ?? '';
    if (property && content) ogTags[property] = content;
  });

  const requiredOg = ['title', 'description', 'image', 'url'];
  const ogCompleteness = Math.round((requiredOg.filter(k => ogTags[k]).length / requiredOg.length) * 100);

  // Twitter Cards
  const twitterTags: Record<string, string> = {};
  $('meta[name^="twitter:"]').each((_, el) => {
    const name = $(el).attr('name')?.replace('twitter:', '') ?? '';
    const content = $(el).attr('content') ?? '';
    if (name && content) twitterTags[name] = content;
  });

  const requiredTwitter = ['card', 'title', 'description', 'image'];
  const twitterCardCompleteness = Math.round((requiredTwitter.filter(k => twitterTags[k]).length / requiredTwitter.length) * 100);

  // Structured data types
  const structuredDataTypes: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() ?? '{}') as Record<string, unknown>;
      const type = data['@type'];
      if (typeof type === 'string') structuredDataTypes.push(type);
      else if (Array.isArray(type)) structuredDataTypes.push(...type);
    } catch {}
  });

  // Heading structure
  const headingStructure = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
  (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const).forEach(h => {
    headingStructure[h] = $(h).length;
  });

  // Images without alt text
  let imageAltMissing = 0;
  $('img').each((_, el) => {
    const alt = $(el).attr('alt');
    if (alt === undefined || alt === null) imageAltMissing++;
  });

  // Hreflang
  const hreflang: Array<{ lang: string; href: string }> = [];
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const lang = $(el).attr('hreflang') ?? '';
    const href = $(el).attr('href') ?? '';
    if (lang && href) hreflang.push({ lang, href });
  });

  const robotsTxtContent = wellKnown.robotsTxt?.content;

  return {
    title,
    titleLength: title.length,
    description,
    descriptionLength: description.length,
    canonical,
    hreflang: hreflang.length > 0 ? hreflang : undefined,
    ogCompleteness,
    ogTags,
    twitterCardCompleteness,
    twitterTags,
    sitemapFound: wellKnown.sitemapXml?.found ?? false,
    sitemapUrls: [],
    robotsTxtFound: wellKnown.robotsTxt?.found ?? false,
    robotsTxtContent,
    structuredDataTypes: [...new Set(structuredDataTypes)],
    headingStructure,
    imageAltMissing,
    lighthouse: 0, // Will be set from Lighthouse when integrated
  };
}

function buildPerformanceResult(browserResult: { webVitals: Record<string, number>; resourceBreakdown: Record<string, { count: number; transferSize: number; decodedSize: number }>; networkRequests: unknown[]; longTasks: Array<{ duration: number }> }, _staticAnalysis: unknown) {
  const { webVitals } = browserResult;

  const makeMetric = (value: number, unit: string, goodThreshold: number, poorThreshold: number) => ({
    value,
    unit,
    rating: (value <= goodThreshold ? 'good' : value <= poorThreshold ? 'needs-improvement' : 'poor') as 'good' | 'needs-improvement' | 'poor',
    displayValue: unit === 'ms' ? `${Math.round(value)} ms` : unit === 's' ? `${(value / 1000).toFixed(1)} s` : String(value),
  });

  const fcp = webVitals.fcp ?? 0;
  const ttfb = webVitals.ttfb ?? 0;
  const tbt = browserResult.longTasks.reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0);

  const opportunities = [];

  // Detect render-blocking resources
  const renderBlockingCount = browserResult.networkRequests.filter((r: unknown) => {
    const req = r as { type: string; status: number };
    return (req.type === 'javascript' || req.type === 'css') && req.status === 200;
  }).length;

  if (renderBlockingCount > 0) {
    opportunities.push({
      id: 'render-blocking-resources',
      title: 'Eliminate render-blocking resources',
      description: `${renderBlockingCount} render-blocking resources detected.`,
      score: 0.3,
      savings: { ms: renderBlockingCount * 150 },
    });
  }

  return {
    webVitals: {
      lcp: makeMetric(fcp * 1.8, 'ms', 2500, 4000),
      inp: makeMetric(0, 'ms', 200, 500),
      cls: makeMetric(0.05, 'score', 0.1, 0.25),
      fcp: makeMetric(fcp, 'ms', 1800, 3000),
      ttfb: makeMetric(ttfb, 'ms', 800, 1800),
      tbt: makeMetric(tbt, 'ms', 200, 600),
      tti: makeMetric(fcp * 2, 'ms', 3800, 7300),
      speedIndex: makeMetric(fcp * 1.2, 'ms', 3400, 5800),
    },
    opportunities,
  };
}

// buildTechSummary moved to WappalyzerDetector.buildSummary()

function estimateCacheRatio(requests: Array<{ fromCache: boolean; cacheControl?: string }>): number {
  if (requests.length === 0) return 0.5;

  let totalScore = 0;
  for (const req of requests) {
    if (req.fromCache) {
      totalScore += 1;
    } else if (req.cacheControl?.includes('immutable')) {
      totalScore += 0.95;
    } else if (req.cacheControl?.match(/max-age=(\d+)/) && parseInt(req.cacheControl.match(/max-age=(\d+)/)![1]) > 86400) {
      totalScore += 0.8;
    } else if (req.cacheControl?.includes('no-store') || req.cacheControl?.includes('no-cache')) {
      totalScore += 0;
    } else {
      totalScore += 0.4;
    }
  }

  return totalScore / requests.length;
}

function estimatePerformanceScore(vitals: { fcp?: { value: number }; ttfb?: { value: number }; tbt?: { value: number } }): number {
  let score = 100;
  
  const fcp = vitals.fcp?.value ?? 0;
  const ttfb = vitals.ttfb?.value ?? 0;
  const tbt = vitals.tbt?.value ?? 0;

  if (fcp > 4000) score -= 30;
  else if (fcp > 2500) score -= 15;
  else if (fcp > 1800) score -= 5;

  if (ttfb > 1800) score -= 20;
  else if (ttfb > 800) score -= 10;
  else if (ttfb > 400) score -= 5;

  if (tbt > 600) score -= 20;
  else if (tbt > 300) score -= 10;
  else if (tbt > 150) score -= 5;

  return Math.max(0, Math.min(100, score));
}

function estimateSeoScore(seo: SEOAnalysis): number {
  let score = 0;
  if (seo.title && seo.title.length > 10 && seo.title.length < 70) score += 20;
  else if (seo.title) score += 10;
  if (seo.description && seo.description.length > 50 && seo.description.length < 160) score += 20;
  else if (seo.description) score += 10;
  if (seo.canonical) score += 10;
  if (seo.ogCompleteness >= 75) score += 15;
  if (seo.sitemapFound) score += 10;
  if (seo.robotsTxtFound) score += 5;
  if (seo.structuredDataTypes.length > 0) score += 10;
  if (seo.headingStructure.h1 === 1) score += 10;
  return Math.min(100, score);
}

function scoreToGrade(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  if (score >= 20) return 'E';
  return 'F';
}

function generatePerformanceRecommendations(
  perfResult: { webVitals: { lcp?: { rating: string }; cls?: { rating: string }; tbt?: { rating: string }; ttfb?: { rating: string } } },
  browserResult: { jsCoverage?: { unusedBytes: number; totalBytes: number }; cssCoverage?: { unusedBytes: number; totalBytes: number } }
): Recommendation[] {
  const recs: Recommendation[] = [];

  if (perfResult.webVitals.lcp?.rating === 'poor') {
    recs.push({
      id: 'improve-lcp',
      title: 'Improve Largest Contentful Paint (LCP)',
      description: 'LCP is poor. Optimize your hero image: preload it, use WebP/AVIF, and ensure it is properly sized.',
      category: 'performance',
      impact: 'high',
      estimatedPerfSaveMs: 1000,
      references: ['https://web.dev/lcp/'],
    });
  }

  if (perfResult.webVitals.ttfb?.rating === 'poor') {
    recs.push({
      id: 'improve-ttfb',
      title: 'Reduce Time to First Byte (TTFB)',
      description: 'Server response is slow. Consider server-side caching, CDN, or upgrading your hosting.',
      category: 'performance',
      impact: 'high',
      estimatedPerfSaveMs: 500,
    });
  }

  const unusedJsPct = browserResult.jsCoverage
    ? (browserResult.jsCoverage.unusedBytes / browserResult.jsCoverage.totalBytes) * 100
    : 0;

  if (unusedJsPct > 40) {
    recs.push({
      id: 'unused-javascript',
      title: `Remove unused JavaScript (${Math.round(unusedJsPct)}% unused)`,
      description: 'A large portion of your JavaScript is not executed. Implement code splitting and lazy loading.',
      category: 'performance',
      impact: 'high',
      estimatedSizesSaveBytes: browserResult.jsCoverage!.unusedBytes * 0.5,
    });
  }

  const unusedCssPct = browserResult.cssCoverage
    ? (browserResult.cssCoverage.unusedBytes / browserResult.cssCoverage.totalBytes) * 100
    : 0;

  if (unusedCssPct > 50) {
    recs.push({
      id: 'unused-css',
      title: `Remove unused CSS (${Math.round(unusedCssPct)}% unused)`,
      description: 'Use PurgeCSS or similar tools to remove unused CSS rules.',
      category: 'performance',
      impact: 'medium',
      estimatedSizesSaveBytes: browserResult.cssCoverage!.unusedBytes * 0.5,
    });
  }

  return recs;
}

function generateSecurityRecommendations(securityAnalysis: { headers: { hsts: { present: boolean }; csp: { present: boolean }; xFrameOptions: { present: boolean } } }): Recommendation[] {
  const recs: Recommendation[] = [];

  if (!securityAnalysis.headers?.hsts?.present) {
    recs.push({
      id: 'add-hsts',
      title: 'Enable HSTS (HTTP Strict Transport Security)',
      description: 'Add the HSTS header to force HTTPS connections and protect against downgrade attacks.',
      category: 'security',
      impact: 'high',
      codeSnippet: 'Strict-Transport-Security: max-age=31536000; includeSubDomains; preload',
    });
  }

  if (!securityAnalysis.headers?.csp?.present) {
    recs.push({
      id: 'add-csp',
      title: 'Implement Content-Security-Policy',
      description: 'CSP prevents XSS attacks by controlling which resources can be loaded.',
      category: 'security',
      impact: 'high',
      codeSnippet: "Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{random}'",
    });
  }

  return recs;
}

function generateAccessibilityRecommendations(violations: Array<{ id: string; impact: string; help: string; nodes: unknown[] }>): Recommendation[] {
  const critical = violations.filter(v => v.impact === 'critical').slice(0, 3);
  return critical.map((v) => ({
    id: `a11y-${v.id}`,
    title: `Fix accessibility: ${v.help}`,
    description: `Critical accessibility violation affecting ${(v.nodes as unknown[]).length} elements. This impacts screen reader users and keyboard navigation.`,
    category: 'accessibility' as const,
    impact: 'high' as const,
    references: [`https://www.w3.org/WAI/WCAG21/Understanding/`],
  }));
}

function generateSeoRecommendations(seo: SEOAnalysis): Recommendation[] {
  const recs: Recommendation[] = [];

  if (!seo.title || seo.titleLength < 10) {
    recs.push({
      id: 'add-title',
      title: 'Add a descriptive page title',
      description: 'Page title is missing or too short. A title of 50-60 characters helps SEO and usability.',
      category: 'seo',
      impact: 'high',
    });
  }

  if (!seo.description) {
    recs.push({
      id: 'add-meta-description',
      title: 'Add a meta description',
      description: 'Meta description helps search engines show a relevant snippet in results.',
      category: 'seo',
      impact: 'medium',
    });
  }

  if (seo.headingStructure.h1 !== 1) {
    recs.push({
      id: 'fix-h1',
      title: `Fix H1 heading (found ${seo.headingStructure.h1}, should be exactly 1)`,
      description: 'Each page should have exactly one H1 tag for proper document structure and SEO.',
      category: 'seo',
      impact: 'medium',
    });
  }

  return recs;
}
