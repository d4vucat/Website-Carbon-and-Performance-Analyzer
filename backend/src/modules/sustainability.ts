import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('sustainability');

export interface IabTcfPurpose {
  id: number;
  name: string;
  description: string;
  hasConsent: boolean | null;     // null = unknown
  hasLegitimateInterest: boolean | null;
}

export interface IabTcfData {
  version: '1.1' | '2.0' | '2.2' | null;
  cmpId: number | null;
  cmpVersion: number | null;
  tcString: string | null;
  created: string | null;
  lastUpdated: string | null;
  purposes: IabTcfPurpose[];
  specialFeatureOptins: Record<number, boolean>;
  vendorConsents: number[];
  vendorLegitimateInterests: number[];
  vendorCount: number;
  publisherCC: string | null;
  isServiceSpecific: boolean | null;
  useNonStandardTexts: boolean | null;
  purposeOneTreatment: boolean | null;
  gdprApplies: boolean | null;
  uspString: string | null;      // CCPA US Privacy String
  gppDetected: boolean;
  apiCallSuccess: boolean;
}

export interface CMPDetectionResult {
  hasCMP: boolean;
  cmpName?: string;
  cmpType: 'onetrust' | 'cookiebot' | 'quantcast' | 'didomi' | 'sourcepoint' | 'klaro' | 'tarteaucitron' | 'iab-tcf' | 'generic' | 'none';
  iabTcfVersion?: '1.1' | '2.0' | '2.2';
  iabTcfCompliant: boolean;
  iabTcfData: IabTcfData | null;
  cookieBannerDetected: boolean;
  defaultConsent: 'opt-in' | 'opt-out' | 'unclear' | 'none';
  analyticsBeforeConsent: boolean;
  consentSignals: string[];
  gdprScore: number; // 0-100
  gdprIssues: string[];
  gdprRecommendations: string[];
  cookieAudit: CookieAuditSummary;
}

export interface CookieAuditSummary {
  total: number;
  firstParty: number;
  thirdParty: number;
  session: number;
  persistent: number;
  secure: number;
  httpOnly: number;
  sameSiteStrict: number;
  sameSiteLax: number;
  sameSiteNone: number;
  sameSiteUnset: number;
  tracking: number;
  advertising: number;
  essential: number;
  functional: number;
  unknown: number;
  withPrefixes: number;
  prefixViolations: number;
  avgSecurityScore: number;
  criticalIssues: number;
  topIssues: string[];
}

export interface ModernWebAPIsResult {
  fetchPriority: {
    hasLcpImagePreload: boolean;
    fetchPriorityHighCount: number;
    fetchPriorityLowCount: number;
    missingOnLcp: boolean;
  };
  speculationRules: {
    detected: boolean;
    ruleCount: number;
    prefetchUrls: string[];
    prerenderUrls: string[];
  };
  importMaps: {
    detected: boolean;
    mappingCount: number;
    mappings?: Record<string, string>;
  };
  viewTransitions: {
    detected: boolean;
  };
  bfCacheEligibility: {
    eligible: boolean;
    disqualifiers: string[];
    score: number; // 0-100
  };
  schedulerApi: boolean;
  navigationApi: boolean;
  declarativeShadowDom: boolean;
  trustedTypes: boolean;
  webAssembly: boolean;
  webWorkers: boolean;
  serviceWorkerInstalled: boolean;
  broadcastChannel: boolean;
}

export interface SustainabilityAuditResult {
  autoplayVideos: { count: number; totalEstimatedBytes: number; urls: string[] };
  animatedGifs: { count: number; totalBytes: number; estimatedWebmSavingBytes: number; urls: string[] };
  imageFormatAudit: {
    jpegCount: number;
    pngCount: number;
    webpCount: number;
    avifCount: number;
    svgCount: number;
    modernFormatPercentage: number;
    imagesWithoutSrcset: number;
    imagesWithoutDimensions: number;
    estimatedSavingBytes: number;
  };
  infiniteScroll: { detected: boolean; loadMoreTriggers: number };
  selfHostedFonts: { percentage: number; externalFontDomains: string[] };
  cacheEfficiency: {
    immutableAssetsPercentage: number;
    longCacheAssetsPercentage: number;
    noCacheAssetsPercentage: number;
    estimatedReturnVisitorSavingBytes: number;
    score: number;
  };
  resourceHints: {
    preloadedLcp: boolean;
    preconnectedThirdParties: number;
    prefetchedPages: number;
    totalPreloads: number;
    missingPreconnects: string[];
  };
  unnecessaryTracking: {
    trackingPixelCount: number;
    estimatedCo2SaveG: number;
    pixelDetails: Array<{ name: string; url: string; purpose: string }>;
  };
  javascriptBloat: {
    totalKb: number;
    unusedPercentage: number;
    duplicateLibraries: string[];
    budgetExceededKb: number;
  };
  imageCdnDetected: boolean;
  imageCdnName?: string;
  imageCdnScore: number;
  overallSustainabilityScore: number;
  sustainabilityGrade: string;
}

export interface AccessibilityExtendedResult {
  touchTargets: { tooSmallCount: number; totalInteractiveCount: number; percentage: number };
  zoomLockDetected: boolean;
  skipNavigation: boolean;
  focusIndicatorsRemoved: boolean;
  landmarkRoles: {
    main: number; nav: number; header: number; footer: number;
    aside: number; search: number; form: number;
  };
  ariaLiveRegions: { polite: number; assertive: number; alert: number; status: number };
  formLabelCoverage: { withLabel: number; withoutLabel: number; percentage: number };
  mediaAccessibility: {
    videoWithoutCaptions: number;
    audioWithoutTranscript: number;
    imagesWithoutAlt: number;
  };
  contrastIssueCount: number;
  colorPalette: Array<{ element: string; foreground: string; background: string; ratio: number; passes: boolean }>;
}

export interface BotProtectionResult {
  detected: boolean;
  providers: Array<{
    name: string;
    type: 'captcha' | 'challenge' | 'waf' | 'fingerprinting';
    confidence: number;
    detectedVia: string;
  }>;
  sriCoverage: { externalScripts: number; withSri: number; withoutSri: number; percentage: number };
  rateLimitingDetected: boolean;
  rateLimitHeaders: Record<string, string>;
  csrfProtection: boolean;
  formSecurityScore: number;
}

