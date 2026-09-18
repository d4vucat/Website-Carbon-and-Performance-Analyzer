import { cn } from '@/lib/utils'
import type { AnalysisResult } from '@/store'

interface Props { result: AnalysisResult }

function fmtBytes(b: number): string {
  if (!b) return '0 B'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(2)} MB`
}

const RATING_COLOR: Record<string, string> = {
  excellent: 'text-emerald-400',
  good: 'text-blue-400',
  'context-dependent': 'text-yellow-400',
  legacy: 'text-orange-400',
  bad: 'text-red-400',
}
const SEVERITY_COLOR: Record<string, string> = {
  critical: 'text-red-400 border-red-500/30 bg-red-500/5',
  high: 'text-orange-400 border-orange-500/30 bg-orange-500/5',
  medium: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/5',
  low: 'text-blue-400 border-blue-500/30 bg-blue-500/5',
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 text-xs text-muted-foreground">{label}</div>
      <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <div className="w-8 text-right text-xs font-semibold text-foreground">{value}</div>
    </div>
  )
}

export function ImagesTab({ result }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const images = (result as any).images as {
    totalImages: number
    totalBytes: number
    totalDecodedBytes: number
    potentialSavingBytes: number
    potentialSavingPct: number
    lcpImage: Record<string, unknown> | null
    duplicateGroups: Array<{ images: string[]; type: string }>
    formatDistribution: Record<string, number>
    scores: Record<string, number>
    carbonEstimate: { totalCo2G: number; potentialSavingCo2G: number; topOffenders: Array<{ url: string; bytes: number; co2G: number }> }
    memorySummary: { totalDecodedMb: number; pressureScore: number; level: string }
    images: Array<Record<string, unknown>>
  } | undefined

  if (!images) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <div className="text-3xl mb-3">🖼️</div>
        <p className="text-sm">Image analysis not available for this scan.</p>
      </div>
    )
  }

  const scoreColor = (s: number) => s >= 80 ? 'bg-emerald-500' : s >= 60 ? 'bg-blue-500' : s >= 40 ? 'bg-yellow-500' : 'bg-red-500'
  const memColor = { low: 'text-emerald-400', medium: 'text-yellow-400', high: 'text-orange-400', critical: 'text-red-400' }

  const topIssues = (images.images as Array<Record<string, unknown>>)
    .filter(i => Array.isArray(i.issues) && (i.issues as string[]).length > 0)
    .sort((a, b) => (b.bytes as number) - (a.bytes as number))
    .slice(0, 20)

  return (
    <div className="space-y-6">

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Images', value: images.totalImages, sub: `${fmtBytes(images.totalBytes)} total` },
          { label: 'Potential Saving', value: `${images.potentialSavingPct}%`, sub: fmtBytes(images.potentialSavingBytes), highlight: images.potentialSavingPct > 30 },
          { label: 'Decoded Memory', value: `${images.memorySummary.totalDecodedMb} MB`, sub: images.memorySummary.level, highlight: images.memorySummary.level === 'critical' || images.memorySummary.level === 'high' },
          { label: 'Image CO₂', value: `${images.carbonEstimate.totalCo2G.toFixed(4)}g`, sub: `${images.carbonEstimate.potentialSavingCo2G.toFixed(4)}g saveable` },
        ].map(c => (
          <div key={c.label} className={cn('rounded-xl border bg-card p-4', c.highlight ? 'border-orange-500/30' : 'border-border')}>
            <div className={cn('text-xl font-bold', c.highlight ? 'text-orange-400' : 'text-foreground')}>{c.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{c.label}</div>
            <div className="text-[10px] text-muted-foreground/70 mt-1">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Multi-dimensional Scores */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4">Image Optimization Scores</h3>
        <div className="space-y-2.5">
          {[
            { label: 'Format', key: 'format' },
            { label: 'Sizing', key: 'sizing' },
            { label: 'Responsive', key: 'responsive' },
            { label: 'Lazy Loading', key: 'lazyLoading' },
            { label: 'LCP Image', key: 'lcp' },
            { label: 'CLS Risk', key: 'cls' },
            { label: 'Accessibility', key: 'accessibility' },
            { label: 'Carbon Impact', key: 'carbon' },
          ].map(({ label, key }) => (
            <ScoreBar key={key} label={label} value={images.scores[key] ?? 0} color={scoreColor(images.scores[key] ?? 0)} />
          ))}
        </div>
      </div>

      {/* LCP Image Alert */}
      {images.lcpImage && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-start gap-3">
            <span className="text-xl">🚨</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-red-400 mb-1">LCP Image Detected</div>
              <div className="text-xs text-muted-foreground truncate mb-2">{String(images.lcpImage.url)}</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {[
                  { label: 'Size', value: fmtBytes(images.lcpImage.bytes as number) },
                  { label: 'Format', value: String(images.lcpImage.type).toUpperCase() },
                  { label: 'Natural', value: `${images.lcpImage.naturalWidth}×${images.lcpImage.naturalHeight}` },
                  { label: 'Displayed', value: `${images.lcpImage.displayWidth}×${images.lcpImage.displayHeight}` },
                  { label: 'Oversized', value: `${images.lcpImage.oversizedFactor}×` },
                  { label: 'Loading', value: String(images.lcpImage.loading) },
                  { label: 'Priority', value: String(images.lcpImage.fetchPriority) },
                  { label: 'CDN', value: String(images.lcpImage.cdnProvider ?? 'None') },
                ].map(m => (
                  <div key={m.label}>
                    <div className="text-muted-foreground">{m.label}</div>
                    <div className="font-medium text-foreground">{m.value}</div>
                  </div>
                ))}
              </div>
              {Array.isArray(images.lcpImage.issues) && (images.lcpImage.issues as string[]).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(images.lcpImage.issues as string[]).map((issue: string) => (
                    <span key={issue} className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/20">{issue}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Format Distribution */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3">Format Distribution</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(images.formatDistribution)
            .sort((a, b) => b[1] - a[1])
            .map(([fmt, count]) => (
              <div key={fmt} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary border border-border text-xs">
                <span className="font-mono text-foreground uppercase">{fmt}</span>
                <span className="text-muted-foreground">×{count}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Duplicate Groups */}
      {images.duplicateGroups.length > 0 && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4">
          <h3 className="text-sm font-semibold text-yellow-400 mb-2">⚠️ Duplicate Images Detected</h3>
          {images.duplicateGroups.slice(0, 5).map((grp, i) => (
            <div key={i} className="text-xs text-muted-foreground mb-1">
              <span className="text-yellow-400 mr-1">[{grp.type}]</span>
              {grp.images.join(', ')}
            </div>
          ))}
        </div>
      )}

      {/* Carbon Top Offenders */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3">🏭 Carbon Top Offenders</h3>
        <div className="space-y-2">
          {images.carbonEstimate.topOffenders.map((item, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="w-4 text-muted-foreground shrink-0">#{i + 1}</span>
              <div className="flex-1 min-w-0 truncate text-foreground font-mono text-[10px]">{item.url.split('/').pop()}</div>
              <span className="text-muted-foreground shrink-0">{fmtBytes(item.bytes)}</span>
              <span className="text-orange-400 shrink-0">{item.co2G.toFixed(5)}g</span>
            </div>
          ))}
        </div>
      </div>

      {/* Memory Pressure */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Memory Pressure</h3>
          <span className={cn('text-xs font-semibold', memColor[images.memorySummary.level as keyof typeof memColor])}>
            {images.memorySummary.level.toUpperCase()}
          </span>
        </div>
        <div className="h-3 bg-secondary rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', images.memorySummary.pressureScore > 75 ? 'bg-red-500' : images.memorySummary.pressureScore > 50 ? 'bg-orange-500' : images.memorySummary.pressureScore > 25 ? 'bg-yellow-500' : 'bg-emerald-500')}
            style={{ width: `${images.memorySummary.pressureScore}%` }}
          />
        </div>
        <div className="text-xs text-muted-foreground mt-2">{images.memorySummary.totalDecodedMb} MB decoded across {images.totalImages} images</div>
      </div>

      {/* Image Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold">All Images ({topIssues.length} with issues shown first)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                {['Image', 'Format', 'Size', 'Natural', 'Oversized', 'Loading', 'Rating', 'Issues'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topIssues.map((img, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-secondary/30">
                  <td className="px-3 py-2 max-w-[200px]">
                    <div className="truncate font-mono text-[10px] text-muted-foreground">{String(img.url).split('/').pop()?.slice(0, 40)}</div>
                    {!!img.isLCP && <span className="text-[9px] text-red-400">LCP</span>}
                    {!!img.isAboveFold && <span className="text-[9px] text-blue-400 ml-1">↑fold</span>}
                  </td>
                  <td className="px-3 py-2 font-mono uppercase text-[10px]">{String(img.type)}</td>
                  <td className="px-3 py-2">{fmtBytes(Number(img.bytes))}</td>
                  <td className="px-3 py-2 text-muted-foreground">{String(img.naturalWidth)}×{String(img.naturalHeight)}</td>
                  <td className="px-3 py-2">
                    <span className={cn(Number(img.oversizedFactor) > 2 ? 'text-orange-400' : 'text-muted-foreground')}>
                      {String(img.oversizedFactor)}×
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn(img.loading === 'lazy' ? 'text-emerald-400' : img.isLCP ? 'text-muted-foreground' : 'text-orange-400')}>
                      {String(img.loading)}
                    </span>
                  </td>
                  <td className={cn('px-3 py-2', RATING_COLOR[String(img.formatRating)])}>
                    {String(img.formatRating)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(img.issues as string[] | undefined ?? []).slice(0, 2).map((issue: string) => (
                        <span key={issue} className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">{issue}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recommendations */}
      {topIssues.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-3">Image Recommendations</h3>
          <div className="space-y-2">
            {topIssues.flatMap(img =>
              Array.isArray(img.recommendations)
                ? (img.recommendations as Array<{ type: string; severity: string; message: string; estimatedSavingPct?: number; estimatedSavingBytes?: number }>)
                    .filter((r) => r.severity === 'critical' || r.severity === 'high')
                    .map((r, ri) => (
                      <div key={`${img.url}-${ri}`} className={cn('rounded-lg border p-3', SEVERITY_COLOR[r.severity])}>
                        <div className="flex items-start gap-2">
                          <span className="text-[10px] font-semibold uppercase mt-0.5">{r.severity}</span>
                          <div className="flex-1 text-xs">{r.message}
                            {r.estimatedSavingPct && <span className="ml-1 text-muted-foreground">(~{r.estimatedSavingPct}% saving)</span>}
                          </div>
                        </div>
                      </div>
                    ))
                : []
            ).slice(0, 8)}
          </div>
        </div>
      )}
    </div>
  )
}
