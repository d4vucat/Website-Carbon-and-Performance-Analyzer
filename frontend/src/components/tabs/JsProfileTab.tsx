import { cn } from '@/lib/utils'
import type { AnalysisResult } from '@/store'

interface Props { result: AnalysisResult }

function fmtMs(ms: number) { return `${ms.toFixed(1)} ms` }
function fmtPct(total: number, part: number) {
  return total > 0 ? `${((part / total) * 100).toFixed(1)}%` : '—'
}

const CAT_COLOR: Record<string, string> = {
  analytics: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  ads: 'text-red-400 bg-red-500/10 border-red-500/20',
  framework: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  polyfill: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  utility: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  app: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  unknown: 'text-muted-foreground bg-secondary border-border',
}

export function JsProfileTab({ result }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prof = (result as any).jsProfile as {
    totalJsTime: number
    mainThreadBlockingTime: number
    longTaskCount: number
    longTaskTotalMs: number
    thirdPartyJsTime: number
    firstPartyJsTime: number
    score: number
    grade: string
    scriptProfiles: Array<{
      url: string; selfTime: number; callCount: number
      isThirdParty: boolean; category: string
    }>
    longTasks: Array<{ startTime: number; duration: number; attribution: string }>
    topBottlenecks: Array<{ name: string; selfTime: number; callCount: number; url: string; lineNumber: number }>
  } | null | undefined

  if (!prof) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <div className="text-3xl mb-3">⚡</div>
        <p className="text-sm">JavaScript profiling not available for this scan.</p>
        <p className="text-xs mt-2 text-muted-foreground/60">Enable via <code className="font-mono">includeJsProfile: true</code> in analysis options.</p>
      </div>
    )
  }

  const gradeColor = prof.grade.startsWith('A') ? 'text-emerald-400' : prof.grade === 'B' ? 'text-blue-400' : prof.grade === 'C' ? 'text-yellow-400' : 'text-red-400'
  const scoreBarColor = prof.score >= 80 ? 'bg-emerald-500' : prof.score >= 60 ? 'bg-blue-500' : prof.score >= 40 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className={cn('text-2xl font-bold', gradeColor)}>{prof.grade}</div>
          <div className="text-xs text-muted-foreground">JS Grade</div>
          <div className="text-[10px] text-muted-foreground/70 mt-1">{prof.score}/100</div>
          <div className="h-1.5 bg-secondary rounded-full mt-2 overflow-hidden">
            <div className={cn('h-full rounded-full', scoreBarColor)} style={{ width: `${prof.score}%` }} />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xl font-bold text-foreground">{fmtMs(prof.totalJsTime)}</div>
          <div className="text-xs text-muted-foreground">Total JS Time</div>
          <div className="text-[10px] text-muted-foreground/70 mt-1">
            {fmtPct(prof.totalJsTime, prof.thirdPartyJsTime)} 3rd party
          </div>
        </div>
        <div className={cn('rounded-xl border bg-card p-4', prof.mainThreadBlockingTime > 300 ? 'border-red-500/30' : 'border-border')}>
          <div className={cn('text-xl font-bold', prof.mainThreadBlockingTime > 300 ? 'text-red-400' : prof.mainThreadBlockingTime > 100 ? 'text-yellow-400' : 'text-foreground')}>
            {fmtMs(prof.mainThreadBlockingTime)}
          </div>
          <div className="text-xs text-muted-foreground">Main Thread Blocking</div>
          <div className="text-[10px] text-muted-foreground/70 mt-1">TBT contribution</div>
        </div>
        <div className={cn('rounded-xl border bg-card p-4', prof.longTaskCount > 5 ? 'border-orange-500/30' : 'border-border')}>
          <div className={cn('text-xl font-bold', prof.longTaskCount > 5 ? 'text-orange-400' : 'text-foreground')}>
            {prof.longTaskCount}
          </div>
          <div className="text-xs text-muted-foreground">Long Tasks (&gt;50ms)</div>
          <div className="text-[10px] text-muted-foreground/70 mt-1">{fmtMs(prof.longTaskTotalMs)} total</div>
        </div>
      </div>

      {/* First vs Third party breakdown */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3">First vs Third-Party JS Execution</h3>
        <div className="space-y-3">
          {[
            { label: 'First-Party', ms: prof.firstPartyJsTime, color: 'bg-emerald-500' },
            { label: 'Third-Party', ms: prof.thirdPartyJsTime, color: 'bg-orange-500' },
          ].map(row => (
            <div key={row.label} className="flex items-center gap-3">
              <div className={cn('w-3 h-3 rounded-full shrink-0', row.color)} />
              <div className="w-28 text-xs text-muted-foreground">{row.label}</div>
              <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full', row.color)}
                  style={{ width: `${prof.totalJsTime > 0 ? (row.ms / prof.totalJsTime) * 100 : 0}%` }} />
              </div>
              <div className="w-20 text-right text-xs font-mono text-foreground">{fmtMs(row.ms)}</div>
              <div className="w-12 text-right text-xs text-muted-foreground">{fmtPct(prof.totalJsTime, row.ms)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Top bottlenecks */}
      {prof.topBottlenecks.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-3">🔥 Top Function Bottlenecks</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  {['Function', 'Self Time', 'Calls', 'Script'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] text-muted-foreground font-medium uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {prof.topBottlenecks.slice(0, 10).map((fn, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-secondary/20">
                    <td className="px-3 py-2 font-mono text-foreground">{fn.name || '(anonymous)'}</td>
                    <td className="px-3 py-2 text-orange-400 font-medium">{fmtMs(fn.selfTime)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fn.callCount.toLocaleString()}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate text-muted-foreground font-mono text-[10px]">
                      {fn.url.split('/').pop()?.slice(0, 40)}:{fn.lineNumber}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Script profiles */}
      {prof.scriptProfiles.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-semibold">Script Execution Breakdown ({prof.scriptProfiles.length} scripts)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  {['Script', 'Category', 'Self Time', '% of Total', 'Calls', 'Party'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] text-muted-foreground font-medium uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {prof.scriptProfiles.slice(0, 25).map((s, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-secondary/20">
                    <td className="px-3 py-2 max-w-[220px] truncate font-mono text-[10px] text-muted-foreground">
                      {s.url.split('/').slice(-2).join('/').slice(0, 50)}
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn('text-[9px] px-1.5 py-0.5 rounded border', CAT_COLOR[s.category] ?? CAT_COLOR.unknown)}>
                        {s.category}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium text-foreground">{fmtMs(s.selfTime)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtPct(prof.totalJsTime, s.selfTime)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s.callCount.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <span className={s.isThirdParty ? 'text-orange-400' : 'text-emerald-400'}>
                        {s.isThirdParty ? '3rd' : '1st'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Long tasks */}
      {prof.longTasks.length > 0 && (
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-5">
          <h3 className="text-sm font-semibold text-orange-400 mb-3">⚠️ Long Tasks (&gt;50ms) — {prof.longTasks.length} detected</h3>
          <div className="space-y-2">
            {prof.longTasks.slice(0, 8).map((t, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <div className={cn('px-2 py-0.5 rounded font-mono font-semibold',
                  t.duration > 200 ? 'text-red-400 bg-red-500/10' : 'text-orange-400 bg-orange-500/10')}>
                  {fmtMs(t.duration)}
                </div>
                <div className="flex-1 truncate text-muted-foreground font-mono text-[10px]">
                  {t.attribution === 'unknown' ? 'Unknown attribution' : t.attribution.split('/').slice(-2).join('/')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
