import { create } from 'zustand'

export interface AnalysisJob {
  jobId: string
  url: string
  status: 'queued' | 'running' | 'done' | 'error'
  phase: number
  progress: number
  phaseName?: string
  error?: string
  result?: AnalysisResult
  createdAt: number
}

export interface AnalysisResult {
  meta: {
    url: string
    finalUrl: string
    timestamp: string
    durationMs: number
    analyzerVersion: string
    jobId: string
  }
  scores: {
    carbon: { grade: string; co2PerViewG: number; annualEstimateKg?: number }
    performance: { score: number; grade: string }
    security: { score: number; grade: string }
    accessibility: { score: number; grade: string }
    seo: { score: number; grade: string }
    composite: { score: number; grade: string }
  }
  carbon: {
    models: {
      swd: number; onebyte: number; hybrid: number; grade: string
      greenHosting: boolean; greenHostingProvider?: string
      gridIntensity: number
      serverLocation: { country: string; countryCode: string; region?: string }
      annualCo2Kg?: number
    }
    transferSizeBytes: number
    decodedSizeBytes: number
    resourceBreakdown: ResourceBreakdown
    thirdPartyCo2G: number
    firstPartyCo2G: number
    equivalents: CarbonEquivalents
    recommendations: Recommendation[]
  }
  performance: {
    lighthouseScore: number
    accessibilityScore: number
    bestPracticesScore: number
    seoScore: number
    webVitals: WebVitals
    opportunities: Opportunity[]
    resourceSummary: ResourceBreakdown
    screenshots?: string[]
    networkRequests: NetworkRequest[]
    jsCoverage?: Coverage
    cssCoverage?: Coverage
    consoleErrors: number
    consoleWarnings: number
    longTasks: LongTask[]
  }
  technologies: {
    detected: TechMatch[]
    summary: TechSummary
  }
  security: {
    score: number; grade: string
    headers: SecurityHeaders
    https: boolean; hstsPreloaded: boolean; tlsVersion: string
    certificate?: Certificate
    mixedContent: boolean
    vulnerableLibraries: VulnerableLib[]
  }
  thirdParties: ThirdParty[]
  http: {
    redirectChain: RedirectHop[]
    responseHeaders: Record<string, string>
    responseCode: number
    serverIp?: string
    asn?: string
    hostingProvider?: string
  }
  dns: DNSAnalysis
  whois: WHOISInfo
  seo: SEOAnalysis
  accessibility: {
    score: number
    violations: AxeViolation[]
    passes: number; incomplete: number; inapplicable: number
  }
  pwa: PWAResult
  cookies: Cookie[]
  jsGlobals: Record<string, { present: boolean; value?: string }>
  wellKnown: WellKnown
  recommendations: Recommendation[]
}