export interface ConsentAnalysisInput {
  jsGlobals: Record<string, unknown>;
  scriptUrls: string[];
  htmlContent: string;
  cssClasses: string[];
  networkRequests: Array<{ url: string; type: string }>;
  cookies: Array<{
    name: string;
    domain: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: string;
    expires?: number;
    path?: string;
    size?: number;
    isSession?: boolean;
    isThirdParty?: boolean;
    prefix?: string;
    prefixValid?: boolean;
    prefixIssues?: string[];
    classification?: string;
    securityScore?: number;
    securityIssues?: string[];
    partitioned?: boolean;
  }>;
  // Real TCF API data collected from browser
  tcfApiData?: Record<string, unknown> | null;
  uspString?: string | null;
  gppDetected?: boolean;
}

// IAB TCF v2.x purposes (all 11 standard purposes)
const IAB_TCF_PURPOSES: Array<{ id: number; name: string; description: string }> = [
  { id: 1,  name: 'Store and/or access information on a device',       description: 'Cookies, device or similar online identifiers can be stored or read on your device.' },
  { id: 2,  name: 'Use limited data to select advertising',             description: 'Advertising presented to you on this service can be based on limited data.' },
  { id: 3,  name: 'Create profiles for personalised advertising',       description: 'A profile can be built about you and your interests to show you personalised ads.' },
  { id: 4,  name: 'Use profiles to select personalised advertising',    description: 'Personalised ads can be shown to you based on a profile about you.' },
  { id: 5,  name: 'Create profiles to personalise content',             description: 'A profile can be built about you to show you personalised content.' },
  { id: 6,  name: 'Use profiles to select personalised content',        description: 'Personalised content can be shown to you based on a profile about you.' },
  { id: 7,  name: 'Measure advertising performance',                    description: 'The performance and effectiveness of ads can be measured.' },
  { id: 8,  name: 'Measure content performance',                        description: 'The performance and effectiveness of content can be measured.' },
  { id: 9,  name: 'Understand audiences via statistics',                description: 'Reports can be generated based on the combination of data sets regarding your interactions.' },
  { id: 10, name: 'Develop and improve services',                       description: 'Your data can be used to improve existing systems and software.' },
  { id: 11, name: 'Use limited data to select content',                 description: 'Content can be selected based on limited data.' },
];

function parseTcfData(rawTcf: Record<string, unknown>): IabTcfData {
  const tcData = rawTcf as {
    tcfPolicyVersion?: number;
    cmpId?: number;
    cmpVersion?: number;
    tcString?: string;
    created?: string | Date;
    lastUpdated?: string | Date;
    purposeConsents?: Record<string | number, boolean> | { [k: string]: boolean };
    purposeLegitimateInterests?: Record<string | number, boolean>;
    specialFeatureOptins?: Record<string | number, boolean>;
    vendorConsents?: { has?: (id: number) => boolean } | Record<string | number, boolean>;
    vendorLegitimateInterests?: { has?: (id: number) => boolean } | Record<string | number, boolean>;
    publisherCC?: string;
    isServiceSpecific?: boolean;
    useNonStandardTexts?: boolean;
    purposeOneTreatment?: boolean;
    gdprApplies?: boolean;
    vendor?: { consents?: Record<number, boolean>; legitimateInterests?: Record<number, boolean> };
  };

  // Determine TCF version from policy version field
  let version: IabTcfData['version'] = null;
  const pv = tcData.tcfPolicyVersion ?? 0;
  if (pv >= 4) version = '2.2';
  else if (pv >= 2) version = '2.0';
  else if (pv === 1) version = '1.1';
  else if (tcData.tcString) version = '2.0'; // assume v2 if tcString present

  // Parse purpose consents
  const purposeConsentsRaw = tcData.purposeConsents ?? tcData.vendor?.consents ?? {};
  const purposeLIRaw = tcData.purposeLegitimateInterests ?? {};
  const specialFeaturesRaw = tcData.specialFeatureOptins ?? {};

  const getConsent = (raw: Record<string | number, boolean>, id: number): boolean | null => {
    if (id in raw) return Boolean(raw[id]);
    if (String(id) in raw) return Boolean((raw as Record<string, boolean>)[String(id)]);
    return null;
  };

  const purposes: IabTcfPurpose[] = IAB_TCF_PURPOSES.map(p => ({
    ...p,
    hasConsent: getConsent(purposeConsentsRaw as Record<string | number, boolean>, p.id),
    hasLegitimateInterest: getConsent(purposeLIRaw as Record<string | number, boolean>, p.id),
  }));

  // Special feature opt-ins
  const specialFeatureOptins: Record<number, boolean> = {};
  for (const [k, v] of Object.entries(specialFeaturesRaw)) {
    specialFeatureOptins[Number(k)] = Boolean(v);
  }

  // Vendor consent list
  const vendorConsents: number[] = [];
  const vendorLegInts: number[] = [];
  const vc = tcData.vendorConsents ?? {};
  const vl = tcData.vendorLegitimateInterests ?? {};
  for (const [k, v] of Object.entries(vc)) {
    if (v) vendorConsents.push(Number(k));
  }
  for (const [k, v] of Object.entries(vl)) {
    if (v) vendorLegInts.push(Number(k));
  }

  return {
    version,
    cmpId: typeof tcData.cmpId === 'number' ? tcData.cmpId : null,
    cmpVersion: typeof tcData.cmpVersion === 'number' ? tcData.cmpVersion : null,
    tcString: typeof tcData.tcString === 'string' ? tcData.tcString.slice(0, 200) : null,
    created: tcData.created ? String(tcData.created) : null,
    lastUpdated: tcData.lastUpdated ? String(tcData.lastUpdated) : null,
    purposes,
    specialFeatureOptins,
    vendorConsents,
    vendorLegitimateInterests: vendorLegInts,
    vendorCount: vendorConsents.length,
    publisherCC: typeof tcData.publisherCC === 'string' ? tcData.publisherCC : null,
    isServiceSpecific: typeof tcData.isServiceSpecific === 'boolean' ? tcData.isServiceSpecific : null,
    useNonStandardTexts: typeof tcData.useNonStandardTexts === 'boolean' ? tcData.useNonStandardTexts : null,
    purposeOneTreatment: typeof tcData.purposeOneTreatment === 'boolean' ? tcData.purposeOneTreatment : null,
    gdprApplies: typeof tcData.gdprApplies === 'boolean' ? tcData.gdprApplies : null,
    uspString: null,
    gppDetected: false,
    apiCallSuccess: true,
  };
}

