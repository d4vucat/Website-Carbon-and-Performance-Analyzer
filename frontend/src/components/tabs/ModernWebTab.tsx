import type { AnalysisResult } from '@/store'
import { cn } from '@/lib/utils'

interface Props { result: AnalysisResult }

type ExtResult = AnalysisResult & {
  modernApis?: {
    fetchPriority?: { hasLcpImagePreload: boolean; fetchPriorityHighCount: number; missingOnLcp: boolean }
    speculationRules?: { detected: boolean; ruleCount: number; prefetchUrls: string[]; prerenderUrls: string[] }
    importMaps?: { detected: boolean; mappingCount: number }
    viewTransitions?: { detected: boolean }
    bfCacheEligibility?: { eligible: boolean; disqualifiers: string[]; score: number }
    schedulerApi?: boolean; navigationApi?: boolean; declarativeShadowDom?: boolean
    trustedTypes?: boolean; broadcastChannel?: boolean
  }
  security: AnalysisResult['security'] & {
    botProtection?: {
      detected: boolean
      providers: Array<{ name: string; type: string; confidence: number; detectedVia: string }>
      sriCoverage: { externalScripts: number; withSri: number; withoutSri: number; percentage: number }
      rateLimitingDetected: boolean; rateLimitHeaders: Record<string, string>
      csrfProtection: boolean; formSecurityScore: number
    }
    sslLabs?: {
      grade?: string; hasWarnings: boolean; isExceptional: boolean
      protocols: Array<{ name: string; version: string; enabled: boolean }>
      vulnerabilities: Record<string, boolean | string>
      forwardSecrecy: boolean; supportsHsts: boolean
      error?: string
    }
    hstsPreloadStatus?: string
  }
  performance: AnalysisResult['performance'] & {
    crux?: {
      hasData: boolean
      metrics: Record<string, { percentiles: { p75: number }; rating: 'good' | 'needs-improvement' | 'poor' } | undefined>
      collectionPeriod?: { firstDate: string; lastDate: string }
    }
  }
}

const RATING_COLOR = {
  good: 'text-emerald-400',
  'needs-improvement': 'text-yellow-400',
  poor: 'text-red-400',
}

const RATING_BG = {
  good: 'bg-emerald-500/20 border-emerald-500/30',
  'needs-improvement': 'bg-yellow-500/20 border-yellow-500/30',
  poor: 'bg-red-500/20 border-red-500/30',
}

const CRUX_LABELS: Record<string, { label: string; unit: string; goodThreshold: number }> = {
  lcp: { label: 'LCP', unit: 'ms', goodThreshold: 2500 },
  inp: { label: 'INP', unit: 'ms', goodThreshold: 200 },
  cls: { label: 'CLS', unit: '', goodThreshold: 0.1 },
  fcp: { label: 'FCP', unit: 'ms', goodThreshold: 1800 },
  ttfb: { label: 'TTFB', unit: 'ms', goodThreshold: 800 },
}

