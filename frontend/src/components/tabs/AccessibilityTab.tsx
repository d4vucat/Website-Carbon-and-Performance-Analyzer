import { useState } from 'react'
import type { AnalysisResult, AxeViolation } from '@/store'
import { cn } from '@/lib/utils'

interface Props { result: AnalysisResult }

const IMPACT_CONFIG: Record<string, { color: string; bg: string; order: number }> = {
  critical: { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', order: 0 },
  serious: { color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30', order: 1 },
  moderate: { color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30', order: 2 },
  minor: { color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30', order: 3 },
}

export function AccessibilityTab({ result }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [impactFilter, setImpactFilter] = useState<string>('all')

  const { accessibility } = result

  const totalIssues = accessibility.violations.length
  const criticalCount = accessibility.violations.filter(v => v.impact === 'critical').length
  const seriousCount = accessibility.violations.filter(v => v.impact === 'serious').length
  const moderateCount = accessibility.violations.filter(v => v.impact === 'moderate').length
  const minorCount = accessibility.violations.filter(v => v.impact === 'minor').length

  const filtered = impactFilter === 'all'
    ? accessibility.violations
    : accessibility.violations.filter(v => v.impact === impactFilter)

  const sorted = [...filtered].sort((a, b) =>
    IMPACT_CONFIG[a.impact].order - IMPACT_CONFIG[b.impact].order
  )

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Score overview */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="rounded-xl border border-border bg-card p-4 text-center sm:col-span-1">
          <div className={cn('text-4xl font-bold mb-1',
            accessibility.score >= 90 ? 'text-emerald-400' : accessibility.score >= 70 ? 'text-yellow-400' : 'text-red-400')}>
            {accessibility.score}
          </div>
          <div className="text-xs text-muted-foreground">Score / 100</div>
        </div>
        <ImpactCard label="Critical" count={criticalCount} impact="critical" active={impactFilter} onClick={setImpactFilter} />
        <ImpactCard label="Serious" count={seriousCount} impact="serious" active={impactFilter} onClick={setImpactFilter} />
        <ImpactCard label="Moderate" count={moderateCount} impact="moderate" active={impactFilter} onClick={setImpactFilter} />
        <ImpactCard label="Minor" count={minorCount} impact="minor" active={impactFilter} onClick={setImpactFilter} />
      </div>

      {/* axe-core summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
          <div className="text-2xl font-bold text-emerald-400">{accessibility.passes}</div>
          <div className="text-xs text-emerald-400 mt-1">Passes</div>
        </div>
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-center">
          <div className="text-2xl font-bold text-yellow-400">{accessibility.incomplete}</div>
          <div className="text-xs text-yellow-400 mt-1">Incomplete</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold text-muted-foreground">{accessibility.inapplicable}</div>
          <div className="text-xs text-muted-foreground mt-1">Inapplicable</div>
        </div>
      </div>

      {totalIssues === 0 ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center">
          <div className="text-4xl mb-3">✅</div>
          <h3 className="font-semibold text-emerald-400 mb-1">No Accessibility Violations Found</h3>
          <p className="text-sm text-muted-foreground">All tested WCAG 2.1 AA rules pass. Great work!</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold">Violations ({sorted.length})</h3>
            <div className="flex gap-2">
              <FilterBtn active={impactFilter === 'all'} onClick={() => setImpactFilter('all')}>All</FilterBtn>
              {['critical', 'serious', 'moderate', 'minor'].map(impact => (
                <FilterBtn key={impact} active={impactFilter === impact} onClick={() => setImpactFilter(impact)}>
                  <span className={IMPACT_CONFIG[impact].color}>{impact}</span>
                </FilterBtn>
              ))}
            </div>
          </div>

          <div className="divide-y divide-border">
            {sorted.map(violation => {
              const config = IMPACT_CONFIG[violation.impact]
              const isExpanded = expandedId === violation.id
              return (
                <div key={violation.id} className="px-5 py-4">
                  <button
                    className="w-full text-left"
                    onClick={() => setExpandedId(isExpanded ? null : violation.id)}
                  >
                    <div className="flex items-start gap-3">
                      <span className={cn('px-2 py-0.5 rounded border text-[10px] font-medium flex-shrink-0 mt-0.5', config.bg, config.color)}>
                        {violation.impact}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-left">{violation.help}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 text-left">{violation.id}</div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right">
                          <div className="text-xs font-medium">{violation.nodes.length}</div>
                          <div className="text-[10px] text-muted-foreground">elements</div>
                        </div>
                        <svg className={cn('w-4 h-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    {violation.wcagCriteria.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1 ml-14">
                        {violation.wcagCriteria.slice(0, 6).map(criteria => (
                          <span key={criteria} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary font-mono text-muted-foreground">
                            {criteria}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>

                  {isExpanded && (
                    <div className="mt-3 ml-14 space-y-3">
                      <p className="text-xs text-muted-foreground">{violation.description}</p>

                      {violation.nodes.slice(0, 3).map((node, i) => (
                        <div key={i} className="rounded-lg border border-border bg-secondary/20 p-3">
                          <div className="text-[10px] text-muted-foreground mb-1.5">Element {i + 1}: {node.target.join(', ')}</div>
                          <code className="text-[11px] font-mono block bg-background rounded px-2 py-1.5 overflow-x-auto text-muted-foreground">
                            {node.html}
                          </code>
                          {node.failureSummary && (
                            <p className="text-xs text-red-400 mt-2">{node.failureSummary}</p>
                          )}
                        </div>
                      ))}

                      <a href={violation.helpUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        Learn more about this rule →
                      </a>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ImpactCard({ label, count, impact, active, onClick }: {
  label: string; count: number; impact: string; active: string; onClick: (v: string) => void
}) {
  const config = IMPACT_CONFIG[impact]
  return (
    <button
      onClick={() => onClick(active === impact ? 'all' : impact)}
      className={cn('rounded-xl border p-4 text-center transition-all', config.bg,
        active === impact ? 'ring-1 ring-current ring-offset-1 ring-offset-background' : 'hover:opacity-80')}>
      <div className={cn('text-2xl font-bold', config.color)}>{count}</div>
      <div className={cn('text-xs mt-1', config.color)}>{label}</div>
    </button>
  )
}

function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={cn('px-2.5 py-1 rounded text-xs border transition-colors capitalize',
        active ? 'bg-primary/20 border-primary/40 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
      {children}
    </button>
  )
}
