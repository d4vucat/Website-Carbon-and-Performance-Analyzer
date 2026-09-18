// Core Types for Website Carbon & Performance Analyzer

export interface AnalyzeOptions {
  userAgent?: string;
  viewport?: { width: number; height: number };
  device?: 'desktop' | 'mobile' | 'both';
  waitUntil?: 'networkidle' | 'domcontentloaded' | 'load';
  waitAfterLoad?: number;
  includeScreenshot?: boolean;
  includeLighthouse?: boolean;
  includeAccessibility?: boolean;
  monthlyVisits?: number;
  newVisitorRatio?: number;
  carbonModel?: 'swd' | 'onebyte' | 'hybrid';
}

export type JobStatus = 'queued' | 'running' | 'done' | 'error';
export type Phase = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Job {
  id: string;
  url: string;
  status: JobStatus;
  phase: Phase;
  progress: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  result?: AnalysisResult;
  options: AnalyzeOptions;
}

export interface MetricResult {
  value: number;
  unit: string;
  rating: 'good' | 'needs-improvement' | 'poor';
  displayValue: string;
}

export interface ResourceBreakdown {
  html: ResourceStats;
  javascript: ResourceStats;
  css: ResourceStats;
  images: ResourceStats;
  fonts: ResourceStats;
  video: ResourceStats;
  xhr: ResourceStats;
  other: ResourceStats;
  total: ResourceStats;
}

export interface ResourceStats {
  count: number;
  transferSize: number;
  decodedSize: number;
  co2Grams?: number;
}

export interface CarbonEquivalents {
  kettleBoils: number;
  smartphoneCharges: number;
  ledBulbHours: number;
  carKm: number;
  flightKm: number;
  treeYearPercent: number;
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  category: 'carbon' | 'performance' | 'security' | 'accessibility' | 'seo';
  impact: 'high' | 'medium' | 'low';
  estimatedCo2SaveG?: number;
  estimatedPerfSaveMs?: number;
  estimatedSizesSaveBytes?: number;
  codeSnippet?: string;
  references?: string[];
}

export interface TechnologyMatch {
  name: string;
  slug: string;
  version?: string;
  confidence: number;
  category: string;
  detectedVia: string[];
  website?: string;
  isTracking?: boolean;
  gdprCategory?: 'essential' | 'functional' | 'tracking' | 'advertising';
}

export interface ThirdPartyProvider {
  name: string;
  category: string;
  domains: string[];
  requestCount: number;
  transferSize: number;
  mainThreadTime?: number;
  blockingTime?: number;
  co2Grams: number;
  gdprCategory: 'essential' | 'functional' | 'tracking' | 'advertising';
  cookiesDropped: string[];
  privacySafeAlternative?: string;
}

export interface SecurityHeaderAnalysis {
  hsts: HeaderResult;
  csp: HeaderResult & { directives?: Record<string, string[]> };
  xFrameOptions: HeaderResult;
  xContentTypeOptions: HeaderResult;
  referrerPolicy: HeaderResult;
  permissionsPolicy: HeaderResult;
  coep: HeaderResult;
  coop: HeaderResult;
  corp: HeaderResult;
  xxssProtection: HeaderResult;
  grade: string;
  score: number;
}

export interface HeaderResult {
  present: boolean;
  value?: string;
  score: number;
  grade: string;
  issues: string[];
  recommendations: string[];
}

export interface CertificateInfo {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  daysUntilExpiry: number;
  algorithm: string;
  fingerprint: string;
  sans: string[];
  isWildcard: boolean;
  isEV: boolean;
}

export interface DNSAnalysis {
  a: string[];
  aaaa: string[];
  mx: Array<{ exchange: string; priority: number }>;
  ns: string[];
  txt: string[];
  cname?: string;
  soa?: {
    primary: string;
    admin: string;
    serial: number;
    refresh: number;
    retry: number;
    expire: number;
    minttl: number;
  };
  caa?: Array<{ critical: number; issue?: string; issuewild?: string; iodef?: string }>;
  resolvedAt: string;
  dnsProvider?: string;
  emailProvider?: string;
}

