import { cn } from '@/lib/utils'
import type { AnalysisResult } from '@/store'

interface Props { result: AnalysisResult }

function fmtBytes(b: number) {
  if (!b) return '0 B'
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(2)} MB`
}

const DISPLAY_LABEL: Record<string, string> = {
  swap: '✓ swap', fallback: '✓ fallback', optional: '✓ optional',
  block: '⚠ block', auto: '⚠ auto',
}
const FORMAT_COLOR: Record<string, string> = {
  woff2: 'text-emerald-400', woff: 'text-yellow-400', ttf: 'text-orange-400', otf: 'text-orange-400', eot: 'text-red-400',
}

export function FontsTab({ result }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fonts = (result as any).fonts as {
    totalFonts: number; totalBytes: number; thirdPartyFonts: number; selfHostedFonts: number
    woff2Count: number; legacyFormatCount: number; hasGoogleFonts: boolean; hasAdobeFonts: boolean
    foutRisk: boolean; foitRisk: boolean; renderBlockingFonts: number; preloadedFonts: number
    score: number; grade: string
    providers: Record<string, number>
    carbonEstimate: { totalCo2G: number }
    recommendations: Array<{ type: string; severity: string; message: string; estimatedSavingMs?: number; estimatedSavingBytes?: number }>
    fonts: Array<{
      family: string; url: string; format: string; bytes: number
      fontDisplay: string; isPreloaded: boolean; isSelfHosted: boolean
      provider: string | null; isVariableFont: boolean; weight: string; style: string
      issues: string[]
    }>
  } | undefined

  if (!fonts || fonts.totalFonts === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <div className="text-3xl mb-3">🔤</div>
        <p className="text-sm">No web fonts detected on this page.</p>
      </div>
    )
  }

  const gradeColor = fonts.score >= 80 ? 'text-emerald-400' : fonts.score >= 60 ? 'text-blue-400' : fonts.score >= 40 ? 'text-yellow-400' : 'text-red-400'

  return (
    <div className="space-y-5">
      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Font Score', value: `${fonts.grade}`, sub: `${fonts.score}/100`, color: gradeColor },
          { label: 'Total Fonts', value: fonts.totalFonts, sub: fmtBytes(fonts.totalBytes) },
          { label: 'WOFF2', value: `${fonts.woff2Count}/${fonts.totalFonts}`, sub: fonts.legacyFormatCount ? `${fonts.legacyFormatCount} legacy formats` : 'All modern', color: fonts.legacyFormatCount ? 'text-orange-400' : 'text-emerald-400' },
          { label: 'Font CO₂', value: `${fonts.carbonEstimate.totalCo2G.toFixed(5)}g`, sub: 'per page view' },
        ].map(c => (
          <div key={c.label} className="rounded-xl border border-border bg-card p-4">
            <div className={cn('text-xl font-bold', c.color ?? 'text-foreground')}>{c.value}</div>
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className="text-[10px] text-muted-foreground/70 mt-1">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Risk flags */}
      {(fonts.foitRisk || fonts.foutRisk || fonts.renderBlockingFonts > 0 || fonts.preloadedFonts === 0) && (
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4 space-y-1.5">
          <h3 className="text-sm font-semibold text-orange-400 mb-2">⚠️ Font Loading Issues</h3>
          {fonts.foitRisk && <p className="text-xs text-muted-foreground">• <strong className="text-orange-400">FOIT risk</strong> — font-display:block causes invisible text during load.</p>}
          {fonts.foutRisk && <p className="text-xs text-muted-foreground">• <strong className="text-yellow-400">FOUT risk</strong> — fonts using swap may cause layout shift when swapping.</p>}
          {fonts.renderBlockingFonts > 0 && <p className="text-xs text-muted-foreground">• <strong className="text-red-400">{fonts.renderBlockingFonts} render-blocking font(s)</strong> delay first paint.</p>}
          {fonts.preloadedFonts === 0 && fonts.totalFonts > 0 && <p className="text-xs text-muted-foreground">• <strong className="text-yellow-400">No fonts preloaded</strong> — add &lt;link rel="preload" as="font"&gt; for critical fonts.</p>}
        </div>
      )}

      {/* Provider breakdown */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3">Font Providers</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(fonts.providers).map(([provider, count]) => (
            <div key={provider} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary border border-border text-xs">
              <span className={provider === 'Self-hosted' ? 'text-emerald-400' : 'text-blue-400'}>{provider === 'Self-hosted' ? '🏠' : '☁️'}</span>
              <span className="text-foreground">{provider}</span>
              <span className="text-muted-foreground">×{count}</span>
            </div>
          ))}
        </div>
        {fonts.hasGoogleFonts && (
          <p className="text-xs text-muted-foreground mt-3">💡 Consider self-hosting Google Fonts to eliminate third-party DNS + TLS latency and improve privacy.</p>
        )}
      </div>

      {/* Font table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold">Font Details</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                {['Family', 'Format', 'Size', 'Display', 'Weight', 'Hosted', 'Preloaded', 'Variable', 'Issues'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] text-muted-foreground font-medium uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fonts.fonts.map((f, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-secondary/30">
                  <td className="px-3 py-2 font-medium">{f.family}</td>
                  <td className={cn('px-3 py-2 font-mono uppercase text-[10px]', FORMAT_COLOR[f.format] ?? 'text-muted-foreground')}>{f.format}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtBytes(f.bytes)}</td>
                  <td className={cn('px-3 py-2', f.fontDisplay === 'block' || f.fontDisplay === 'auto' ? 'text-orange-400' : 'text-emerald-400')}>
                    {DISPLAY_LABEL[f.fontDisplay] ?? f.fontDisplay}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{f.weight}</td>
                  <td className="px-3 py-2">
                    <span className={f.isSelfHosted ? 'text-emerald-400' : 'text-blue-400'}>{f.isSelfHosted ? 'Self' : f.provider ?? '3rd party'}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={f.isPreloaded ? 'text-emerald-400' : 'text-muted-foreground'}>{f.isPreloaded ? '✓' : '–'}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={f.isVariableFont ? 'text-emerald-400' : 'text-muted-foreground'}>{f.isVariableFont ? '✓ var' : '–'}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 flex-wrap">
                      {f.issues.map(issue => (
                        <span key={issue} className="text-[9px] px-1 py-0.5 rounded bg-orange-500/20 text-orange-300">{issue}</span>
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
      {fonts.recommendations.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-3">Font Recommendations</h3>
          <div className="space-y-2">
            {fonts.recommendations.map((r, i) => (
              <div key={i} className="rounded-lg border border-border bg-secondary/30 p-3 text-xs">
                <span className={cn('font-semibold mr-2', r.severity === 'high' || r.severity === 'critical' ? 'text-orange-400' : 'text-blue-400')}>
                  [{r.type}]
                </span>
                {r.message}
                {r.estimatedSavingMs && <span className="ml-2 text-emerald-400">~{r.estimatedSavingMs}ms faster</span>}
                {r.estimatedSavingBytes && <span className="ml-2 text-emerald-400">~{fmtBytes(r.estimatedSavingBytes)} saved</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
