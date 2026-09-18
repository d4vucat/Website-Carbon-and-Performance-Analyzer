import { cn } from '@/lib/utils'
import type { AnalysisResult } from '@/store'

interface Props { result: AnalysisResult }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BWGroup = { name: string; live: number; dead: number; latest: number; oldest: number; categories: Array<{ name: string; live: number; dead: number }> }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BWResult = {
  domain: string
  firstIndexedDate: string
  lastIndexedDate: string
  totalLive: number
  totalDead: number
  topGroups: string[]
  groups: BWGroup[]
  source: string
  error?: string
}

function fmtDate(d: string) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) }
  catch { return d }
}

const GROUP_ICONS: Record<string, string> = {
  javascript: '⚡',
  cms: '📝',
  hosting: '🖥️',
  analytics: '📊',
  advertising: '📢',
  cdn: '🌐',
  framework: '🏗️',
  security: '🔒',
  email: '📧',
  payment: '💳',
  ecommerce: '🛒',
  media: '🎬',
  widgets: '🧩',
  seo: '🔍',
  social: '👥',
  mobile: '📱',
  server: '🖥️',
  ssl: '🔐',
  accessibility: '♿',
}

function getIcon(name: string): string {
  return GROUP_ICONS[name.toLowerCase()] ?? '📦'
}

function LiveDeadBar({ live, dead }: { live: number; dead: number }) {
  const total = live + dead
  if (total === 0) return null
  const livePct = (live / total) * 100
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden bg-secondary w-24">
      <div className="bg-emerald-500 h-full" style={{ width: `${livePct}%` }} />
      <div className="bg-red-500/40 h-full" style={{ width: `${100 - livePct}%` }} />
    </div>
  )
}

export function BuiltWithTab({ result }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bw = (result as any).builtWith as BWResult | null | undefined

  if (!bw || bw.source === 'unavailable' || bw.groups.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <div className="text-3xl mb-3">🏗️</div>
        <p className="text-sm font-medium">BuiltWith data unavailable</p>
        {bw?.error && (
          <p className="text-xs mt-2 text-muted-foreground/70 font-mono">{bw.error}</p>
        )}
        <p className="text-xs mt-3 text-muted-foreground/60">
          The BuiltWith API may be unreachable from your network.
        </p>
      </div>
    )
  }

  const liveGroups = bw.groups.filter(g => g.live > 0).sort((a, b) => b.live - a.live)
  const deadGroups = bw.groups.filter(g => g.live === 0 && g.dead > 0)

  return (
    <div className="space-y-5">
      {/* Header summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xl font-bold text-emerald-400">{bw.totalLive}</div>
          <div className="text-xs text-muted-foreground">Live Technologies</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xl font-bold text-muted-foreground">{bw.totalDead}</div>
          <div className="text-xs text-muted-foreground">Previously Used</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-bold text-foreground">{fmtDate(bw.firstIndexedDate)}</div>
          <div className="text-xs text-muted-foreground">First Indexed</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-bold text-foreground">{fmtDate(bw.lastIndexedDate)}</div>
          <div className="text-xs text-muted-foreground">Last Indexed</div>
        </div>
      </div>

      {/* Top groups pills */}
      {bw.topGroups.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Top Technology Groups</h3>
          <div className="flex flex-wrap gap-2">
            {bw.topGroups.map(g => (
              <span key={g} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary border border-border text-xs font-medium text-foreground">
                <span>{getIcon(g)}</span>
                <span className="capitalize">{g}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Live groups */}
      {liveGroups.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-secondary/30">
            <h3 className="text-sm font-semibold">Active Technology Groups</h3>
          </div>
          <div className="divide-y divide-border/50">
            {liveGroups.map(group => (
              <div key={group.name} className="px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{getIcon(group.name)}</span>
                    <span className="font-medium text-sm capitalize text-foreground">{group.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <LiveDeadBar live={group.live} dead={group.dead} />
                    <div className="text-xs text-right min-w-[60px]">
                      <span className="text-emerald-400 font-semibold">{group.live} live</span>
                      {group.dead > 0 && (
                        <span className="text-muted-foreground ml-1">/ {group.dead} dead</span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Categories */}
                {group.categories.filter(c => c.live > 0).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 pl-6">
                    {group.categories
                      .filter(c => c.live > 0)
                      .sort((a, b) => b.live - a.live)
                      .map(cat => (
                        <span key={cat.name} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary/80">
                          {cat.name.replace(/-/g, ' ')}
                          <span className="ml-1 text-muted-foreground">×{cat.live}</span>
                        </span>
                      ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Previously used (dead only) */}
      {deadGroups.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-secondary/30">
            <h3 className="text-sm font-semibold text-muted-foreground">Previously Used (No Longer Active)</h3>
          </div>
          <div className="px-5 py-3 flex flex-wrap gap-2">
            {deadGroups.map(g => (
              <span key={g.name} className="text-xs px-2.5 py-1 rounded-lg bg-secondary border border-border/50 text-muted-foreground line-through capitalize">
                {getIcon(g.name)} {g.name}
                <span className="ml-1 no-underline">({g.dead})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Source badge */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
        <span>Data from</span>
        <a href="https://builtwith.com" target="_blank" rel="noopener noreferrer"
          className="text-blue-400 hover:underline">BuiltWith Free API</a>
        <span>·</span>
        <span className={cn(bw.source === 'cached' ? 'text-yellow-400' : 'text-emerald-400')}>
          {bw.source}
        </span>
        <span>· {bw.domain}</span>
      </div>
    </div>
  )
}