export interface WHOISInfo {
  // Registrar
  registrar?: string;
  registrarUrl?: string;
  registrarIanaId?: string;
  registrarAbuseEmail?: string;
  registrarAbusePhone?: string;
  // Dates
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
  daysUntilExpiry?: number;
  // Domain identity
  domainHandle?: string;       // Registry handle / registry domain ID
  nameservers: string[];
  statusCodes: string[];
  isRegistryLocked: boolean;
  // Registrant (often redacted for privacy-protected domains)
  registrantName?: string;
  registrantEmail?: string;
  registrantPhone?: string;
  // Technical contact
  techName?: string;
  techEmail?: string;
  // DNSSEC
  dnssecSigned?: boolean;
  dnssecDsRecords?: string[];  // "keyTag algorithm digestType digest" strings
  // Meta
  rdapUrl?: string;            // Canonical RDAP self-link
  remarks?: string[];          // Registry remarks / notices
  source?: 'rdap' | 'whoisjson';
}

export interface NetworkRequest {
  url: string;
  type: string;
  method: string;
  status: number;
  protocol?: string;
  fromCache: boolean;
  transferSize: number;
  decodedSize: number;
  contentEncoding?: string;
  compressionRatio?: number;
  cacheControl?: string;
  domain: string;
  isThirdParty: boolean;
  isCdn: boolean;
  timing: {
    startTime: number;
    ttfb?: number;
    downloadTime?: number;
    totalDuration: number;
    dns?: number;
    ssl?: number;
    connection?: number;
    wait?: number;
  };
}

export interface LighthouseOpportunity {
  id: string;
  title: string;
  description: string;
  displayValue?: string;
  score: number | null;
  savings?: {
    bytes?: number;
    ms?: number;
    wastedBytes?: number;
  };
  items?: Array<{
    url?: string;
    totalBytes?: number;
    wastedBytes?: number;
    wastedMs?: number;
  }>;
}

export interface AxeViolation {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  help: string;
  helpUrl: string;
  wcagCriteria: string[];
  nodes: Array<{
    html: string;
    target: string[];
    failureSummary: string;
  }>;
}

export interface WebAppManifest {
  name?: string;
  shortName?: string;
  description?: string;
  themeColor?: string;
  backgroundColor?: string;
  display?: string;
  orientation?: string;
  startUrl?: string;
  icons: Array<{ src: string; sizes: string; type?: string; purpose?: string }>;
  hasRequiredIcons: boolean;
  hasMaskableIcon: boolean;
  shortcuts?: Array<{ name: string; url: string }>;
}

export interface ServiceWorkerInfo {
  registrationPath: string;
  scope: string;
  scriptUrl: string;
  usesWorkbox: boolean;
  cachingStrategy?: string;
}

export interface FilmstripFrame {
  timestamp: number;
  screenshot: string; // base64
  visualProgress?: number;
}

export interface CarbonScores {
  swd: number;
  onebyte: number;
  hybrid: number;
  grade: string;
  greenHosting: boolean;
  greenHostingProvider?: string;
  gridIntensity: number;
  serverLocation: { country: string; countryCode: string; region?: string };
  annualCo2Kg?: number;
}

export interface PerformanceResult {
  lighthouseScore: number;
  accessibilityScore: number;
  bestPracticesScore: number;
  seoScore: number;
  webVitals: {
    lcp: MetricResult;
    inp: MetricResult;
    cls: MetricResult;
    fcp: MetricResult;
    ttfb: MetricResult;
    tbt: MetricResult;
    tti: MetricResult;
    speedIndex: MetricResult;
  };
  opportunities: LighthouseOpportunity[];
  resourceSummary: ResourceBreakdown;
  screenshots?: string[];
  filmstrip?: FilmstripFrame[];
  networkRequests: NetworkRequest[];
  jsCoverage?: { totalBytes: number; usedBytes: number; unusedBytes: number };
  cssCoverage?: { totalBytes: number; usedBytes: number; unusedBytes: number };
  consoleErrors: number;
  consoleWarnings: number;
  longTasks: Array<{ duration: number; attribution?: string }>;
}

