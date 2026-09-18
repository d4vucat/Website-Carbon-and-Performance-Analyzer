import type { AnalysisResult } from '@/store'
import { cn } from '@/lib/utils'

interface Props { result: AnalysisResult }

export function SeoTab({ result }: Props) {
  const { seo } = result

  const checks = [
    { label: 'Page Title', pass: !!seo.title && seo.titleLength >= 10 && seo.titleLength <= 70, value: seo.title ? `"${seo.title}" (${seo.titleLength} chars)` : 'Missing', warning: seo.title && (seo.titleLength < 10 || seo.titleLength > 70) },
    { label: 'Meta Description', pass: !!seo.description && seo.descriptionLength >= 50 && seo.descriptionLength <= 160, value: seo.description ? `${seo.descriptionLength} chars` : 'Missing', warning: seo.description && (seo.descriptionLength < 50 || seo.descriptionLength > 160) },
    { label: 'Canonical URL', pass: !!seo.canonical, value: seo.canonical ?? 'Not set' },
    { label: 'H1 Heading', pass: seo.headingStructure.h1 === 1, value: `${seo.headingStructure.h1} found (should be exactly 1)`, warning: seo.headingStructure.h1 > 1 },
    { label: 'Sitemap', pass: seo.sitemapFound, value: seo.sitemapFound ? 'Found' : 'Not found' },
    { label: 'Robots.txt', pass: seo.robotsTxtFound, value: seo.robotsTxtFound ? 'Found' : 'Not found' },
    { label: 'Structured Data', pass: seo.structuredDataTypes.length > 0, value: seo.structuredDataTypes.length > 0 ? seo.structuredDataTypes.join(', ') : 'None detected' },
    { label: 'Image Alt Text', pass: seo.imageAltMissing === 0, value: seo.imageAltMissing === 0 ? 'All images have alt text' : `${seo.imageAltMissing} images missing alt`, warning: seo.imageAltMissing > 0 },
  ]

  const passCount = checks.filter(c => c.pass).length

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Score */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className={cn('text-4xl font-bold', result.scores.seo.score >= 70 ? 'text-emerald-400' : result.scores.seo.score >= 50 ? 'text-yellow-400' : 'text-red-400')}>
            {result.scores.seo.score}
          </div>
          <div className="text-xs text-muted-foreground mt-1">SEO Score</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold text-emerald-400">{passCount}/{checks.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Checks Passed</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold">{seo.ogCompleteness}%</div>
          <div className="text-xs text-muted-foreground mt-1">OG Completeness</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold">{seo.twitterCardCompleteness}%</div>
          <div className="text-xs text-muted-foreground mt-1">Twitter Card</div>
        </div>
      </div>

      {/* SEO checks */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">SEO Checklist</h3>
        </div>
        <div className="divide-y divide-border">
          {checks.map(check => (
            <div key={check.label} className="px-5 py-3 flex items-start gap-3">
              <div className={cn('w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5',
                check.pass ? 'bg-emerald-500/20 text-emerald-400' :
                check.warning ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400')}>
                {check.pass ? '✓' : check.warning ? '!' : '✗'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{check.label}</div>
                <div className={cn('text-xs mt-0.5 truncate',
                  check.pass ? 'text-muted-foreground' : check.warning ? 'text-yellow-400' : 'text-red-400')}>
                  {check.value}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Heading structure */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4">Heading Structure</h3>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const).map(h => (
            <div key={h} className="rounded-lg bg-secondary/50 p-3 text-center">
              <div className={cn('text-2xl font-bold', seo.headingStructure[h] === 0 ? 'text-muted-foreground' : h === 'h1' && seo.headingStructure[h] !== 1 ? 'text-red-400' : 'text-foreground')}>
                {seo.headingStructure[h]}
              </div>
              <div className="text-xs text-muted-foreground mt-1 uppercase">{h}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Open Graph */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3">Open Graph Tags</h3>
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-muted-foreground">Completeness</span>
            <span className="text-xs font-medium">{seo.ogCompleteness}%</span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${seo.ogCompleteness}%` }} />
          </div>
        </div>
        {Object.keys(seo.ogTags).length > 0 ? (
          <div className="space-y-2">
            {Object.entries(seo.ogTags).map(([key, value]) => (
              <div key={key} className="flex gap-3 text-xs">
                <span className="font-mono text-muted-foreground flex-shrink-0 w-28">og:{key}</span>
                <span className="truncate">{value}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-red-400">No Open Graph tags found. Add og:title, og:description, og:image for better social sharing.</p>
        )}
      </div>

      {/* Twitter Cards */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3">Twitter Card Tags</h3>
        {Object.keys(seo.twitterTags).length > 0 ? (
          <div className="space-y-2">
            {Object.entries(seo.twitterTags).map(([key, value]) => (
              <div key={key} className="flex gap-3 text-xs">
                <span className="font-mono text-muted-foreground flex-shrink-0 w-28">twitter:{key}</span>
                <span className="truncate">{value}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-red-400">No Twitter Card tags found.</p>
        )}
      </div>

      {/* Structured data */}
      {seo.structuredDataTypes.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-3">Structured Data (JSON-LD)</h3>
          <div className="flex flex-wrap gap-2">
            {seo.structuredDataTypes.map(type => (
              <span key={type} className="px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs">
                {type}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Hreflang */}
      {seo.hreflang && seo.hreflang.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-3">Hreflang ({seo.hreflang.length} languages)</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {seo.hreflang.map(({ lang, href }) => (
              <div key={lang} className="rounded-lg bg-secondary/50 px-3 py-2">
                <div className="text-xs font-medium">{lang}</div>
                <div className="text-[10px] text-muted-foreground truncate font-mono">{href}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
