import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

interface CompetitorMetric {
  label: string
  unit: string
  winner: string | null
  values: Record<string, number | string | null>
  higherIsBetter: boolean
}

interface CompetitorSite {
  url: string
  domain: string
  status: string
  error?: string
}

interface CompetitorReport {
  sessionId: string
  urls: string[]
  sites: CompetitorSite[]
  metrics: CompetitorMetric[]
  rankings: { carbon: string[]; performance: string[]; security: string[]; overall: string[] }
  summary: string
  createdAt: number
  completedAt?: number
}

interface SessionResult {
  sessionId: string
  status: string
  urls: string[]
  sites: CompetitorSite[]
  report?: CompetitorReport
  createdAt: number
  completedAt?: number
}

function fmtVal(v: number | string | null, unit: string): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') {
    if (unit === 'KB') return `${v.toLocaleString()} KB`
    if (unit === 'ms') return `${v.toLocaleString()} ms`
    if (unit === '/100') return `${v}/100`
    if (unit === 'g') return `${(v as number).toFixed(4)}g`
    if (unit === '') return v === 1 ? '✓' : '✗'
    return String(v)
  }
  return String(v)
}

function domainInitial(domain: string): string {
  return domain.replace(/^www\./, '').charAt(0).toUpperCase()
}

const DOMAIN_COLORS = ['bg-blue-500', 'bg-purple-500', 'bg-orange-500', 'bg-emerald-500']