export interface SEOAnalysis {
  title: string;
  titleLength: number;
  description: string;
  descriptionLength: number;
  canonical?: string;
  hreflang?: Array<{ lang: string; href: string }>;
  ogCompleteness: number;
  ogTags: Record<string, string>;
  twitterCardCompleteness: number;
  twitterTags: Record<string, string>;
  sitemapFound: boolean;
  sitemapUrls: string[];
  robotsTxtFound: boolean;
  robotsTxtContent?: string;
  structuredDataTypes: string[];
  headingStructure: { h1: number; h2: number; h3: number; h4: number; h5: number; h6: number };
  imageAltMissing: number;
  lighthouse: number;
}

export interface AnalysisResult {
  meta: {
    url: string;
    finalUrl: string;
    timestamp: string;
    durationMs: number;
    analyzerVersion: string;
    jobId: string;
  };

  scores: {
    carbon: { grade: string; co2PerViewG: number; annualEstimateKg?: number };
    performance: { score: number; grade: string };
    security: { score: number; grade: string };
    accessibility: { score: number; grade: string };
    seo: { score: number; grade: string };
    composite: { score: number; grade: string };
  };

  carbon: {
    models: CarbonScores;
    transferSizeBytes: number;
    decodedSizeBytes: number;
    resourceBreakdown: ResourceBreakdown;
    thirdPartyCo2G: number;
    firstPartyCo2G: number;
    equivalents: CarbonEquivalents;
    recommendations: Recommendation[];
  };

  performance: PerformanceResult;

  technologies: {
    detected: TechnologyMatch[];
    summary: {
      cms?: string;
      framework?: string;
      language?: string;
      server?: string;
      hosting?: string;
      cdn?: string;
      analytics: string[];
      tagManagers: string[];
      chatWidgets: string[];
      errorTracking: string[];
      abTesting: string[];
    };
  };

  security: {
    score: number;
    grade: string;
    headers: SecurityHeaderAnalysis;
    https: boolean;
    hstsPreloaded: boolean;
    tlsVersion: string;
    certificate?: CertificateInfo;
    mixedContent: boolean;
    vulnerableLibraries: Array<{ name: string; version: string; cves: string[] }>;
  };

  thirdParties: ThirdPartyProvider[];

  http: {
    redirectChain: Array<{ url: string; status: number }>;
    responseHeaders: Record<string, string>;
    responseCode: number;
    serverIp?: string;
    asn?: string;
    hostingProvider?: string;
  };

  dns: DNSAnalysis;
  whois: WHOISInfo;
  seo: SEOAnalysis;

  accessibility: {
    score: number;
    violations: AxeViolation[];
    passes: number;
    incomplete: number;
    inapplicable: number;
  };

  pwa: {
    isInstallable: boolean;
    hasServiceWorker: boolean;
    hasManifest: boolean;
    manifest?: WebAppManifest;
    serviceWorker?: ServiceWorkerInfo;
    installabilityChecks: Record<string, boolean>;
  };

  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    httpOnly: boolean;
    secure: boolean;
    sameSite?: string;
    expires?: number;
    technology?: string;
    category?: string;
    // Full audit fields (populated by browser-analyzer)
    size?: number;
    isSession?: boolean;
    isThirdParty?: boolean;
    prefix?: string;
    prefixValid?: boolean;
    prefixIssues?: string[];
    classification?: 'essential' | 'functional' | 'tracking' | 'advertising' | 'unknown';
    securityScore?: number;
    securityIssues?: string[];
    partitioned?: boolean;
  }>;

  jsGlobals: Record<string, {
    present: boolean;
    value?: string;
    technology?: string;
    version?: string;
  }>;

  wellKnown: {
    securityTxt?: { found: boolean; content?: string };
    adsTxt?: { found: boolean; entries?: number };
    humansTxt?: { found: boolean };
    sitemapXml?: { found: boolean; urlCount?: number; sitemapType?: string };
  };

  recommendations: Recommendation[];
}