function buildCookieAuditSummary(cookies: ConsentAnalysisInput['cookies']): CookieAuditSummary {
  const total = cookies.length;
  const topIssues: Map<string, number> = new Map();

  let firstParty = 0, thirdParty = 0, session = 0, persistent = 0;
  let secure = 0, httpOnly = 0;
  let sameSiteStrict = 0, sameSiteLax = 0, sameSiteNone = 0, sameSiteUnset = 0;
  let tracking = 0, advertising = 0, essential = 0, functional = 0, unknown = 0;
  let withPrefixes = 0, prefixViolations = 0;
  let totalSecurityScore = 0, criticalIssues = 0;

  for (const c of cookies) {
    if (c.isThirdParty) thirdParty++; else firstParty++;
    if (c.isSession) session++; else persistent++;
    if (c.secure) secure++;
    if (c.httpOnly) httpOnly++;

    const ss = (c.sameSite ?? '').toLowerCase();
    if (ss === 'strict') sameSiteStrict++;
    else if (ss === 'lax') sameSiteLax++;
    else if (ss === 'none') sameSiteNone++;
    else sameSiteUnset++;

    const cls = c.classification ?? 'unknown';
    if (cls === 'tracking') tracking++;
    else if (cls === 'advertising') advertising++;
    else if (cls === 'essential') essential++;
    else if (cls === 'functional') functional++;
    else unknown++;

    if (c.prefix) withPrefixes++;
    if (!c.prefixValid && c.prefix) prefixViolations++;

    const score = c.securityScore ?? 100;
    totalSecurityScore += score;
    if (score < 50) criticalIssues++;

    for (const issue of c.securityIssues ?? []) {
      topIssues.set(issue, (topIssues.get(issue) ?? 0) + 1);
    }
  }

  const sortedIssues = Array.from(topIssues.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([issue, count]) => count > 1 ? `${issue} (×${count})` : issue);

  return {
    total,
    firstParty,
    thirdParty,
    session,
    persistent,
    secure,
    httpOnly,
    sameSiteStrict,
    sameSiteLax,
    sameSiteNone,
    sameSiteUnset,
    tracking,
    advertising,
    essential,
    functional,
    unknown,
    withPrefixes,
    prefixViolations,
    avgSecurityScore: total > 0 ? Math.round(totalSecurityScore / total) : 100,
    criticalIssues,
    topIssues: sortedIssues,
  };
}