export function CompetitorMode() {
  const [urls, setUrls] = useState<string[]>(['', ''])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [session, setSession] = useState<SessionResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addUrl = () => { if (urls.length < 4) setUrls([...urls, '']) }
  const removeUrl = (i: number) => setUrls(urls.filter((_, idx) => idx !== i))
  const updateUrl = (i: number, v: string) => { const u = [...urls]; u[i] = v; setUrls(u) }

  const canSubmit = urls.filter(u => {
    try { new URL(u); return true } catch { return false }
  }).length >= 2

  async function startComparison() {
    const validUrls = urls.filter(u => { try { new URL(u); return true } catch { return false } })
    setLoading(true); setError(null); setSession(null)
    try {
      const res = await fetch(`${API}/api/v1/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: validUrls }),
      })
      if (!res.ok) throw new Error(await res.text())
      const { sessionId } = await res.json() as { sessionId: string }
      setSessionId(sessionId)
    } catch (e) {
      setError(String(e)); setLoading(false)
    }
  }

  // Poll for session result
  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    const poll = async () => {
      while (!cancelled) {
        await new Promise(r => setTimeout(r, 4000))
        if (cancelled) break
        try {
          const res = await fetch(`${API}/api/v1/compare/${sessionId}`)
          const data = await res.json() as SessionResult
          setSession(data)
          if (data.status === 'done' || data.status === 'error') {
            setLoading(false)
            break
          }
        } catch { }
      }
    }
    poll()
    return () => { cancelled = true }
  }, [sessionId])

  const report = session?.report
  // Derive domains from sites so failed/errored sites still appear as columns in the table.
  const domains = report?.sites.map(s => s.domain) ?? []

  return (
    <div className="min-h-screen bg-background px-4 py-10 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">⚡ Competitor Comparison</h1>
        <p className="text-muted-foreground text-sm mt-1">Analyze 2–4 websites side-by-side. Who's greener? Who's faster?</p>
      </div>

      {/* URL Input Form */}
      {!report && (
        <div className="rounded-2xl border border-border bg-card p-6 mb-6">
          <h2 className="text-sm font-semibold mb-4">Enter URLs to compare</h2>
          <div className="space-y-3 mb-4">
            {urls.map((url, i) => (
              <div key={i} className="flex gap-2 items-center">
                <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0', DOMAIN_COLORS[i])}>
                  {i + 1}
                </div>
                <input
                  value={url}
                  onChange={e => updateUrl(i, e.target.value)}
                  placeholder={`https://example${i + 1}.com`}
                  className="flex-1 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {urls.length > 2 && (
                  <button onClick={() => removeUrl(i)} className="text-muted-foreground hover:text-destructive text-xs px-2 py-1">✕</button>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            {urls.length < 4 && (
              <button onClick={addUrl} className="text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-lg px-3 py-2">
                + Add URL
              </button>
            )}
            <button
              onClick={startComparison}
              disabled={!canSubmit || loading}
              className="ml-auto px-5 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition"
            >
              {loading ? 'Analyzing…' : 'Compare Sites'}
            </button>
          </div>
          {error && <p className="text-xs text-destructive mt-2">{error}</p>}
        </div>
      )}

      {/* Progress / Live Site Status */}
      {session && !report && (
        <div className="rounded-2xl border border-border bg-card p-6 mb-6">
          <h2 className="text-sm font-semibold mb-4">Analyzing sites…</h2>
          <div className="space-y-3">
            {(session.sites ?? []).map((site, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0', DOMAIN_COLORS[i])}>
                  {domainInitial(site.domain)}
                </div>
                <span className="flex-1 text-foreground">{site.domain}</span>
                <span className={cn('text-xs',
                  site.status === 'done' ? 'text-emerald-400' :
                  site.status === 'error' ? 'text-red-400' : 'text-yellow-400 animate-pulse'
                )}>
                  {site.status === 'done' ? '✓ Done' : site.status === 'error' ? '✗ Error' : '⟳ Running'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {report && (
        <div className="space-y-6">
          {/* Reset */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{report.summary}</p>
            <button onClick={() => { setSession(null); setSessionId(null); setLoading(false) }}
              className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5">
              ← New Comparison
            </button>
          </div>

          {/* Domain Legend */}
          <div className="flex flex-wrap gap-3">
            {domains.map((d, i) => {
              const site = report.sites.find(s => s.domain === d)
              const failed = site?.status === 'error'
              return (
                <div key={d} className="flex items-center gap-2 text-sm">
                  <div className={cn('w-3 h-3 rounded-full', failed ? 'bg-red-500/60' : DOMAIN_COLORS[i])} />
                  <span className={failed ? 'text-muted-foreground line-through' : 'text-foreground'}>{d}</span>
                  {failed && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                      ✗ Failed
                    </span>
                  )}
                  {!failed && report.rankings.carbon[0] === d && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">🏆 Greenest</span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Rankings */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: '🌿 Carbon', rank: report.rankings.carbon },
              { label: '⚡ Performance', rank: report.rankings.performance },
              { label: '🔒 Security', rank: report.rankings.security },
              { label: '🏆 Overall', rank: report.rankings.overall },
            ].map(({ label, rank }) => (
              <div key={label} className="rounded-xl border border-border bg-card p-4">
                <div className="text-xs text-muted-foreground mb-2">{label} Ranking</div>
                <ol className="space-y-1">
                  {rank.slice(0, 3).map((d, i) => (
                    <li key={d} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">{i + 1}.</span>
                      <div className={cn('w-2 h-2 rounded-full', DOMAIN_COLORS[domains.indexOf(d)])} />
                      <span className="text-foreground truncate">{d.replace(/^www\./, '')}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>

          {/* Metrics Table */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="text-sm font-semibold">Side-by-Side Metrics</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-4 py-3 text-left text-[10px] text-muted-foreground font-medium uppercase tracking-wide w-40">Metric</th>
                    {domains.map((d, i) => {
                      const site = report.sites.find(s => s.domain === d)
                      const failed = site?.status === 'error'
                      return (
                        <th key={d} className="px-4 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center gap-1.5">
                              <div className={cn('w-2 h-2 rounded-full', failed ? 'bg-red-500/60' : DOMAIN_COLORS[i])} />
                              <span className={cn('font-medium', failed ? 'text-muted-foreground' : 'text-foreground')}>
                                {d.replace(/^www\./, '')}
                              </span>
                            </div>
                            {failed && (
                              <span className="text-[9px] text-red-400 font-normal">fetch failed</span>
                            )}
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {report.metrics.map((metric, mi) => (
                    <tr key={mi} className="border-b border-border/50 hover:bg-secondary/20">
                      <td className="px-4 py-2.5 text-muted-foreground">{metric.label}</td>
                      {domains.map(domain => {
                        const val = metric.values[domain]
                        const isWinner = metric.winner === domain && val !== null
                        return (
                          <td key={domain} className="px-4 py-2.5 text-center">
                            <span className={cn('font-medium', isWinner ? (metric.higherIsBetter ? 'text-emerald-400' : 'text-emerald-400') : 'text-foreground')}>
                              {fmtVal(val as number | string | null, metric.unit)}
                            </span>
                            {isWinner && <span className="ml-1 text-emerald-400">✓</span>}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Carbon Chart Bar */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold mb-4">CO₂ per Page View</h2>
            {(() => {
              const carbonMetric = report.metrics.find(m => m.label === 'CO₂ per page view')
              if (!carbonMetric) return null
              const vals = Object.entries(carbonMetric.values).filter(([, v]) => v !== null) as [string, number][]
              const max = Math.max(...vals.map(([, v]) => v), 0.001)
              return (
                <div className="space-y-3">
                  {vals.map(([domain, val]) => {
                    const i = domains.indexOf(domain)
                    return (
                      <div key={domain} className="flex items-center gap-3">
                        <div className={cn('w-2 h-2 rounded-full shrink-0', DOMAIN_COLORS[i])} />
                        <div className="w-32 text-xs text-foreground truncate">{domain.replace(/^www\./, '')}</div>
                        <div className="flex-1 h-4 bg-secondary rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full', DOMAIN_COLORS[i])}
                            style={{ width: `${(val / max) * 100}%`, opacity: 0.85 }}
                          />
                        </div>
                        <div className="w-20 text-right text-xs font-medium text-foreground">{val.toFixed(4)}g</div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