export interface ResourceBreakdown {
  html: ResourceStats; javascript: ResourceStats; css: ResourceStats
  images: ResourceStats; fonts: ResourceStats; video: ResourceStats
  xhr: ResourceStats; other: ResourceStats; total: ResourceStats
}
export interface ResourceStats {
  count: number; transferSize: number; decodedSize: number; co2Grams?: number
}
export interface CarbonEquivalents {
  kettleBoils: number; smartphoneCharges: number; ledBulbHours: number
  carKm: number; flightKm: number; treeYearPercent: number
}
export interface Recommendation {
  id: string; title: string; description: string
  category: 'carbon' | 'performance' | 'security' | 'accessibility' | 'seo'
  impact: 'high' | 'medium' | 'low'
  estimatedCo2SaveG?: number; estimatedPerfSaveMs?: number; estimatedSizesSaveBytes?: number
  codeSnippet?: string; references?: string[]
}
export interface WebVitals {
  lcp: Metric; inp: Metric; cls: Metric; fcp: Metric
  ttfb: Metric; tbt: Metric; tti: Metric; speedIndex: Metric
}
export interface Metric {
  value: number; unit: string; rating: 'good' | 'needs-improvement' | 'poor'; displayValue: string
}
export interface Opportunity {
  id: string; title: string; description: string; displayValue?: string
  score: number | null; savings?: { bytes?: number; ms?: number; wastedBytes?: number }
  items?: Array<{ url?: string; totalBytes?: number; wastedBytes?: number; wastedMs?: number }>
}
export interface NetworkRequest {
  url: string; type: string; method: string; status: number
  fromCache: boolean; transferSize: number; decodedSize: number
  contentEncoding?: string; compressionRatio?: number; cacheControl?: string
  domain: string; isThirdParty: boolean; isCdn: boolean
  timing: { startTime: number; totalDuration: number; ttfb?: number }
}
export interface Coverage { totalBytes: number; usedBytes: number; unusedBytes: number }
export interface LongTask { duration: number; attribution?: string }
export interface TechMatch {
  name: string; slug: string; version?: string; confidence: number
  category: string; detectedVia: string[]; isTracking?: boolean
  gdprCategory?: 'essential' | 'functional' | 'tracking' | 'advertising'
}
export interface TechSummary {
  cms?: string; framework?: string; language?: string; server?: string
  hosting?: string; cdn?: string; analytics: string[]; tagManagers: string[]
  chatWidgets: string[]; errorTracking: string[]; abTesting: string[]
}
export interface SecurityHeaders {
  hsts: HeaderResult; csp: HeaderResult & { directives?: Record<string, string[]> }
  xFrameOptions: HeaderResult; xContentTypeOptions: HeaderResult
  referrerPolicy: HeaderResult; permissionsPolicy: HeaderResult
  coep: HeaderResult; coop: HeaderResult; corp: HeaderResult
  xxssProtection: HeaderResult; grade: string; score: number
}
export interface HeaderResult {
  present: boolean; value?: string; score: number; grade: string
  issues: string[]; recommendations: string[]
}
export interface Certificate {
  subject: string; issuer: string; validFrom: string; validTo: string
  daysUntilExpiry: number; algorithm: string; fingerprint: string
  sans: string[]; isWildcard: boolean; isEV: boolean
}
export interface VulnerableLib { name: string; version: string; cves: string[] }
export interface ThirdParty {
  name: string; category: string; domains: string[]
  requestCount: number; transferSize: number; mainThreadTime?: number
  blockingTime?: number; co2Grams: number
  gdprCategory: 'essential' | 'functional' | 'tracking' | 'advertising'
  cookiesDropped: string[]; privacySafeAlternative?: string
}
export interface RedirectHop { url: string; status: number }
export interface DNSAnalysis {
  a: string[]; aaaa: string[]; mx: Array<{ exchange: string; priority: number }>
  ns: string[]; txt: string[]; cname?: string
  soa?: object; caa?: object[]; resolvedAt: string
  dnsProvider?: string; emailProvider?: string
}
export interface WHOISInfo {
  registrar?: string; registrarUrl?: string; createdAt?: string
  updatedAt?: string; expiresAt?: string; daysUntilExpiry?: number
  nameservers: string[]; statusCodes: string[]; isRegistryLocked: boolean
}
export interface SEOAnalysis {
  title: string; titleLength: number; description: string; descriptionLength: number
  canonical?: string; hreflang?: Array<{ lang: string; href: string }>
  ogCompleteness: number; ogTags: Record<string, string>
  twitterCardCompleteness: number; twitterTags: Record<string, string>
  sitemapFound: boolean; sitemapUrls: string[]; robotsTxtFound: boolean
  robotsTxtContent?: string; structuredDataTypes: string[]
  headingStructure: { h1: number; h2: number; h3: number; h4: number; h5: number; h6: number }
  imageAltMissing: number; lighthouse: number
}
export interface AxeViolation {
  id: string; impact: 'critical' | 'serious' | 'moderate' | 'minor'
  description: string; help: string; helpUrl: string; wcagCriteria: string[]
  nodes: Array<{ html: string; target: string[]; failureSummary: string }>
}
export interface PWAResult {
  isInstallable: boolean; hasServiceWorker: boolean; hasManifest: boolean
  manifest?: object; serviceWorker?: object; installabilityChecks: Record<string, boolean>
}
export interface Cookie {
  name: string; value: string; domain: string; path: string
  httpOnly: boolean; secure: boolean; sameSite?: string; expires?: number
}
export interface WellKnown {
  securityTxt?: { found: boolean; content?: string }
  adsTxt?: { found: boolean; entries?: number }
  humansTxt?: { found: boolean }
  sitemapXml?: { found: boolean; urlCount?: number; sitemapType?: string }
}

