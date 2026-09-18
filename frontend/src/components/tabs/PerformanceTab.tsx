import type { AnalysisResult } from '@/store'
import { formatBytes, formatDuration, getRatingColor, getRatingBg, getImpactBadge, cn } from '@/lib/utils'

interface Props { result: AnalysisResult }

export function PerformanceTab({ result }: Props) {
  const { performance } = result
  const { webVitals, opportunities, jsCoverage, cssCoverage } = performance

  const vitals = [
    { key: 'lcp', label: 'Largest Contentful Paint', desc: 'Time to render largest visible element', metric: webVitals.lcp },
    { key: 'inp', label: 'Interaction to Next Paint', desc: 'Responsiveness to user input', metric: webVitals.inp },
    { key: 'cls', label: 'Cumulative Layout Shift', desc: 'Visual stability during loading', metric: webVitals.cls },
    { key: 'fcp', label: 'First Contentful Paint', desc: 'Time to first visible content', metric: webVitals.fcp },
    { key: 'ttfb', label: 'Time to First Byte', desc: 'Server response time', metric: webVitals.ttfb },
    { key: 'tbt', label: 'Total Blocking Time', desc: 'JS blocking main thread time', metric: webVitals.tbt },
    { key: 'tti', label: 'Time to Interactive', desc: 'Page ready for user interaction', metric: webVitals.tti },
    { key: 'si', label: 'Speed Index', desc: 'How quickly content is visually displayed', metric: webVitals.speedIndex },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Score */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <ScoreCard label="Performance" score={performance.lighthouseScore} color="text-primary" />
        <ScoreCard label="Accessibility" score={performance.accessibilityScore} color="text-blue-400" />
        <ScoreCard label="Best Practices" score={performance.bestPracticesScore} color="text-purple-400" />
        <ScoreCard label="SEO" score={performance.seoScore} color="text-yellow-400" />
      </div>

      {/* Core Web Vitals */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4">Core Web Vitals</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {vitals.map(({ key, label, desc, metric }) => (
            <div key={key} className={cn('rounded-lg border p-4', getRatingBg(metric.rating))}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">{label}</span>
                <span className={cn('text-lg font-bold font-mono', getRatingColor(metric.rating))}>
                  {metric.displayValue}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">{desc}</p>
              <div className={cn('text-[10px] mt-1.5 font-medium capitalize', getRatingColor(metric.rating))}>
                {metric.rating.replace('-', ' ')}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Coverage */}
      {(jsCoverage || cssCoverage) && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Code Coverage</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {jsCoverage && (
              <CoverageBar
                label="JavaScript"
                used={jsCoverage.usedBytes}
                total={jsCoverage.totalBytes}
                unused={jsCoverage.unusedBytes}
                color="#FBBF24"
              />
            )}
            {cssCoverage && (
              <CoverageBar
                label="CSS"
                used={cssCoverage.usedBytes}
                total={cssCoverage.totalBytes}
                unused={cssCoverage.unusedBytes}
                color="#A78BFA"
              />
            )}
          </div>
        </div>
      )}

      {/* Opportunities */}
      {opportunities.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Optimization Opportunities</h3>
          <div className="space-y-3">
            {opportunities.map(opp => (
              <div key={opp.id} className="flex items-start gap-3 rounded-lg border border-border bg-secondary/20 p-3">
                <div className="flex-1">
                  <div className="text-xs font-medium mb-0.5">{opp.title}</div>
                  <div className="text-[11px] text-muted-foreground">{opp.description}</div>
                  {opp.displayValue && (
                    <div className="text-xs text-yellow-400 mt-1">{opp.displayValue}</div>
                  )}
                </div>
                {opp.savings?.ms && (
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs font-mono text-yellow-400">−{formatDuration(opp.savings.ms)}</div>
                    <div className="text-[10px] text-muted-foreground">potential saving</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Long Tasks */}
      {performance.longTasks.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-3">Long Tasks ({performance.longTasks.length})</h3>
          <p className="text-xs text-muted-foreground mb-3">Tasks blocking the main thread for &gt;50ms impact interactivity.</p>
          <div className="flex flex-wrap gap-2">
            {performance.longTasks.slice(0, 20).map((task, i) => (
              <div key={i} className={cn(
                'px-2.5 py-1.5 rounded border text-xs font-mono',
                task.duration > 500 ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                task.duration > 200 ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' :
                'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
              )}>
                {Math.round(task.duration)}ms
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Console messages */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className={cn('text-3xl font-bold', performance.consoleErrors > 0 ? 'text-red-400' : 'text-emerald-400')}>
            {performance.consoleErrors}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Console Errors</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className={cn('text-3xl font-bold', performance.consoleWarnings > 5 ? 'text-yellow-400' : 'text-muted-foreground')}>
            {performance.consoleWarnings}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Console Warnings</div>
        </div>
      </div>
    </div>
  )
}

function ScoreCard({ label, score, color }: { label: string; score: number; color: string }) {
  const pct = Math.min(100, Math.max(0, score))
  const strokeColor = score >= 90 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-center">
      <div className="relative inline-flex items-center justify-center w-16 h-16">
        <svg width="64" height="64" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="26" fill="none" stroke="hsl(222 47% 14%)" strokeWidth="4" />
          <circle cx="32" cy="32" r="26" fill="none" stroke={strokeColor} strokeWidth="4"
            strokeDasharray={`${(pct / 100) * 163.4} 163.4`}
            strokeLinecap="round" transform="rotate(-90 32 32)" />
        </svg>
        <span className={`absolute text-lg font-bold ${color}`}>{score}</span>
      </div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  )
}

function CoverageBar({ label, used, total, unused, color }: { label: string; used: number; total: number; unused: number; color: string }) {
  const usedPct = total > 0 ? (used / total) * 100 : 0
  const unusedPct = total > 0 ? (unused / total) * 100 : 0
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{formatBytes(total)}</span>
      </div>
      <div className="h-3 rounded-full bg-secondary overflow-hidden flex">
        <div className="h-full rounded-l-full" style={{ width: `${usedPct}%`, background: color }} />
        <div className="h-full rounded-r-full bg-red-500/40" style={{ width: `${unusedPct}%` }} />
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
        <span style={{ color }}>{usedPct.toFixed(0)}% used ({formatBytes(used)})</span>
        <span className="text-red-400">{unusedPct.toFixed(0)}% unused ({formatBytes(unused)})</span>
      </div>
    </div>
  )
}
