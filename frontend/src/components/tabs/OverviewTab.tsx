import type { AnalysisResult } from '@/store'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { getGradeColor, getGradeBg, formatBytes, formatCo2, getRatingColor, getImpactBadge, cn } from '@/lib/utils'

interface Props {
  result: AnalysisResult
  onTabChange: (tab: string) => void
}

export function OverviewTab({ result, onTabChange }: Props) {
  const { scores, carbon, performance, technologies, security, recommendations } = result

  // Resource pie data
  const pieData = Object.entries(carbon.resourceBreakdown)
    .filter(([key]) => key !== 'total')
    .map(([key, stats]) => ({
      name: key.charAt(0).toUpperCase() + key.slice(1),
      value: stats.transferSize,
      color: {
        html: '#60A5FA', javascript: '#FBBF24', css: '#A78BFA',
        images: '#34D399', fonts: '#F472B6', video: '#FB923C',
        xhr: '#38BDF8', other: '#6B7280',
      }[key] ?? '#6B7280',
    }))
    .filter(d => d.value > 0)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Score cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Carbon', grade: scores.carbon.grade, sub: formatCo2(scores.carbon.co2PerViewG) + '/view', tab: 'carbon' },
          { label: 'Performance', grade: scores.performance.grade, sub: `${scores.performance.score}/100`, tab: 'performance' },
          { label: 'Security', grade: scores.security.grade, sub: `${scores.security.score}/100`, tab: 'security' },
          { label: 'Accessibility', grade: scores.accessibility.grade, sub: `${scores.accessibility.score}/100`, tab: 'accessibility' },
          { label: 'SEO', grade: scores.seo.grade, sub: `${scores.seo.score}/100`, tab: 'seo' },
          { label: 'Composite', grade: scores.composite.grade, sub: `${scores.composite.score}/100`, tab: 'overview' },
        ].map(s => (
          <button
            key={s.label}
            onClick={() => s.tab !== 'overview' && onTabChange(s.tab)}
            className="rounded-xl border border-border bg-card p-4 text-center hover:border-primary/30 transition-colors group"
          >
            <GradeCircle grade={s.grade} size={56} />
            <div className="mt-2 font-medium text-xs">{s.label}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{s.sub}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Carbon summary */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">🌿 Carbon Footprint</h3>
          <div className="space-y-3">
            <div>
              <div className="text-3xl font-bold text-primary">{formatCo2(carbon.models.hybrid)}</div>
              <div className="text-xs text-muted-foreground">per page view (hybrid model)</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="SWD v4" value={formatCo2(carbon.models.swd)} />
              <MiniStat label="1byte" value={formatCo2(carbon.models.onebyte)} />
              <MiniStat label="Transfer" value={formatBytes(carbon.transferSizeBytes)} />
              <MiniStat label="Requests" value={String(performance.networkRequests.length)} />
            </div>
            {carbon.models.greenHosting && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 rounded-lg px-3 py-2 border border-emerald-500/20">
                🌱 Green hosting: {carbon.models.greenHostingProvider ?? 'detected'}
              </div>
            )}
          </div>
        </div>

        {/* Resource breakdown pie */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">📦 Resource Breakdown</h3>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={100} height={100}>
              <PieChart>
                <Pie data={pieData} dataKey="value" innerRadius={28} outerRadius={45} strokeWidth={1} stroke="hsl(222 47% 11%)">
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatBytes(v)} contentStyle={{ background: 'hsl(224 71% 7%)', border: '1px solid hsl(222 47% 14%)', borderRadius: 8, fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1.5">
              {pieData.slice(0, 6).map(d => (
                <div key={d.name} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: d.color }} />
                    <span className="text-xs text-muted-foreground">{d.name}</span>
                  </div>
                  <span className="text-xs font-mono">{formatBytes(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Web vitals */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">⚡ Core Web Vitals</h3>
          <div className="space-y-3">
            {[
              { label: 'LCP', metric: performance.webVitals.lcp },
              { label: 'FCP', metric: performance.webVitals.fcp },
              { label: 'TTFB', metric: performance.webVitals.ttfb },
              { label: 'TBT', metric: performance.webVitals.tbt },
              { label: 'CLS', metric: performance.webVitals.cls },
            ].map(({ label, metric }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground w-10">{label}</span>
                <div className="flex-1 mx-3 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', {
                      'bg-emerald-500': metric.rating === 'good',
                      'bg-yellow-500': metric.rating === 'needs-improvement',
                      'bg-red-500': metric.rating === 'poor',
                    })}
                    style={{ width: `${metric.rating === 'good' ? 33 : metric.rating === 'needs-improvement' ? 66 : 100}%` }}
                  />
                </div>
                <span className={cn('text-xs font-mono w-20 text-right', getRatingColor(metric.rating))}>
                  {metric.displayValue}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tech summary */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">🔍 Technology Stack</h3>
          <div className="grid grid-cols-2 gap-2">
            {technologies.summary.cms && <TechPill label="CMS" value={technologies.summary.cms} />}
            {technologies.summary.framework && <TechPill label="Framework" value={technologies.summary.framework} />}
            {technologies.summary.server && <TechPill label="Server" value={technologies.summary.server} />}
            {technologies.summary.hosting && <TechPill label="Hosting" value={technologies.summary.hosting} />}
            {technologies.summary.cdn && <TechPill label="CDN" value={technologies.summary.cdn} />}
            {technologies.summary.language && <TechPill label="Language" value={technologies.summary.language} />}
            {technologies.summary.analytics.length > 0 && <TechPill label="Analytics" value={technologies.summary.analytics[0]} />}
            {technologies.summary.tagManagers.length > 0 && <TechPill label="Tag Mgr" value={technologies.summary.tagManagers[0]} />}
          </div>
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>{technologies.detected.length} technologies detected</span>
            <button onClick={() => onTabChange('technologies')} className="text-primary hover:underline">View all →</button>
          </div>
        </div>

        {/* Top recommendations */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">💡 Top Recommendations</h3>
          <div className="space-y-2.5">
            {recommendations.slice(0, 4).map(rec => (
              <div key={rec.id} className="flex items-start gap-2.5">
                <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 border', getImpactBadge(rec.impact))}>
                  {rec.impact}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium leading-tight">{rec.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{rec.description}</p>
                </div>
              </div>
            ))}
          </div>
          {recommendations.length > 4 && (
            <p className="mt-3 text-xs text-muted-foreground text-center">+{recommendations.length - 4} more recommendations</p>
          )}
        </div>
      </div>

      {/* Security & Third Parties quick view */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">🔒 Security Headers</h3>
          <div className="space-y-2">
            {[
              { label: 'HSTS', result: security.headers.hsts },
              { label: 'CSP', result: security.headers.csp },
              { label: 'X-Frame-Options', result: security.headers.xFrameOptions },
              { label: 'Referrer-Policy', result: security.headers.referrerPolicy },
              { label: 'Permissions-Policy', result: security.headers.permissionsPolicy },
            ].map(({ label, result: hr }) => (
              <div key={label} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <div className="flex items-center gap-2">
                  <span className={hr.present ? 'text-emerald-400' : 'text-red-400'}>
                    {hr.present ? '✓' : '✗'}
                  </span>
                  <span className={cn('font-medium', getGradeColor(hr.grade))}>{hr.grade}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-border text-xs text-right">
            <button onClick={() => onTabChange('security')} className="text-primary hover:underline">Full report →</button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">👁 Third-Party Impact</h3>
          <div className="space-y-2">
            {result.thirdParties.slice(0, 5).map(tp => (
              <div key={tp.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn('px-1.5 py-0.5 rounded text-[10px] border flex-shrink-0', {
                    'bg-red-500/10 text-red-400 border-red-500/20': tp.gdprCategory === 'advertising',
                    'bg-orange-500/10 text-orange-400 border-orange-500/20': tp.gdprCategory === 'tracking',
                    'bg-blue-500/10 text-blue-400 border-blue-500/20': tp.gdprCategory === 'functional',
                    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20': tp.gdprCategory === 'essential',
                  })}>
                    {tp.gdprCategory}
                  </span>
                  <span className="truncate text-muted-foreground">{tp.name}</span>
                </div>
                <span className="text-muted-foreground flex-shrink-0">{tp.requestCount} req</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-border text-xs flex items-center justify-between text-muted-foreground">
            <span>{result.thirdParties.length} providers detected</span>
            <button onClick={() => onTabChange('third-parties')} className="text-primary hover:underline">View all →</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function GradeCircle({ grade, size = 64 }: { grade: string; size?: number }) {
  const color = {
    'A+': '#10b981', A: '#22c55e', B: '#3b82f6', C: '#f59e0b', D: '#f97316', E: '#ef4444', F: '#dc2626',
  }[grade] ?? '#6b7280'

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="20" fill="none" stroke="hsl(222 47% 14%)" strokeWidth="3" />
        <circle cx="24" cy="24" r="20" fill="none" stroke={color} strokeWidth="3"
          strokeDasharray="125.6"
          strokeDashoffset="12.56"
          strokeLinecap="round"
          transform="rotate(-90 24 24)"
          opacity={0.8}
        />
      </svg>
      <span className="absolute font-bold" style={{ fontSize: size * 0.28, color }}>{grade}</span>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/50 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-xs font-medium font-mono mt-0.5">{value}</div>
    </div>
  )
}

function TechPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-xs font-medium mt-0.5 truncate">{value}</div>
    </div>
  )
}