export function ModernWebTab({ result }: Props) {
  const r = result as ExtResult
  const modernApis = r.modernApis
  const crux = r.performance.crux
  const sslLabs = r.security.sslLabs
  const botProt = r.security.botProtection
  const hstsPreload = r.security.hstsPreloadStatus

  return (
    <div className="space-y-5 animate-fade-in">

      {/* CrUX — Real User Metrics */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">📊 Chrome UX Report (Real Users)</h3>
          {crux?.collectionPeriod && (
            <span className="text-xs text-muted-foreground">
              {crux.collectionPeriod.firstDate} → {crux.collectionPeriod.lastDate}
            </span>
          )}
        </div>

        {!crux?.hasData ? (
          <div className="text-center py-6 text-muted-foreground">
            <p className="text-sm">No CrUX data available for this origin.</p>
            <p className="text-xs mt-1">This URL may not have enough real-user traffic in Chrome's dataset.</p>
            <p className="text-xs text-yellow-400 mt-2">Set CRUX_API_KEY env var on the backend to enable CrUX data.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(CRUX_LABELS).map(([key, meta]) => {
              const metric = crux.metrics?.[key]
              if (!metric) return null
              const p75 = metric.percentiles.p75
              const rating = metric.rating
              return (
                <div key={key} className={cn('rounded-lg border p-4', RATING_BG[rating])}>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-medium">{meta.label}</span>
                    <span className={cn('text-[10px] capitalize font-medium', RATING_COLOR[rating])}>
                      {rating.replace('-', ' ')}
                    </span>
                  </div>
                  <div className={cn('text-2xl font-bold font-mono', RATING_COLOR[rating])}>
                    {meta.unit === 'ms' ? `${Math.round(Number(p75))}ms` : Number(p75).toFixed(3)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">p75 real users</div>
                </div>
              )
            })}
          </div>
        )}

        {/* Lab vs Field comparison */}
        {crux?.hasData && (
          <div className="mt-4 pt-4 border-t border-border">
            <h4 className="text-xs font-medium text-muted-foreground mb-3">Lab (Playwright) vs Field (CrUX p75)</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(CRUX_LABELS).map(([key, meta]) => {
                const fieldMetric = crux.metrics?.[key]
                const labMetric = result.performance.webVitals[key as keyof typeof result.performance.webVitals]
                if (!fieldMetric || !labMetric) return null
                const field = Number(fieldMetric.percentiles.p75)
                const lab = Number(labMetric.value)
                const diff = field > 0 ? Math.round(((field - lab) / lab) * 100) : 0
                return (
                  <div key={key} className="rounded-lg bg-secondary/50 px-3 py-2">
                    <div className="text-[10px] text-muted-foreground mb-1">{meta.label}</div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono">{meta.unit === 'ms' ? `${Math.round(Number(lab))}ms` : Number(lab).toFixed(2)}</span>
                      <span className="text-[10px] text-muted-foreground">lab</span>
                      <span className={cn('text-[10px] font-medium', diff > 20 ? 'text-red-400' : 'text-muted-foreground')}>
                        {diff > 0 ? `+${diff}%` : `${diff}%`} real
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* SSL Labs Grade */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4">🔐 SSL Labs TLS Analysis</h3>
        {!sslLabs || sslLabs.error ? (
          <div className="text-center py-4 text-muted-foreground text-sm">
            {sslLabs?.error === 'Timeout'
              ? 'SSL Labs analysis timed out. Set ENABLE_SSLLABS=true and retry.'
              : 'SSL Labs analysis not enabled. Set ENABLE_SSLLABS=true to activate deep TLS scanning.'}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className={cn('text-5xl font-bold', sslLabs.grade === 'A+' ? 'text-emerald-400' : sslLabs.grade?.startsWith('A') ? 'text-green-400' : sslLabs.grade?.startsWith('B') ? 'text-blue-400' : 'text-red-400')}>
                  {sslLabs.grade ?? '—'}
                </div>
                <div className="text-xs text-muted-foreground mt-1">SSL Labs Grade</div>
              </div>
              <div className="grid grid-cols-2 gap-3 flex-1">
                <BoolCheck label="Forward Secrecy" ok={sslLabs.forwardSecrecy} />
                <BoolCheck label="HSTS Supported" ok={sslLabs.supportsHsts} />
                <BoolCheck label="No Warnings" ok={!sslLabs.hasWarnings} />
                <BoolCheck label="Exceptional" ok={sslLabs.isExceptional} />
              </div>
            </div>

            {/* Protocol support */}
            {sslLabs.protocols.length > 0 && (
              <div>
                <h4 className="text-xs text-muted-foreground mb-2">TLS Protocol Support</h4>
                <div className="flex flex-wrap gap-2">
                  {sslLabs.protocols.map(p => (
                    <span key={`${p.name}-${p.version}`} className={cn(
                      'px-2.5 py-1 rounded border text-xs font-mono',
                      p.enabled && p.version >= '1.2' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                      p.enabled && p.version < '1.2' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                      'bg-secondary/50 border-border text-muted-foreground line-through'
                    )}>
                      {p.name} {p.version}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Vulnerabilities */}
            <div>
              <h4 className="text-xs text-muted-foreground mb-2">Known Vulnerabilities</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Object.entries(sslLabs.vulnerabilities).map(([vuln, val]) => {
                  const isVulnerable = val === true || val === 'vulnerable'
                  return (
                    <div key={vuln} className={cn('rounded px-2.5 py-1.5 text-xs border',
                      isVulnerable ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400')}>
                      <span className="mr-1">{isVulnerable ? '✗' : '✓'}</span>
                      <span className="uppercase">{vuln}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* HSTS Preload */}
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0',
          hstsPreload === 'preloaded' ? 'bg-emerald-500/20' : 'bg-secondary')}>
          {hstsPreload === 'preloaded' ? '🔒' : '🔓'}
        </div>
        <div>
          <div className="text-sm font-medium">HSTS Preload Status</div>
          <div className={cn('text-xs mt-0.5 capitalize', hstsPreload === 'preloaded' ? 'text-emerald-400' : hstsPreload === 'pending' ? 'text-yellow-400' : 'text-muted-foreground')}>
            {hstsPreload ?? 'Unknown'} — {hstsPreload === 'preloaded' ? 'Domain is hardcoded in browsers' : hstsPreload === 'pending' ? 'Submission pending review' : hstsPreload === 'eligible' ? 'Eligible — submit at hstspreload.org' : 'Not in preload list'}
          </div>
        </div>
      </div>

      {/* Bot Protection */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4">🤖 Bot Protection & Form Security</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
            <div className={cn('text-2xl font-bold', botProt?.detected ? 'text-emerald-400' : 'text-muted-foreground')}>
              {botProt?.detected ? '✓' : '✗'}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">Bot Protection</div>
          </div>
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
            <div className={cn('text-2xl font-bold', botProt?.csrfProtection ? 'text-emerald-400' : 'text-red-400')}>
              {botProt?.csrfProtection ? '✓' : '✗'}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">CSRF Protection</div>
          </div>
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
            <div className={cn('text-2xl font-bold', botProt?.rateLimitingDetected ? 'text-emerald-400' : 'text-muted-foreground')}>
              {botProt?.rateLimitingDetected ? '✓' : '✗'}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">Rate Limiting</div>
          </div>
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
            <div className={cn('text-2xl font-bold', (botProt?.sriCoverage.percentage ?? 0) >= 80 ? 'text-emerald-400' : 'text-yellow-400')}>
              {botProt?.sriCoverage.percentage ?? 0}%
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">SRI Coverage</div>
          </div>
        </div>

        {botProt?.providers && botProt.providers.length > 0 && (
          <div className="space-y-2 mb-4">
            {botProt.providers.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-xs rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                <span className="font-medium">{p.name}</span>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span className="capitalize">{p.type}</span>
                  <span>{p.confidence}% confidence</span>
                  <span className="text-[10px]">{p.detectedVia}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {botProt?.sriCoverage && (
          <div>
            <h4 className="text-xs text-muted-foreground mb-2">
              Subresource Integrity (SRI) — {botProt.sriCoverage.withSri}/{botProt.sriCoverage.externalScripts} external scripts protected
            </h4>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${botProt.sriCoverage.percentage}%` }} />
            </div>
            {botProt.sriCoverage.withoutSri > 0 && (
              <p className="text-xs text-yellow-400 mt-2">
                ⚠ {botProt.sriCoverage.withoutSri} external scripts lack SRI — supply chain attack risk
              </p>
            )}
          </div>
        )}
      </div>

      {/* Modern Web APIs */}
      {modernApis && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">🚀 Modern Web Platform APIs</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <ApiCard label="Speculation Rules" detected={modernApis.speculationRules?.detected ?? false}
              detail={modernApis.speculationRules?.detected ? `${modernApis.speculationRules.ruleCount} rules` : undefined} />
            <ApiCard label="Import Maps" detected={modernApis.importMaps?.detected ?? false}
              detail={modernApis.importMaps?.detected ? `${modernApis.importMaps.mappingCount} mappings` : undefined} />
            <ApiCard label="View Transitions" detected={modernApis.viewTransitions?.detected ?? false} />
            <ApiCard label="Declarative Shadow DOM" detected={modernApis.declarativeShadowDom ?? false} />
            <ApiCard label="Scheduler API" detected={modernApis.schedulerApi ?? false} />
            <ApiCard label="Navigation API" detected={modernApis.navigationApi ?? false} />
            <ApiCard label="Trusted Types" detected={modernApis.trustedTypes ?? false} />
            <ApiCard
              label="LCP Priority Hint"
              detected={modernApis.fetchPriority?.hasLcpImagePreload ?? false}
              warn={modernApis.fetchPriority?.missingOnLcp}
            />
          </div>

          {/* BFCache */}
          {modernApis.bfCacheEligibility && (
            <div className={cn('mt-4 rounded-lg border p-4',
              modernApis.bfCacheEligibility.eligible
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : 'border-orange-500/30 bg-orange-500/5')}>
              <div className="flex items-center gap-2 mb-2">
                <span className={modernApis.bfCacheEligibility.eligible ? 'text-emerald-400' : 'text-orange-400'}>
                  {modernApis.bfCacheEligibility.eligible ? '✓' : '⚠'}
                </span>
                <span className="text-sm font-medium">Back/Forward Cache (BFCache)</span>
                <span className="text-xs text-muted-foreground ml-auto">Score: {modernApis.bfCacheEligibility.score}/100</span>
              </div>
              {modernApis.bfCacheEligibility.disqualifiers.length > 0 && (
                <div className="space-y-1">
                  {modernApis.bfCacheEligibility.disqualifiers.map((d, i) => (
                    <div key={i} className="text-xs text-orange-400">• {d}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function BoolCheck({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={ok ? 'text-emerald-400' : 'text-red-400'}>{ok ? '✓' : '✗'}</span>
      <span className={ok ? '' : 'text-muted-foreground'}>{label}</span>
    </div>
  )
}

function ApiCard({ label, detected, detail, warn }: { label: string; detected: boolean; detail?: string; warn?: boolean }) {
  return (
    <div className={cn('rounded-lg border p-3',
      detected ? 'border-emerald-500/20 bg-emerald-500/5' : warn ? 'border-yellow-500/20 bg-yellow-500/5' : 'border-border bg-secondary/20')}>
      <div className={cn('text-sm font-medium mb-1', detected ? 'text-emerald-400' : warn ? 'text-yellow-400' : 'text-muted-foreground')}>
        {detected ? '✓' : warn ? '!' : '○'} {label}
      </div>
      {detail && <div className="text-[10px] text-muted-foreground">{detail}</div>}
    </div>
  )
}