export function detectCMP(input: ConsentAnalysisInput): CMPDetectionResult {
  const signals: string[] = [];
  let cmpType: CMPDetectionResult['cmpType'] = 'none';
  let cmpName: string | undefined;
  let iabTcfVersion: CMPDetectionResult['iabTcfVersion'] | undefined;

  // JS Global checks
  const globals = input.jsGlobals;
  const checkGlobal = (key: string) => globals[key] !== undefined && globals[key] !== null;

  if (checkGlobal('OneTrust') || checkGlobal('OptanonWrapper') || checkGlobal('OptanonActiveGroups')) {
    cmpType = 'onetrust'; cmpName = 'OneTrust'; signals.push('window.OneTrust detected');
  } else if (checkGlobal('CookieConsent') || checkGlobal('Cookiebot') || checkGlobal('CookiebotCallback')) {
    cmpType = 'cookiebot'; cmpName = 'Cookiebot'; signals.push('window.CookieConsent/Cookiebot detected');
  } else if (checkGlobal('Quantcast') || checkGlobal('__qca') || checkGlobal('__tcfapi')) {
    cmpType = 'quantcast'; cmpName = 'Quantcast Choice'; signals.push('window.Quantcast detected');
  } else if (checkGlobal('didomiOnReady') || checkGlobal('Didomi')) {
    cmpType = 'didomi'; cmpName = 'Didomi'; signals.push('window.Didomi detected');
  } else if (checkGlobal('_sp_') || checkGlobal('_sp_lib_globals')) {
    cmpType = 'sourcepoint'; cmpName = 'Sourcepoint'; signals.push('window._sp_ detected');
  } else if (checkGlobal('klaro')) {
    cmpType = 'klaro'; cmpName = 'Klaro'; signals.push('window.klaro detected');
  } else if (checkGlobal('tarteaucitron')) {
    cmpType = 'tarteaucitron'; cmpName = 'Tarteaucitron'; signals.push('window.tarteaucitron detected');
  }

  // IAB TCF detection from JS globals
  if (checkGlobal('__tcfapi')) {
    if (cmpType === 'none') cmpType = 'iab-tcf';
    iabTcfVersion = '2.0';
    signals.push('IAB TCF __tcfapi (v2.x) detected in window');
  } else if (checkGlobal('__cmp')) {
    if (cmpType === 'none') cmpType = 'iab-tcf';
    iabTcfVersion = '1.1';
    signals.push('IAB TCF __cmp (v1.1) detected in window');
  }

  // Upgrade version from real TCF API data
  let iabTcfData: IabTcfData | null = null;
  if (input.tcfApiData) {
    try {
      iabTcfData = parseTcfData(input.tcfApiData);
      // Merge version from real API response
      if (iabTcfData.version) iabTcfVersion = iabTcfData.version;
      if (iabTcfData.version === '2.2') signals.push('IAB TCF v2.2 confirmed via __tcfapi getTCData');
      else if (iabTcfData.version === '2.0') signals.push('IAB TCF v2.0 confirmed via __tcfapi getTCData');
      else if (iabTcfData.version === '1.1') signals.push('IAB TCF v1.1 confirmed via __cmp getConsentData');
      if (iabTcfData.cmpId) signals.push(`CMP ID: ${iabTcfData.cmpId} (from TCF register)`);
      if (iabTcfData.vendorCount > 0) signals.push(`${iabTcfData.vendorCount} vendors with consent`);
      // Add USP/GPP data
      if (input.uspString) {
        iabTcfData.uspString = input.uspString;
        signals.push(`US Privacy (CCPA) string detected: ${input.uspString}`);
      }
      iabTcfData.gppDetected = input.gppDetected ?? false;
      if (input.gppDetected) signals.push('IAB GPP (Global Privacy Platform) API detected');
    } catch {
      // TCF data parse error; skip
    }
  } else if (checkGlobal('__tcfapi') || checkGlobal('__cmp')) {
    // API present but call returned no data (e.g. banner not yet shown)
    iabTcfData = {
      version: iabTcfVersion ?? null,
      cmpId: null,
      cmpVersion: null,
      tcString: null,
      created: null,
      lastUpdated: null,
      purposes: IAB_TCF_PURPOSES.map(p => ({ ...p, hasConsent: null, hasLegitimateInterest: null })),
      specialFeatureOptins: {},
      vendorConsents: [],
      vendorLegitimateInterests: [],
      vendorCount: 0,
      publisherCC: null,
      isServiceSpecific: null,
      useNonStandardTexts: null,
      purposeOneTreatment: null,
      gdprApplies: null,
      uspString: input.uspString ?? null,
      gppDetected: input.gppDetected ?? false,
      apiCallSuccess: false,
    };
  }

  // Script URL patterns
  const scriptPatterns: Array<[RegExp, string, CMPDetectionResult['cmpType'], string?]> = [
    [/cdn\.cookielaw\.org/i, 'OneTrust CDN', 'onetrust'],
    [/consent\.cookiebot\.com/i, 'Cookiebot CDN', 'cookiebot'],
    [/cdn\.cookiepro\.com/i, 'CookiePro CDN', 'onetrust'],
    [/quantcast\.mgr\.consensu\.org/i, 'Quantcast CMP', 'quantcast'],
    [/cdn\.privacy-center\.org/i, 'Sourcepoint CDN', 'sourcepoint'],
    [/consent\.trustarc\.com/i, 'TrustArc', 'generic'],
    [/app\.termly\.io/i, 'Termly', 'generic'],
    [/cdn\.iubenda\.com/i, 'iubenda', 'generic'],
    [/cookies-eu-banner/i, 'cookies-eu-banner', 'generic'],
    [/usercentrics\.eu/i, 'Usercentrics', 'generic'],
    [/cookie-script\.com/i, 'Cookie-Script', 'generic'],
    [/cookiehub\.com/i, 'CookieHub', 'generic'],
    [/cookieyes\.com/i, 'CookieYes', 'generic'],
    [/borlabs-cookie/i, 'Borlabs Cookie', 'generic'],
    [/complianz\.io/i, 'Complianz', 'generic'],
    [/privacymanager\.io/i, 'PMP (Didomi)', 'didomi'],
    [/consentframework\.com/i, 'Consent Framework', 'generic'],
    [/mgr\.consensu\.org/i, 'IAB Consent Framework CDN', 'iab-tcf'],
  ];

  for (const [pattern, label, type] of scriptPatterns) {
    if (input.scriptUrls.some(u => pattern.test(u))) {
      if (cmpType === 'none') cmpType = type;
      signals.push(`${label} script detected`);
    }
  }

  // DOM pattern detection
  const domPatterns = [
    { re: /id=["'][^"']*cookie[^"']*banner/i, label: 'Cookie banner (#cookie-banner)' },
    { re: /id=["'][^"']*gdpr/i,                label: 'GDPR container (#gdpr)' },
    { re: /class=["'][^"']*consent/i,           label: 'Consent class (.consent)' },
    { re: /aria-label=["'][^"']*cookie/i,        label: 'Cookie banner (aria-label)' },
    { re: /id=["'][^"']*onetrust/i,              label: 'OneTrust container' },
    { re: /id=["'][^"']*Cookiebot/i,             label: 'Cookiebot container' },
    { re: /data-cookiebanner/i,                  label: 'data-cookiebanner attribute' },
    { re: /class=["'][^"']*cookie[^"']*notice/i, label: 'Cookie notice class' },
    { re: /class=["'][^"']*cc-[a-z]/i,           label: 'Cookie consent widget (cc-)' },
  ];
  const cookieBannerDetected = domPatterns.some(p => p.re.test(input.htmlContent));
  domPatterns.filter(p => p.re.test(input.htmlContent)).forEach(p => signals.push(p.label));

  // Consent cookies check
  const consentCookiePatterns = [
    /OptanonConsent/i, /cookieconsent_status/i, /klaro/i, /euconsent-v2/i,
    /CONSENT/i, /CookieConsent/i, /cmapi_cookie_privacy/i, /usprivacy/i,
  ];
  for (const cookie of input.cookies) {
    for (const pattern of consentCookiePatterns) {
      if (pattern.test(cookie.name)) {
        signals.push(`Consent cookie: ${cookie.name}`);
        break;
      }
    }
  }

  const hasCMP = cmpType !== 'none' || cookieBannerDetected;

  // Analytics/tracking before consent
  const trackingScripts = [
    'google-analytics', 'gtm.js', 'gtag', 'fbevents', 'hotjar',
    'mixpanel', 'segment.com', 'amplitude', 'heap.io', 'fullstory',
  ];
  const hasAnalytics = input.scriptUrls.some(u => trackingScripts.some(s => u.includes(s)));
  const analyticsBeforeConsent = hasAnalytics && !hasCMP;

  // Default consent state
  let defaultConsent: CMPDetectionResult['defaultConsent'] = 'none';
  if (hasCMP) {
    const consentCookieFound = input.cookies.some(c =>
      /OptanonConsent|euconsent/i.test(c.name) && c.domain
    );
    if (analyticsBeforeConsent) defaultConsent = 'opt-out'; // analytics loaded despite CMP
    else if (consentCookieFound) defaultConsent = 'opt-in';
    else defaultConsent = 'unclear';
  }

  // Cookie audit summary
  const cookieAudit = buildCookieAuditSummary(input.cookies);

  // GDPR scoring
  let gdprScore = 100;
  const gdprIssues: string[] = [];
  const gdprRecommendations: string[] = [];

  if (!hasCMP) {
    gdprScore -= 40;
    gdprIssues.push('No consent management platform detected');
    gdprRecommendations.push('Implement a GDPR-compliant CMP (OneTrust, Cookiebot, Klaro, or similar)');
  }
  if (analyticsBeforeConsent) {
    gdprScore -= 30;
    gdprIssues.push('Tracking/analytics scripts loaded before user consent — GDPR Article 7 violation');
    gdprRecommendations.push('Use your CMP to block analytics scripts until consent is granted');
  }
  if (hasCMP && !iabTcfVersion) {
    gdprScore -= 10;
    gdprRecommendations.push('Adopt IAB TCF v2.2 for standardized, interoperable consent signaling');
  }
  if (iabTcfData && iabTcfData.apiCallSuccess && iabTcfData.version) {
    // Check if purpose 1 (storage access) has consent
    const p1 = iabTcfData.purposes.find(p => p.id === 1);
    if (p1 && p1.hasConsent === false) {
      signals.push('TCF Purpose 1 (storage) consent = false');
    }
    // Version upgrade recommendation
    if (iabTcfData.version === '2.0') {
      gdprRecommendations.push('Upgrade from TCF v2.0 to v2.2 — v2.2 adds restrictions for profiling and political ads');
    }
  }

  const trackingCookieCount = input.cookies.filter(c =>
    /(_ga|_fbp|_hjid|ttq|mp_|_gcl)/i.test(c.name)
  ).length;
  if (trackingCookieCount > 0 && !hasCMP) {
    gdprScore -= Math.min(20, trackingCookieCount * 5);
    gdprIssues.push(`${trackingCookieCount} tracking cookie${trackingCookieCount > 1 ? 's' : ''} set without a consent mechanism`);
  }
  if (cookieAudit.criticalIssues > 0) {
    gdprScore -= Math.min(10, cookieAudit.criticalIssues * 2);
    gdprIssues.push(`${cookieAudit.criticalIssues} cookie${cookieAudit.criticalIssues > 1 ? 's' : ''} with critical security/compliance issues`);
  }
  if (cookieAudit.prefixViolations > 0) {
    gdprScore -= 5;
    gdprRecommendations.push(`Fix ${cookieAudit.prefixViolations} cookie prefix violation${cookieAudit.prefixViolations > 1 ? 's' : ''} (__Host-, __Secure-)`);
  }

  return {
    hasCMP,
    cmpName,
    cmpType,
    iabTcfVersion,
    iabTcfCompliant: !!(cmpType === 'iab-tcf' || iabTcfVersion || (iabTcfData?.apiCallSuccess && iabTcfData.version)),
    iabTcfData,
    cookieBannerDetected,
    defaultConsent,
    analyticsBeforeConsent,
    consentSignals: signals,
    gdprScore: Math.max(0, gdprScore),
    gdprIssues,
    gdprRecommendations,
    cookieAudit,
  };
}

export function detectBotProtection(input: {
  headers: Record<string, string>;
  jsGlobals: Record<string, unknown>;
  scriptUrls: string[];
  htmlContent: string;
  networkRequests: Array<{ url: string }>;
}): BotProtectionResult {
  const providers: BotProtectionResult['providers'] = [];

  const checkGlobal = (key: string) => input.jsGlobals[key] !== undefined;

  // Cloudflare Turnstile
  if (input.scriptUrls.some(u => /challenges\.cloudflare\.com/i.test(u)) || checkGlobal('turnstile')) {
    providers.push({ name: 'Cloudflare Turnstile', type: 'challenge', confidence: 95, detectedVia: 'script-url' });
  }

  // reCAPTCHA
  if (input.scriptUrls.some(u => /google\.com\/recaptcha/i.test(u)) || checkGlobal('grecaptcha')) {
    const isV3 = input.htmlContent.includes('grecaptcha.execute') || input.scriptUrls.some(u => u.includes('render='));
    providers.push({ name: `Google reCAPTCHA v${isV3 ? '3' : '2'}`, type: 'captcha', confidence: 98, detectedVia: 'script-url' });
  }

  // hCaptcha
  if (input.scriptUrls.some(u => /js\.hcaptcha\.com/i.test(u)) || checkGlobal('hcaptcha')) {
    providers.push({ name: 'hCaptcha', type: 'captcha', confidence: 98, detectedVia: 'script-url' });
  }

  // Arkose Labs
  if (input.scriptUrls.some(u => /arkoselabs\.com/i.test(u)) || checkGlobal('ArkoseEnforcement')) {
    providers.push({ name: 'Arkose Labs', type: 'challenge', confidence: 95, detectedVia: 'script-url' });
  }

  // DataDome
  if (checkGlobal('ddjskey') || input.scriptUrls.some(u => /datadome\.com/i.test(u))) {
    providers.push({ name: 'DataDome', type: 'fingerprinting', confidence: 95, detectedVia: 'js-globals' });
  }

  // PerimeterX / HUMAN
  if (checkGlobal('_pxAppId') || input.scriptUrls.some(u => /perimeterx\.net/i.test(u))) {
    providers.push({ name: 'PerimeterX (HUMAN)', type: 'fingerprinting', confidence: 95, detectedVia: 'js-globals' });
  }

  // AWS WAF CAPTCHA
  if (checkGlobal('AwsWafIntegration') || input.scriptUrls.some(u => /d38z0b5rqyp9sb\.cloudfront/i.test(u))) {
    providers.push({ name: 'AWS WAF CAPTCHA', type: 'challenge', confidence: 90, detectedVia: 'script-url' });
  }

  // Akamai Bot Manager
  if (input.headers['x-akamai-bot-manager-result'] || input.headers['x-check-cacheable']) {
    providers.push({ name: 'Akamai Bot Manager', type: 'waf', confidence: 85, detectedVia: 'http-headers' });
  }

  // Imperva
  if (input.headers['x-iinfo'] || input.headers['x-cdn']?.includes('Incapsula')) {
    providers.push({ name: 'Imperva (Incapsula)', type: 'waf', confidence: 90, detectedVia: 'http-headers' });
  }

  // SRI analysis
  const externalScriptPattern = /<script[^>]+src=["']https?:\/\/[^"']+["'][^>]*>/gi;
  const externalScripts = input.htmlContent.match(externalScriptPattern) ?? [];
  const scriptsWithSri = externalScripts.filter(s => s.includes('integrity=')).length;

  // Rate limit headers
  const rateLimitHeaders: Record<string, string> = {};
  const rlHeaderNames = ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'ratelimit-policy', 'ratelimit', 'retry-after'];
  let rateLimitingDetected = false;
  for (const h of rlHeaderNames) {
    if (input.headers[h]) {
      rateLimitHeaders[h] = input.headers[h];
      rateLimitingDetected = true;
    }
  }

  // CSRF detection
  const csrfDetected =
    /name=["']csrf[-_]?token["']/i.test(input.htmlContent) ||
    /meta[^>]+name=["']csrf[-_]?token["']/i.test(input.htmlContent) ||
    !!input.headers['x-csrf-token'] ||
    !!input.headers['x-xsrf-token'];

  const formSecurityScore = Math.round(
    (csrfDetected ? 40 : 0) +
    (rateLimitingDetected ? 30 : 0) +
    (providers.length > 0 ? 30 : 0)
  );

  return {
    detected: providers.length > 0,
    providers,
    sriCoverage: {
      externalScripts: externalScripts.length,
      withSri: scriptsWithSri,
      withoutSri: externalScripts.length - scriptsWithSri,
      percentage: externalScripts.length > 0 ? Math.round((scriptsWithSri / externalScripts.length) * 100) : 100,
    },
    rateLimitingDetected,
    rateLimitHeaders,
    csrfProtection: csrfDetected,
    formSecurityScore,
  };
}

export function analyzeSustainability(input: {
  htmlContent: string;
  networkRequests: Array<{ url: string; type: string; transferSize: number; fromCache: boolean; cacheControl?: string; contentEncoding?: string }>;
  scriptUrls: string[];
  linkUrls: string[];
  jsCoverage?: { totalBytes: number; unusedBytes: number };
  thirdPartyDomains: string[];
  resourceBreakdown: { javascript: { transferSize: number }; total: { transferSize: number } };
}): SustainabilityAuditResult {
  // Autoplay videos
  const autoplayMatches = input.htmlContent.match(/<video[^>]*autoplay[^>]*>/gi) ?? [];
  const autoplayUrls: string[] = [];
  const videoRequests = input.networkRequests.filter(r => r.type === 'video');
  const autoplayEstBytes = videoRequests.reduce((s, r) => s + r.transferSize, 0);

  // Animated GIFs
  const gifRequests = input.networkRequests.filter(r => r.url.endsWith('.gif') || r.url.includes('.gif?'));
  const gifBytes = gifRequests.reduce((s, r) => s + r.transferSize, 0);

  // Image format audit
  const imageRequests = input.networkRequests.filter(r => r.type === 'images');
  const imgCounts = { jpeg: 0, png: 0, webp: 0, avif: 0, svg: 0, gif: 0 };
  for (const req of imageRequests) {
    const url = req.url.toLowerCase();
    if (url.includes('.jpg') || url.includes('.jpeg')) imgCounts.jpeg++;
    else if (url.includes('.png')) imgCounts.png++;
    else if (url.includes('.webp')) imgCounts.webp++;
    else if (url.includes('.avif')) imgCounts.avif++;
    else if (url.includes('.svg')) imgCounts.svg++;
    else if (url.includes('.gif')) imgCounts.gif++;
  }
  const totalImages = Object.values(imgCounts).reduce((a, b) => a + b, 0);
  const modernImages = imgCounts.webp + imgCounts.avif + imgCounts.svg;
  const modernFormatPercentage = totalImages > 0 ? Math.round((modernImages / totalImages) * 100) : 100;

  // Images without srcset (estimate from HTML)
  const imgWithoutSrcset = (input.htmlContent.match(/<img(?![^>]*srcset)[^>]*>/gi) ?? []).length;
  const imgWithoutDimensions = (input.htmlContent.match(/<img(?!(?:[^>]*(?:width|height))){2}[^>]*>/gi) ?? []).length;

  const legacyImageBytes = imageRequests
    .filter(r => r.url.match(/\.(jpg|jpeg|png)(\?|$)/i))
    .reduce((s, r) => s + r.transferSize, 0);
  const estimatedSavingBytes = Math.round(legacyImageBytes * 0.3);

  // Infinite scroll detection
  const infiniteScrollDetected = input.htmlContent.includes('IntersectionObserver') ||
    input.htmlContent.includes('infinite-scroll') ||
    input.htmlContent.includes('data-infinite') ||
    /class=["'][^"']*(infinite|load-more)/i.test(input.htmlContent);

  // Self-hosted fonts
  const externalFontDomains = [...new Set(
    input.networkRequests
      .filter(r => r.type === 'fonts' || r.url.includes('fonts.googleapis') || r.url.includes('typekit'))
      .map(r => { try { return new URL(r.url).hostname; } catch { return ''; } })
      .filter(Boolean)
  )];
  const fontRequests = input.networkRequests.filter(r => r.type === 'fonts');
  const selfHostedFontCount = fontRequests.filter(r => {
    try { return externalFontDomains.length === 0; } catch { return false; }
  }).length;
  const selfHostedFontPct = fontRequests.length > 0
    ? Math.round((selfHostedFontCount / fontRequests.length) * 100)
    : 100;

  // Cache efficiency
  const allRequests = input.networkRequests;
  const immutable = allRequests.filter(r => r.cacheControl?.includes('immutable')).length;
  const longCache = allRequests.filter(r => {
    const match = r.cacheControl?.match(/max-age=(\d+)/);
    return match && parseInt(match[1]) >= 86400;
  }).length;
  const noCache = allRequests.filter(r =>
    r.cacheControl?.includes('no-store') || r.cacheControl?.includes('no-cache')
  ).length;
  const total = allRequests.length || 1;
  const immutablePct = Math.round((immutable / total) * 100);
  const longCachePct = Math.round((longCache / total) * 100);
  const noCachePct = Math.round((noCache / total) * 100);
  const cacheScore = Math.min(100, Math.round(immutablePct * 0.5 + longCachePct * 0.3 + (100 - noCachePct) * 0.2));

  // Estimate returning visitor savings
  const staticBytes = allRequests
    .filter(r => ['javascript', 'css', 'fonts', 'images'].includes(r.type))
    .reduce((s, r) => s + r.transferSize, 0);
  const estReturnSaving = Math.round(staticBytes * (longCachePct / 100) * 0.5);

  // Resource hints
  const preloads = input.linkUrls.filter(u => u.includes('rel=preload') || input.htmlContent.includes(`rel="preload"`));
  const preconnects = (input.htmlContent.match(/<link[^>]*rel=["']preconnect["'][^>]*>/gi) ?? []).length;
  const prefetches = (input.htmlContent.match(/<link[^>]*rel=["']prefetch["'][^>]*>/gi) ?? []).length;
  const specRules = (input.htmlContent.match(/<script[^>]*type=["']speculationrules["'][^>]*>/gi) ?? []).length;

  const preloadedLcp = input.htmlContent.includes('fetchpriority="high"') || input.htmlContent.includes("fetchpriority='high'");

  // Missing preconnects for known third parties
  const missingPreconnects = externalFontDomains.filter(d =>
    !input.htmlContent.includes(d)
  );

  // Tracking pixels
  const trackingPixelPatterns = [
    { pattern: /facebook\.com\/tr/i, name: 'Facebook Pixel', purpose: 'advertising' },
    { pattern: /analytics\.tiktok\.com\/i18n\/pixel\/events/i, name: 'TikTok Pixel', purpose: 'advertising' },
    { pattern: /bat\.bing\.com\/action/i, name: 'Microsoft Ads Pixel', purpose: 'advertising' },
    { pattern: /t\.co\/i\/adsct/i, name: 'Twitter Pixel', purpose: 'advertising' },
    { pattern: /sc-static\.net\/scevent\.min\.js/i, name: 'Snapchat Pixel', purpose: 'advertising' },
    { pattern: /ct\.pinterest\.com/i, name: 'Pinterest Tag', purpose: 'advertising' },
    { pattern: /doubleclick\.net\/pagead\/viewthroughconversion/i, name: 'Google Ads Conversion', purpose: 'advertising' },
    { pattern: /linkedin\.com\/px/i, name: 'LinkedIn Insight Tag', purpose: 'advertising' },
  ];
  const pixelDetails = input.networkRequests
    .filter(r => trackingPixelPatterns.some(p => p.pattern.test(r.url)))
    .map(r => {
      const match = trackingPixelPatterns.find(p => p.pattern.test(r.url));
      return { name: match?.name ?? 'Unknown Pixel', url: r.url.slice(0, 80), purpose: match?.purpose ?? 'tracking' };
    })
    .slice(0, 20);

  // JS bloat
  const jsKb = Math.round((input.resourceBreakdown.javascript.transferSize) / 1024);
  const unusedJsPct = input.jsCoverage
    ? Math.round((input.jsCoverage.unusedBytes / (input.jsCoverage.totalBytes || 1)) * 100)
    : 0;
  const budgetKb = 150;
  const budgetExceeded = Math.max(0, jsKb - budgetKb);

  // Duplicate libraries detection
  const libPatterns = [
    { pattern: /moment\.js|moment\.min/, name: 'Moment.js' },
    { pattern: /dayjs\.min|dayjs\//, name: 'Day.js' },
    { pattern: /lodash\.min|lodash\//, name: 'Lodash' },
    { pattern: /underscore\.min/, name: 'Underscore.js' },
    { pattern: /jquery\.min|jquery-\d/, name: 'jQuery' },
    { pattern: /zepto\.min/, name: 'Zepto' },
  ];
  const detectedLibs = libPatterns
    .filter(p => input.networkRequests.some(r => p.pattern.test(r.url)))
    .map(p => p.name);
  const duplicateLibs: string[] = [];
  if (detectedLibs.includes('Moment.js') && detectedLibs.includes('Day.js')) duplicateLibs.push('Moment.js + Day.js (duplicate date libs)');
  if (detectedLibs.includes('Lodash') && detectedLibs.includes('Underscore.js')) duplicateLibs.push('Lodash + Underscore.js (duplicate utility libs)');
  if (detectedLibs.includes('jQuery') && detectedLibs.includes('Zepto')) duplicateLibs.push('jQuery + Zepto (duplicate jQuery-like libs)');

  // Image CDN detection
  const imageCdnPatterns: Array<[RegExp, string]> = [
    [/res\.cloudinary\.com|cloudinary\.com\//, 'Cloudinary'],
    [/imgix\.net/, 'Imgix'],
    [/images\.ctfassets\.net/, 'Contentful Images'],
    [/cdn\.sanity\.io/, 'Sanity CDN'],
    [/\/_next\/image/, 'Vercel Image Optimization'],
    [/images\.prismic\.io/, 'Prismic Images'],
    [/images\.storyblok\.com/, 'Storyblok Images'],
    [/bunny\.net|b-cdn\.net/, 'Bunny CDN'],
    [/fly\.io\/storage/, 'Fly.io'],
    [/imagekit\.io/, 'ImageKit'],
  ];
  let imageCdnDetected = false;
  let imageCdnName: string | undefined;
  for (const [pat, name] of imageCdnPatterns) {
    if (input.networkRequests.some(r => pat.test(r.url))) {
      imageCdnDetected = true; imageCdnName = name; break;
    }
  }
  const imageCdnScore = imageCdnDetected ? 85 : modernFormatPercentage;

  // Overall sustainability score
  const sustainScore = Math.round(
    (cacheScore * 0.25) +
    (modernFormatPercentage * 0.20) +
    (Math.max(0, 100 - unusedJsPct) * 0.20) +
    (selfHostedFontPct * 0.15) +
    (imageCdnScore * 0.10) +
    ((autoplayMatches.length === 0 ? 100 : Math.max(0, 100 - autoplayMatches.length * 20)) * 0.10)
  );

  const sustainGrade =
    sustainScore >= 90 ? 'A+' : sustainScore >= 80 ? 'A' : sustainScore >= 70 ? 'B' :
    sustainScore >= 60 ? 'C' : sustainScore >= 40 ? 'D' : sustainScore >= 20 ? 'E' : 'F';

  return {
    autoplayVideos: { count: autoplayMatches.length, totalEstimatedBytes: autoplayEstBytes, urls: autoplayUrls },
    animatedGifs: { count: gifRequests.length, totalBytes: gifBytes, estimatedWebmSavingBytes: Math.round(gifBytes * 0.85), urls: gifRequests.map(r => r.url).slice(0, 10) },
    imageFormatAudit: {
      jpegCount: imgCounts.jpeg, pngCount: imgCounts.png, webpCount: imgCounts.webp,
      avifCount: imgCounts.avif, svgCount: imgCounts.svg, modernFormatPercentage,
      imagesWithoutSrcset: imgWithoutSrcset, imagesWithoutDimensions: imgWithoutDimensions,
      estimatedSavingBytes,
    },
    infiniteScroll: { detected: infiniteScrollDetected, loadMoreTriggers: infiniteScrollDetected ? 1 : 0 },
    selfHostedFonts: { percentage: selfHostedFontPct, externalFontDomains },
    cacheEfficiency: {
      immutableAssetsPercentage: immutablePct, longCacheAssetsPercentage: longCachePct,
      noCacheAssetsPercentage: noCachePct, estimatedReturnVisitorSavingBytes: estReturnSaving, score: cacheScore,
    },
    resourceHints: {
      preloadedLcp, preconnectedThirdParties: preconnects, prefetchedPages: prefetches + specRules,
      totalPreloads: (input.htmlContent.match(/<link[^>]*rel=["']preload["'][^>]*>/gi) ?? []).length,
      missingPreconnects,
    },
    unnecessaryTracking: {
      trackingPixelCount: pixelDetails.length,
      estimatedCo2SaveG: pixelDetails.length * 0.002,
      pixelDetails,
    },
    javascriptBloat: {
      totalKb: jsKb, unusedPercentage: unusedJsPct, duplicateLibraries: duplicateLibs, budgetExceededKb: budgetExceeded,
    },
    imageCdnDetected, imageCdnName, imageCdnScore,
    overallSustainabilityScore: Math.round(sustainScore),
    sustainabilityGrade: sustainGrade,
  };
}

export function analyzeAccessibilityExtended(input: {
  htmlContent: string;
  cssContent?: string;
}): Omit<AccessibilityExtendedResult, 'touchTargets' | 'colorPalette' | 'contrastIssueCount'> {
  // Zoom lock
  const viewportMeta = input.htmlContent.match(/<meta[^>]*name=["']viewport["'][^>]*content=["']([^"']*)["']/i)?.[1] ?? '';
  const zoomLockDetected = /user-scalable\s*=\s*no/i.test(viewportMeta) || /maximum-scale\s*=\s*1[^.]/i.test(viewportMeta);

  // Skip navigation
  const skipNavigation = /<a[^>]+href=["']#(?:main|content|skip)[^"']*["'][^>]*>/i.test(input.htmlContent) ||
    /<a[^>]+class=["'][^"']*skip[^"']*["'][^>]*>/i.test(input.htmlContent);

  // Focus indicators removed
  const cssContent = input.cssContent ?? input.htmlContent;
  const focusIndicatorsRemoved = /:focus\s*\{[^}]*outline\s*:\s*(?:none|0)\s*[;}/]/i.test(cssContent) &&
    !/:focus-visible/i.test(cssContent);

  // Landmark roles
  const landmarkRoles = {
    main: (input.htmlContent.match(/<main[\s>]/gi) ?? []).length,
    nav: (input.htmlContent.match(/<nav[\s>]/gi) ?? []).length,
    header: (input.htmlContent.match(/<header[\s>]/gi) ?? []).length,
    footer: (input.htmlContent.match(/<footer[\s>]/gi) ?? []).length,
    aside: (input.htmlContent.match(/<aside[\s>]/gi) ?? []).length,
    search: (input.htmlContent.match(/role=["']search["']/gi) ?? []).length,
    form: (input.htmlContent.match(/<form[\s>]/gi) ?? []).length,
  };

  // ARIA live regions
  const ariaLiveRegions = {
    polite: (input.htmlContent.match(/aria-live=["']polite["']/gi) ?? []).length,
    assertive: (input.htmlContent.match(/aria-live=["']assertive["']/gi) ?? []).length,
    alert: (input.htmlContent.match(/role=["']alert["']/gi) ?? []).length,
    status: (input.htmlContent.match(/role=["']status["']/gi) ?? []).length,
  };

  // Form label coverage (estimate from HTML)
  const inputCount = (input.htmlContent.match(/<input(?!.*type=["'](?:hidden|submit|button|reset|checkbox|radio)["'])[^>]*>/gi) ?? []).length;
  const labeledCount = (input.htmlContent.match(/<label[^>]*for=/gi) ?? []).length +
    (input.htmlContent.match(/aria-label=/gi) ?? []).length +
    (input.htmlContent.match(/aria-labelledby=/gi) ?? []).length;
  const withLabel = Math.min(inputCount, labeledCount);
  const withoutLabel = Math.max(0, inputCount - withLabel);

  // Media accessibility
  const videoCount = (input.htmlContent.match(/<video/gi) ?? []).length;
  const videoWithCaptions = (input.htmlContent.match(/<track[^>]*kind=["']captions["']/gi) ?? []).length;
  const audioCount = (input.htmlContent.match(/<audio/gi) ?? []).length;
  const imagesWithoutAlt = (input.htmlContent.match(/<img(?![^>]*alt=)[^>]*>/gi) ?? []).length;

  return {
    zoomLockDetected,
    skipNavigation,
    focusIndicatorsRemoved,
    landmarkRoles,
    ariaLiveRegions,
    formLabelCoverage: {
      withLabel,
      withoutLabel,
      percentage: inputCount > 0 ? Math.round((withLabel / inputCount) * 100) : 100,
    },
    mediaAccessibility: {
      videoWithoutCaptions: Math.max(0, videoCount - videoWithCaptions),
      audioWithoutTranscript: audioCount,
      imagesWithoutAlt,
    },
  };
}

export function detectModernWebAPIs(input: {
  htmlContent: string;
  jsGlobals: Record<string, unknown>;
  networkRequests: Array<{ url: string; type: string; fromCache: boolean }>;
  cookies: Array<{ name: string }>;
}): Partial<ModernWebAPIsResult> {
  const html = input.htmlContent;

  // Fetch Priority / Priority Hints
  const fetchPriorityHigh = (html.match(/fetchpriority=["']high["']/gi) ?? []).length;
  const fetchPriorityLow = (html.match(/fetchpriority=["']low["']/gi) ?? []).length;

  // Speculation Rules
  const specRulesMatch = html.match(/<script[^>]*type=["']speculationrules["'][^>]*>([\s\S]*?)<\/script>/i);
  let specPrefetch: string[] = [];
  let specPrerender: string[] = [];
  if (specRulesMatch) {
    try {
      const rules = JSON.parse(specRulesMatch[1]) as { prefetch?: Array<{ urls?: string[] }>; prerender?: Array<{ urls?: string[] }> };
      specPrefetch = rules.prefetch?.flatMap(r => r.urls ?? []) ?? [];
      specPrerender = rules.prerender?.flatMap(r => r.urls ?? []) ?? [];
    } catch { /* ignore */ }
  }

  // Import Maps
  const importMapMatch = html.match(/<script[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i);
  let importMappings: Record<string, string> | undefined;
  if (importMapMatch) {
    try {
      const parsed = JSON.parse(importMapMatch[1]) as { imports?: Record<string, string> };
      importMappings = parsed.imports;
    } catch { /* ignore */ }
  }

  // BFCache disqualifiers
  const bfcacheDisqualifiers: string[] = [];
  if (html.includes('unload')) bfcacheDisqualifiers.push('unload event listener (prevents BFCache)');
  if (html.match(/Cache-Control.*no-store/i)) bfcacheDisqualifiers.push('Cache-Control: no-store');
  if (html.includes('window.opener')) bfcacheDisqualifiers.push('window.opener reference');
  const bfcacheScore = Math.max(0, 100 - bfcacheDisqualifiers.length * 25);

  // Trusted Types
  const trustedTypes = /require-trusted-types-for/i.test(
    Object.values(input.jsGlobals).join(' ')
  ) || html.includes('require-trusted-types-for');

  return {
    fetchPriority: {
      hasLcpImagePreload: fetchPriorityHigh > 0,
      fetchPriorityHighCount: fetchPriorityHigh,
      fetchPriorityLowCount: fetchPriorityLow,
      missingOnLcp: fetchPriorityHigh === 0,
    },
    speculationRules: {
      detected: !!specRulesMatch,
      ruleCount: specPrefetch.length + specPrerender.length,
      prefetchUrls: specPrefetch,
      prerenderUrls: specPrerender,
    },
    importMaps: {
      detected: !!importMapMatch,
      mappingCount: Object.keys(importMappings ?? {}).length,
      mappings: importMappings,
    },
    viewTransitions: {
      detected: html.includes('startViewTransition') || html.includes('@view-transition'),
    },
    bfCacheEligibility: {
      eligible: bfcacheDisqualifiers.length === 0,
      disqualifiers: bfcacheDisqualifiers,
      score: bfcacheScore,
    },
    schedulerApi: input.jsGlobals['scheduler'] !== undefined,
    navigationApi: input.jsGlobals['navigation'] !== undefined,
    declarativeShadowDom: html.includes('shadowrootmode'),
    trustedTypes,
    broadcastChannel: html.includes('BroadcastChannel'),
  };
}
