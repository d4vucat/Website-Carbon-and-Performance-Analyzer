import type { AnalysisResult } from '@/store'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { formatBytes, formatCo2, getGradeColor, getImpactBadge, cn } from '@/lib/utils'

interface Props { result: AnalysisResult }

const GRADE_DESC: Record<string, string> = {
  'A+': 'Exceptional — cleaner than 95% of pages tested',
  'A': 'Excellent — significantly cleaner than average',
  'B': 'Good — cleaner than most websites',
  'C': 'Average — typical for the web',
  'D': 'Below average — room for significant improvement',
  'E': 'Poor — heavy carbon footprint',
  'F': 'Critical — major environmental impact',
}

export function CarbonTab({ result }: Props) {
  const { carbon } = result

  const modelData = [
    { name: 'SWD v4', value: carbon.models.swd, fill: '#3b82f6' },
    { name: '1byte', value: carbon.models.onebyte, fill: '#8b5cf6' },
    { name: 'Hybrid', value: carbon.models.hybrid, fill: '#10b981' },
  ]

  const resourceData = Object.entries(carbon.resourceBreakdown)
    .filter(([k]) => k !== 'total' && carbon.resourceBreakdown[k as keyof typeof carbon.resourceBreakdown].transferSize > 0)
    .map(([k, v]) => ({
      name: k.charAt(0).toUpperCase() + k.slice(1),
      transfer: Math.round(v.transferSize / 1024),
      co2: v.co2Grams ? Math.round(v.co2Grams * 10000) / 10000 : 0,
      fill: { html: '#60A5FA', javascript: '#FBBF24', css: '#A78BFA', images: '#34D399', fonts: '#F472B6', video: '#FB923C', xhr: '#38BDF8', other: '#6B7280' }[k] ?? '#6B7280',
    }))
    .sort((a, b) => b.transfer - a.transfer)

  const equivalents = [
    { icon: '🫖', label: 'Kettle boils', value: carbon.equivalents.kettleBoils, unit: '' },
    { icon: '📱', label: 'Phone charges', value: carbon.equivalents.smartphoneCharges, unit: '' },
    { icon: '💡', label: 'LED bulb hours', value: carbon.equivalents.ledBulbHours, unit: '' },
    { icon: '🚗', label: 'Car km', value: carbon.equivalents.carKm, unit: 'km' },
    { icon: '✈️', label: 'Flight km', value: carbon.equivalents.flightKm, unit: 'km' },
    { icon: '🌳', label: 'Tree year %', value: carbon.equivalents.treeYearPercent, unit: '%' },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Hero metric */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="flex-1">
            <div className="text-xs text-muted-foreground mb-1">CO₂ per page view (Hybrid Model)</div>
            <div className="text-5xl font-bold tracking-tight text-primary mb-1">
              {formatCo2(carbon.models.hybrid)}
            </div>
            <div className={cn('text-2xl font-bold mb-2', getGradeColor(carbon.models.grade))}>
              Grade {carbon.models.grade}
            </div>
            <p className="text-sm text-muted-foreground">
              {GRADE_DESC[carbon.models.grade] ?? ''}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:w-72">
            <InfoCard label="Server Country" value={carbon.models.serverLocation.country} icon="🌍" />
            <InfoCard label="Grid Intensity" value={`${carbon.models.gridIntensity} gCO₂/kWh`} icon="⚡" />
            <InfoCard label="Green Hosting" value={carbon.models.greenHosting ? '✓ Yes' : '✗ No'} icon="🌱"
              className={carbon.models.greenHosting ? 'text-emerald-400' : 'text-red-400'} />
            <InfoCard label="Transfer Size" value={formatBytes(carbon.transferSizeBytes)} icon="📦" />
            {carbon.models.annualCo2Kg && (
              <InfoCard label="Annual (1M visits)" value={`${Number(carbon.models.annualCo2Kg).toFixed(1)} kg`} icon="📅" />
            )}
            <InfoCard label="3rd Party CO₂" value={formatCo2(carbon.thirdPartyCo2G)} icon="👁" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Model comparison */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Carbon Model Comparison</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={modelData} layout="vertical" margin={{ left: 8, right: 8, top: 0, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} tickFormatter={v => formatCo2(v)} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(215 20% 55%)' }} width={54} />
              <Tooltip formatter={(v: number) => [formatCo2(v), 'CO₂']} contentStyle={{ background: 'hsl(224 71% 7%)', border: '1px solid hsl(222 47% 14%)', borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {modelData.map((m, i) => <Cell key={i} fill={m.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
            <p><strong className="text-foreground">SWD v4:</strong> Sustainable Web Design model — segment-weighted kWh/GB × grid intensity.</p>
            <p><strong className="text-foreground">1byte:</strong> Simple model — 0.06 kWh/GB × grid intensity.</p>
            <p><strong className="text-foreground">Hybrid:</strong> Our model — per-resource-type multipliers + JS execution + 3rd-party domain overhead.</p>
          </div>
        </div>

        {/* Resource breakdown chart */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">Resource CO₂ Breakdown</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={resourceData} margin={{ left: 0, right: 8, top: 0, bottom: 20 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} angle={-30} textAnchor="end" />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} tickFormatter={v => `${v}KB`} />
              <Tooltip formatter={(v: number, name: string) => [name === 'transfer' ? `${v} KB` : `${v}g CO₂`, name === 'transfer' ? 'Transfer' : 'CO₂']} contentStyle={{ background: 'hsl(224 71% 7%)', border: '1px solid hsl(222 47% 14%)', borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="transfer" radius={[3, 3, 0, 0]}>
                {resourceData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Carbon equivalents */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4">⚖️ Carbon Equivalents <span className="text-xs font-normal text-muted-foreground">(per page view)</span></h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {equivalents.map(eq => (
            <div key={eq.label} className="rounded-lg bg-secondary/50 p-3 text-center">
              <div className="text-2xl mb-2">{eq.icon}</div>
              <div className="text-sm font-bold font-mono">{Number(eq.value).toFixed(4)}{eq.unit}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{eq.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Resource table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">Resource Size Details</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {['Type', 'Requests', 'Transfer', 'Decoded', 'Ratio', 'CO₂'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(carbon.resourceBreakdown).map(([key, stats]) => (
                <tr key={key} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-sm" style={{ background: { html: '#60A5FA', javascript: '#FBBF24', css: '#A78BFA', images: '#34D399', fonts: '#F472B6', video: '#FB923C', xhr: '#38BDF8', other: '#6B7280', total: '#fff' }[key] ?? '#6b7280' }} />
                      <span className="font-medium capitalize">{key}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{stats.count}</td>
                  <td className="px-4 py-2.5 font-mono">{formatBytes(stats.transferSize)}</td>
                  <td className="px-4 py-2.5 font-mono">{formatBytes(stats.decodedSize)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {stats.decodedSize > 0 ? `${Math.round((stats.transferSize / stats.decodedSize) * 100)}%` : '—'}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-primary">{stats.co2Grams ? formatCo2(stats.co2Grams) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recommendations */}
      {carbon.recommendations.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">💡 Carbon Reduction Recommendations</h3>
          <div className="space-y-3">
            {carbon.recommendations.map(rec => (
              <div key={rec.id} className="rounded-lg border border-border bg-secondary/20 p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h4 className="text-sm font-medium">{rec.title}</h4>
                  <span className={cn('px-2 py-0.5 rounded text-[10px] font-medium border flex-shrink-0', getImpactBadge(rec.impact))}>
                    {rec.impact} impact
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{rec.description}</p>
                {rec.estimatedCo2SaveG && (
                  <div className="text-xs text-emerald-400">
                    ≈ Save {formatCo2(rec.estimatedCo2SaveG)} CO₂/view
                  </div>
                )}
                {rec.codeSnippet && (
                  <pre className="mt-3 p-3 rounded-lg bg-background border border-border text-[11px] font-mono overflow-x-auto text-emerald-300">
                    {rec.codeSnippet}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function InfoCard({ label, value, icon, className }: { label: string; value: string; icon: string; className?: string }) {
  return (
    <div className="rounded-lg bg-secondary/50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-base">{icon}</span>
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
      <div className={cn('text-xs font-medium', className)}>{value}</div>
    </div>
  )
}