interface AppState {
  jobs: Map<string, AnalysisJob>
  activeJobId: string | null
  history: Array<{ jobId: string; url: string; grade: string; score: number; timestamp: string }>
  activeTab: string

  startAnalysis: (url: string, options?: object) => Promise<string>
  setActiveJob: (jobId: string) => void
  updateJob: (jobId: string, update: Partial<AnalysisJob>) => void
  setActiveTab: (tab: string) => void
  clearJob: (jobId: string) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  jobs: new Map(),
  activeJobId: null,
  history: [],
  activeTab: 'overview',

  startAnalysis: async (url: string, options = {}) => {
    const res = await fetch('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, options }),
    })

    if (!res.ok) {
      // Backend may be down: Vite proxy returns a non-JSON 500/502 page
      let errMsg = `Server error (${res.status})`
      try {
        const contentType = res.headers.get('content-type') ?? ''
        if (contentType.includes('application/json')) {
          const err = await res.json() as { error?: string; message?: string }
          errMsg = err.error ?? err.message ?? errMsg
        } else if (res.status === 500 || res.status === 502 || res.status === 503) {
          errMsg = 'Backend server is not running. Start it with: npm run dev:backend'
        }
      } catch { /* ignore parse errors */ }
      throw new Error(errMsg)
    }

    let data: { jobId: string; url: string }
    try {
      data = await res.json() as { jobId: string; url: string }
    } catch {
      throw new Error('Invalid response from server. Check that the backend is running.')
    }
    const job: AnalysisJob = {
      jobId: data.jobId,
      url: data.url,
      status: 'queued',
      phase: 0,
      progress: 0,
      createdAt: Date.now(),
    }

    set(state => {
      const jobs = new Map(state.jobs)
      jobs.set(data.jobId, job)
      return { jobs, activeJobId: data.jobId }
    })

    // Connect SSE
    const es = new EventSource(`/api/v1/analyze/${data.jobId}/stream`)

    es.addEventListener('phase_progress', (e) => {
      const d = JSON.parse(e.data) as { phase: number; phaseName: string; progress: number }
      get().updateJob(data.jobId, {
        phase: d.phase,
        phaseName: d.phaseName,
        progress: d.progress,
        status: 'running',
      })
    })

    es.addEventListener('done', (e) => {
      const d = JSON.parse(e.data) as { result: AnalysisResult }
      get().updateJob(data.jobId, { status: 'done', progress: 100, result: d.result })
      es.close()
    })

    es.addEventListener('error', (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data) as { error: string }
        get().updateJob(data.jobId, { status: 'error', error: d.error })
      } catch {
        get().updateJob(data.jobId, { status: 'error', error: 'Connection lost' })
      }
      es.close()
    })

    es.onerror = () => {
      const j = get().jobs.get(data.jobId)
      if (j?.status !== 'done' && j?.status !== 'error') {
        // Poll fallback
        const pollInterval = setInterval(async () => {
          try {
            const r = await fetch(`/api/v1/analyze/${data.jobId}/status`)
            const s = await r.json() as { status: string; progress: number; phase: number }
            if (s.status === 'done' || s.status === 'error') {
              clearInterval(pollInterval)
              if (s.status === 'done') {
                const resultRes = await fetch(`/api/v1/analyze/${data.jobId}/result`)
                const result = await resultRes.json() as AnalysisResult
                get().updateJob(data.jobId, { status: 'done', progress: 100, result })
              }
            } else {
              get().updateJob(data.jobId, { status: 'running', progress: s.progress, phase: s.phase })
            }
          } catch {
            clearInterval(pollInterval)
          }
        }, 2000)
      }
    }

    return data.jobId
  },

  setActiveJob: (jobId) => set({ activeJobId: jobId }),

  updateJob: (jobId, update) => set(state => {
    const jobs = new Map(state.jobs)
    const existing = jobs.get(jobId)
    if (existing) jobs.set(jobId, { ...existing, ...update })
    return { jobs }
  }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  clearJob: (jobId) => set(state => {
    const jobs = new Map(state.jobs)
    jobs.delete(jobId)
    return { jobs, activeJobId: state.activeJobId === jobId ? null : state.activeJobId }
  }),
}))
