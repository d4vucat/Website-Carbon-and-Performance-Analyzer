import { useState } from 'react'
import type { AnalysisResult } from '@/store'
import { formatBytes, formatCo2, cn } from '@/lib/utils'

interface Props { result: AnalysisResult }

const GDPR_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  essential: { label: 'Essential', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  functional: { label: 'Functional', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  tracking: { label: 'Tracking', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  advertising: { label: 'Advertising', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
}

export function ThirdPartiesTab({ result }: Props) {
  const [sortBy, setSortBy] = useState<'transfer' | 'requests' | 'co2'>('transfer')
  const [gdprFilter, setGdprFilter] = useState<string>('all')

  const { thirdParties, carbon } = result

  const byCategory = thirdParties.reduce((acc, tp) => {
    acc[tp.gdprCategory] = (acc[tp.gdprCategory] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const filtered = gdprFilter === 'all' ? thirdParties : thirdParties.filter(tp => tp.gdprCategory === gdprFilter)
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'transfer') return b.transferSize - a.transferSize
    if (sortBy === 'requests') return b.requestCount - a.requestCount
    return b.co2Grams - a.co2Grams
  })

  const totalCo2 = thirdParties.reduce((s, tp) => s + tp.co2Grams, 0)
  const totalTransfer = thirdParties.reduce((s, tp) => s + tp.transferSize, 0)
  const totalRequests = thirdParties.reduce((s, tp) => s + tp.requestCount, 0)
  const trackingCount = thirdParties.filter(tp => tp.gdprCategory === 'tracking' || tp.gdprCategory === 'advertising').length

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Providers" value={thirdParties.length} />
        <StatCard label="Tracking/Ads" value={trackingCount} danger={trackingCount > 0} />
        <StatCard label="Total Transfer" value={formatBytes(totalTransfer)} />
        <StatCard label="Total CO₂" value={formatCo2(totalCo2)} />
      </div>

      {/* GDPR breakdown */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4">GDPR Category Breakdown</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(GDPR_CONFIG).map(([key, config]) => (
            <div key={key} className={cn('rounded-lg border p-3 text-center cursor-pointer hover:opacity-80 transition-opacity', config.bg,
              gdprFilter === key ? 'ring-1 ring-current ring-offset-1 ring-offset-background' : '')}
              onClick={() => setGdprFilter(gdprFilter === key ? 'all' : key)}>
              <div className={cn('text-2xl font-bold', config.color)}>{byCategory[key] ?? 0}</div>
              <div className={cn('text-xs mt-1', config.color)}>{config.label}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Click a category to filter. Tracking and advertising cookies require explicit consent under GDPR.
        </p>
      </div>

      {/* CO₂ impact vs first party */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3">First vs Third Party CO₂</h3>
        <div className="h-3 rounded-full overflow-hidden flex">
          <div className="bg-primary h-full rounded-l-full" style={{ width: `${(carbon.firstPartyCo2G / carbon.models.hybrid) * 100}%` }} />
          <div className="bg-orange-500 h-full rounded-r-full" style={{ width: `${(carbon.thirdPartyCo2G / carbon.models.hybrid) * 100}%` }} />
        </div>
        <div className="flex justify-between mt-2 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-primary inline-block" />First-party: {formatCo2(carbon.firstPartyCo2G)}</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-orange-500 inline-block" />Third-party: {formatCo2(carbon.thirdPartyCo2G)}</span>
        </div>
      </div>

      {/* Providers table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold">Third-Party Providers ({sorted.length})</h3>
          <div className="flex gap-2">
            {(['transfer', 'requests', 'co2'] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)}
                className={cn('px-2.5 py-1 rounded text-xs border transition-colors capitalize',
                  sortBy === s ? 'bg-primary/20 border-primary/40 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
                {s === 'co2' ? 'CO₂' : s}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-border">
          {sorted.map(tp => {
            const gdpr = GDPR_CONFIG[tp.gdprCategory]
            return (
              <div key={tp.name} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-medium">{tp.name}</span>
                      <span className={cn('px-1.5 py-0.5 rounded border text-[10px] font-medium', gdpr.bg, gdpr.color)}>
                        {gdpr.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground capitalize">{tp.category}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {tp.domains.slice(0, 4).map(d => (
                        <span key={d} className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{d}</span>
                      ))}
                      {tp.domains.length > 4 && (
                        <span className="text-[11px] text-muted-foreground">+{tp.domains.length - 4}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0 text-right">
                    <div>
                      <div className="text-xs font-mono">{tp.requestCount}</div>
                      <div className="text-[10px] text-muted-foreground">requests</div>
                    </div>
                    <div>
                      <div className="text-xs font-mono">{formatBytes(tp.transferSize)}</div>
                      <div className="text-[10px] text-muted-foreground">transfer</div>
                    </div>
                    <div>
                      <div className="text-xs font-mono text-orange-400">{formatCo2(tp.co2Grams)}</div>
                      <div className="text-[10px] text-muted-foreground">CO₂</div>
                    </div>
                  </div>
                </div>

                {tp.cookiesDropped.length > 0 && (
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-muted-foreground">Cookies:</span>
                    {tp.cookiesDropped.slice(0, 5).map(c => (
                      <span key={c} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary/80 text-muted-foreground">{c}</span>
                    ))}
                  </div>
                )}

                {tp.privacySafeAlternative && (
                  <div className="mt-2 flex items-start gap-1.5 text-xs text-emerald-400">
                    <span className="flex-shrink-0">🌿</span>
                    <span><strong>Privacy-friendly alternative:</strong> {tp.privacySafeAlternative}</span>
                  </div>
                )}

                {(tp.blockingTime ?? 0) > 50 && (
                  <div className="mt-1.5 text-xs text-yellow-400">
                    ⚠️ Blocks main thread for {Math.round(tp.blockingTime ?? 0)}ms
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Total summary */}
      <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap gap-4 justify-around text-center">
        <div>
          <div className="text-xl font-bold">{totalRequests}</div>
          <div className="text-xs text-muted-foreground">Total 3rd party requests</div>
        </div>
        <div>
          <div className="text-xl font-bold">{formatBytes(totalTransfer)}</div>
          <div className="text-xs text-muted-foreground">3rd party transfer</div>
        </div>
        <div>
          <div className="text-xl font-bold text-orange-400">{formatCo2(totalCo2)}</div>
          <div className="text-xs text-muted-foreground">3rd party CO₂/view</div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, danger }: { label: string; value: string | number; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={cn('text-xl font-bold', danger ? 'text-red-400' : '')}>{value}</div>
    </div>
  )
}
