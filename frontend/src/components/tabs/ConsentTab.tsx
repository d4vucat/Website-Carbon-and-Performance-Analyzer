import type { AnalysisResult } from '@/store'
import { cn } from '@/lib/utils'

interface Props { result: AnalysisResult }

// Extended result with new fields
type ExtResult = AnalysisResult & {
  consent?: {
    hasCMP: boolean; cmpName?: string; cmpType: string
    iabTcfVersion?: string; iabTcfCompliant: boolean
    iabTcfData?: {
      version: string | null
      cmpId: number | null
      vendorCount: number
      apiCallSuccess: boolean
      gdprApplies: boolean | null
      uspString: string | null
      gppDetected: boolean
      purposes?: Array<{ id: number; name: string; hasConsent: boolean | null; hasLegitimateInterest: boolean | null }>
    } | null
    cookieBannerDetected: boolean
    defaultConsent: 'opt-in' | 'opt-out' | 'unclear' | 'none'
    analyticsBeforeConsent: boolean
    consentSignals: string[]
    gdprScore: number; gdprIssues: string[]; gdprRecommendations: string[]
    cookieAudit?: {
      total: number
      tracking: number
      advertising: number
      avgSecurityScore: number
      criticalIssues: number
    }
  }
  sustainability?: {
    autoplayVideos: { count: number; totalEstimatedBytes: number; urls: string[] }
    animatedGifs: { count: number; totalBytes: number; estimatedWebmSavingBytes: number }
    imageFormatAudit: {
      jpegCount: number; pngCount: number; webpCount: number; avifCount: number
      modernFormatPercentage: number; imagesWithoutSrcset: number; imagesWithoutDimensions: number
      estimatedSavingBytes: number
    }
    infiniteScroll: { detected: boolean }
    selfHostedFonts: { percentage: number; externalFontDomains: string[] }
    cacheEfficiency: { immutableAssetsPercentage: number; longCacheAssetsPercentage: number; score: number; estimatedReturnVisitorSavingBytes: number }
    resourceHints: { preloadedLcp: boolean; preconnectedThirdParties: number; prefetchedPages: number; totalPreloads: number; missingPreconnects: string[] }
    unnecessaryTracking: { trackingPixelCount: number; estimatedCo2SaveG: number; pixelDetails: Array<{ name: string; url: string; purpose: string }> }
    javascriptBloat: { totalKb: number; unusedPercentage: number; duplicateLibraries: string[]; budgetExceededKb: number }
    imageCdnDetected: boolean; imageCdnName?: string; imageCdnScore: number
    overallSustainabilityScore: number; sustainabilityGrade: string
  }
  security: AnalysisResult['security'] & {
    botProtection?: {
      detected: boolean
      providers: Array<{ name: string; type: string; confidence: number; detectedVia: string }>
      sriCoverage: { externalScripts: number; withSri: number; withoutSri: number; percentage: number }
      rateLimitingDetected: boolean; rateLimitHeaders: Record<string, string>
      csrfProtection: boolean; formSecurityScore: number
    }
    sslLabs?: {
      grade?: string; hasWarnings: boolean; isExceptional: boolean
      protocols: Array<{ name: string; version: string; enabled: boolean }>
      vulnerabilities: Record<string, boolean | string>
      forwardSecrecy: boolean; supportsHsts: boolean
      certChain: Array<{ subject: string; issuer: string; notAfter: number }>
    }
    hstsPreloadStatus?: string
  }
  performance: AnalysisResult['performance'] & {
    crux?: {
      hasData: boolean
      metrics: Record<string, { percentiles: { p75: number }; rating: string } | undefined>
      collectionPeriod?: { firstDate: string; lastDate: string }
    }
  }
  modernApis?: {
    fetchPriority?: { hasLcpImagePreload: boolean; fetchPriorityHighCount: number; missingOnLcp: boolean }
    speculationRules?: { detected: boolean; ruleCount: number }
    importMaps?: { detected: boolean; mappingCount: number }
    viewTransitions?: { detected: boolean }
    bfCacheEligibility?: { eligible: boolean; disqualifiers: string[]; score: number }
    schedulerApi?: boolean; navigationApi?: boolean; declarativeShadowDom?: boolean
    trustedTypes?: boolean; broadcastChannel?: boolean
  }
}

export function ConsentTab({ result }: Props) {
  const r = result as ExtResult
  const consent = r.consent
  const sustainability = r.sustainability

  if (!consent && !sustainability) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        Consent and sustainability data not available for this analysis.
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* GDPR Score */}
      {consent && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <ScoreCard
              label="GDPR Score"
              value={consent.gdprScore}
              color={consent.gdprScore >= 80 ? 'text-emerald-400' : consent.gdprScore >= 50 ? 'text-yellow-400' : 'text-red-400'}
            />
            <StatusCard label="CMP Detected" ok={consent.hasCMP} value={consent.cmpName ?? (consent.hasCMP ? 'Unknown' : 'None')} />
            <StatusCard label="Cookie Banner" ok={consent.cookieBannerDetected} value={consent.cookieBannerDetected ? 'Found' : 'Not found'} />
            <StatusCard label="IAB TCF" ok={consent.iabTcfCompliant} value={consent.iabTcfVersion ? `v${consent.iabTcfVersion}` : 'Not detected'} />
          </div>

          {/* Cookie audit quick stats */}
          {consent.cookieAudit && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Cookie Overview</h3>
                <span className="text-xs text-muted-foreground">Full details in Cookie Audit tab →</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="text-center">
                  <div className="text-xl font-bold">{consent.cookieAudit.total}</div>
                  <div className="text-[10px] text-muted-foreground">Total cookies</div>
                </div>
                <div className="text-center">
                  <div className={cn('text-xl font-bold', (consent.cookieAudit.tracking + consent.cookieAudit.advertising) > 0 ? 'text-orange-400' : 'text-emerald-400')}>
                    {consent.cookieAudit.tracking + consent.cookieAudit.advertising}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Tracking / ads</div>
                </div>
                <div className="text-center">
                  <div className={cn('text-xl font-bold', consent.cookieAudit.avgSecurityScore < 70 ? 'text-orange-400' : 'text-emerald-400')}>
                    {consent.cookieAudit.avgSecurityScore}/100
                  </div>
                  <div className="text-[10px] text-muted-foreground">Avg security score</div>
                </div>
                <div className="text-center">
                  <div className={cn('text-xl font-bold', consent.cookieAudit.criticalIssues > 0 ? 'text-red-400' : 'text-emerald-400')}>
                    {consent.cookieAudit.criticalIssues}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Critical issues</div>
                </div>
              </div>
            </div>
          )}

          {/* IAB TCF quick summary */}
          {consent.iabTcfData && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">IAB TCF {consent.iabTcfData.version ? `v${consent.iabTcfData.version}` : ''}</h3>
                <span className={cn(
                  'text-xs px-2 py-0.5 rounded border',
                  consent.iabTcfData.apiCallSuccess
                    ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                    : 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'
                )}>
                  {consent.iabTcfData.apiCallSuccess ? '✓ API responded' : 'API detected only'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center text-xs">
                <div>
                  <div className="font-bold text-base">
                    {consent.iabTcfData.vendorCount > 0 ? consent.iabTcfData.vendorCount : '—'}
                  </div>
                  <div className="text-muted-foreground">Vendors with consent</div>
                </div>
                <div>
                  <div className="font-bold text-base">
                    {consent.iabTcfData.gdprApplies === true ? 'Yes'
                      : consent.iabTcfData.gdprApplies === false ? 'No' : '—'}
                  </div>
                  <div className="text-muted-foreground">GDPR applies</div>
                </div>
                <div>
                  <div className="font-bold text-base">
                    {consent.iabTcfData.gppDetected ? '✓' : '—'}
                  </div>
                  <div className="text-muted-foreground">GPP detected</div>
                </div>
              </div>
              {consent.iabTcfData.uspString && (
                <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">CCPA:</span>
                  <code className="font-mono bg-secondary/50 px-1.5 py-0.5 rounded text-foreground">
                    {consent.iabTcfData.uspString}
                  </code>
                  <span className="text-muted-foreground">Full breakdown in Cookie Audit → IAB TCF tab</span>
                </div>
              )}
            </div>
          )}

          {/* Analytics before consent — critical violation */}
          {consent.analyticsBeforeConsent && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4">
              <div className="flex items-start gap-3">
                <span className="text-xl flex-shrink-0">🚨</span>
                <div>
                  <h3 className="font-semibold text-red-400 text-sm mb-1">Critical GDPR Violation: Analytics loaded before consent</h3>
                  <p className="text-xs text-muted-foreground">
                    Tracking scripts (analytics, advertising) are loading without obtaining user consent first.
                    This is a violation of GDPR Article 7 and ePrivacy Directive and can result in significant fines.
                  </p>
                  <p className="text-xs text-red-400 mt-2 font-medium">
                    Fix: Configure your CMP to block third-party scripts until consent is granted.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Default consent */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-4">🔏 Consent Analysis</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <InfoPill label="CMP Type" value={consent.cmpType.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} />
              <InfoPill label="Default Consent" value={consent.defaultConsent}
                className={consent.defaultConsent === 'opt-in' ? 'text-emerald-400' : consent.defaultConsent === 'opt-out' ? 'text-red-400' : 'text-yellow-400'} />
              <InfoPill label="IAB TCF Version" value={consent.iabTcfVersion ?? 'N/A'} />
            </div>

            {/* Detection signals */}
            {consent.consentSignals.length > 0 && (
              <div className="mt-4">
                <h4 className="text-xs text-muted-foreground mb-2">Detection signals</h4>
                <div className="space-y-1">
                  {consent.consentSignals.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-emerald-400">✓</span>
                      <span className="text-muted-foreground">{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* GDPR Issues */}
          {(consent.gdprIssues.length > 0 || consent.gdprRecommendations.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {consent.gdprIssues.length > 0 && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                  <h3 className="text-sm font-semibold text-red-400 mb-3">⚠️ Issues</h3>
                  <div className="space-y-2">
                    {consent.gdprIssues.map((issue, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className="text-red-400 flex-shrink-0 mt-0.5">✗</span>
                        <span>{issue}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {consent.gdprRecommendations.length > 0 && (
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                  <h3 className="text-sm font-semibold text-blue-400 mb-3">💡 Recommendations</h3>
                  <div className="space-y-2">
                    {consent.gdprRecommendations.map((rec, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className="text-blue-400 flex-shrink-0 mt-0.5">→</span>
                        <span>{rec}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Sustainability Audit */}
      {sustainability && (
        <>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">🌿 Sustainability Audit</h3>
              <div className="flex items-center gap-2">
                <span className={cn('text-2xl font-bold', getGradeColor(sustainability.sustainabilityGrade))}>
                  {sustainability.sustainabilityGrade}
                </span>
                <span className="text-xs text-muted-foreground">{sustainability.overallSustainabilityScore}/100</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SustainMetric
                label="Cache Score"
                value={sustainability.cacheEfficiency.score}
                suffix="%"
                good={sustainability.cacheEfficiency.score >= 70}
              />
              <SustainMetric
                label="Modern Images"
                value={sustainability.imageFormatAudit.modernFormatPercentage}
                suffix="%"
                good={sustainability.imageFormatAudit.modernFormatPercentage >= 60}
              />
              <SustainMetric
                label="Self-hosted Fonts"
                value={sustainability.selfHostedFonts.percentage}
                suffix="%"
                good={sustainability.selfHostedFonts.percentage >= 80}
              />
              <SustainMetric
                label="Image CDN"
                value={sustainability.imageCdnScore}
                suffix="%"
                good={sustainability.imageCdnDetected}
              />
            </div>
          </div>

          {/* Autoplay videos */}
          {sustainability.autoplayVideos.count > 0 && (
            <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span>🎥</span>
                <h4 className="text-sm font-semibold text-orange-400">
                  {sustainability.autoplayVideos.count} Autoplay Video{sustainability.autoplayVideos.count > 1 ? 's' : ''} Detected
                </h4>
              </div>
              <p className="text-xs text-muted-foreground">
                Autoplay videos are always downloaded on page load. Video has 3× the carbon footprint per byte.
                Consider pausing until user interaction using <code className="text-orange-300">autoplay</code> + <code className="text-orange-300">muted</code> + <code className="text-orange-300">preload="none"</code>.
              </p>
            </div>
          )}

          {/* Animated GIFs */}
          {sustainability.animatedGifs.count > 0 && (
            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span>🖼️</span>
                  <h4 className="text-sm font-semibold text-yellow-400">
                    {sustainability.animatedGifs.count} Animated GIF{sustainability.animatedGifs.count > 1 ? 's' : ''}
                  </h4>
                </div>
                <span className="text-xs text-yellow-400 font-mono">
                  ~{Math.round(sustainability.animatedGifs.estimatedWebmSavingBytes / 1024)}KB saveable with WebM
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Converting GIFs to WebM/MP4 typically reduces file size by 85%.
              </p>
            </div>
          )}

          {/* Image Format Audit */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-4">📸 Image Format Audit</h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
              {[
                { label: 'JPEG', count: sustainability.imageFormatAudit.jpegCount, modern: false },
                { label: 'PNG', count: sustainability.imageFormatAudit.pngCount, modern: false },
                { label: 'WebP', count: sustainability.imageFormatAudit.webpCount, modern: true },
                { label: 'AVIF', count: sustainability.imageFormatAudit.avifCount, modern: true },
              ].map(f => (
                <div key={f.label} className={cn('rounded-lg border p-2.5 text-center', f.modern ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-border bg-secondary/30')}>
                  <div className={cn('text-lg font-bold', f.modern ? 'text-emerald-400' : f.count > 0 ? 'text-yellow-400' : 'text-muted-foreground')}>{f.count}</div>
                  <div className="text-[10px] text-muted-foreground">{f.label}</div>
                </div>
              ))}
            </div>
            <div className="space-y-1.5 text-xs">
              {sustainability.imageFormatAudit.imagesWithoutSrcset > 0 && (
                <div className="text-yellow-400">⚠ {sustainability.imageFormatAudit.imagesWithoutSrcset} images missing <code>srcset</code> — same size served to all devices</div>
              )}
              {sustainability.imageFormatAudit.imagesWithoutDimensions > 0 && (
                <div className="text-orange-400">⚠ {sustainability.imageFormatAudit.imagesWithoutDimensions} images missing width/height — CLS risk</div>
              )}
              {sustainability.imageFormatAudit.estimatedSavingBytes > 0 && (
                <div className="text-primary">🌿 Converting to WebP/AVIF could save ~{Math.round(sustainability.imageFormatAudit.estimatedSavingBytes / 1024)}KB</div>
              )}
            </div>
          </div>

          {/* Cache Efficiency */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-4">⚡ Cache Efficiency</h3>
            <div className="space-y-3">
              <CacheBar label="Immutable assets" pct={sustainability.cacheEfficiency.immutableAssetsPercentage} color="bg-emerald-500" />
              <CacheBar label="Long-cache (>1 day)" pct={sustainability.cacheEfficiency.longCacheAssetsPercentage} color="bg-blue-500" />
              <CacheBar label="No-cache / no-store" pct={Math.max(0, 100 - sustainability.cacheEfficiency.longCacheAssetsPercentage - sustainability.cacheEfficiency.immutableAssetsPercentage)} color="bg-red-500" bad />
            </div>
            {sustainability.cacheEfficiency.estimatedReturnVisitorSavingBytes > 0 && (
              <p className="text-xs text-primary mt-3">
                🌿 Optimal caching could save ~{Math.round(sustainability.cacheEfficiency.estimatedReturnVisitorSavingBytes / 1024)}KB for returning visitors
              </p>
            )}
          </div>

          {/* Resource Hints */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-4">🔗 Resource Hints</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <HintCard label="LCP Preloaded" ok={sustainability.resourceHints.preloadedLcp} />
              <HintCard label="Preconnects" ok={sustainability.resourceHints.preconnectedThirdParties > 0}
                value={`${sustainability.resourceHints.preconnectedThirdParties}`} />
              <HintCard label="Prefetches" ok={sustainability.resourceHints.prefetchedPages > 0}
                value={`${sustainability.resourceHints.prefetchedPages}`} />
              <HintCard label="Total Preloads" ok={sustainability.resourceHints.totalPreloads > 0}
                value={`${sustainability.resourceHints.totalPreloads}`} />
            </div>
            {sustainability.resourceHints.missingPreconnects.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">Missing preconnects for external domains:</p>
                <div className="flex flex-wrap gap-1.5">
                  {sustainability.resourceHints.missingPreconnects.map(d => (
                    <code key={d} className="text-[11px] px-2 py-1 rounded bg-secondary text-yellow-400">{d}</code>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* JS Bloat */}
          {sustainability.javascriptBloat.budgetExceededKb > 0 && (
            <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-5">
              <h3 className="text-sm font-semibold mb-3">📦 JavaScript Bloat</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                <InfoPill label="Total JS" value={`${sustainability.javascriptBloat.totalKb}KB`}
                  className={sustainability.javascriptBloat.totalKb > 300 ? 'text-red-400' : 'text-yellow-400'} />
                <InfoPill label="Unused" value={`${sustainability.javascriptBloat.unusedPercentage}%`}
                  className={sustainability.javascriptBloat.unusedPercentage > 40 ? 'text-red-400' : 'text-yellow-400'} />
                <InfoPill label="Over budget" value={`+${sustainability.javascriptBloat.budgetExceededKb}KB`} className="text-red-400" />
              </div>
              {sustainability.javascriptBloat.duplicateLibraries.length > 0 && (
                <div>
                  <p className="text-xs text-orange-400 font-medium mb-1">⚠ Duplicate libraries detected:</p>
                  {sustainability.javascriptBloat.duplicateLibraries.map(d => (
                    <div key={d} className="text-xs text-muted-foreground">• {d}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tracking pixels */}
          {sustainability.unnecessaryTracking.trackingPixelCount > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold mb-3">👁 Tracking Pixels ({sustainability.unnecessaryTracking.trackingPixelCount})</h3>
              <div className="space-y-2">
                {sustainability.unnecessaryTracking.pixelDetails.map((pixel, i) => (
                  <div key={i} className="flex items-center justify-between text-xs rounded-lg border border-border bg-secondary/20 px-3 py-2">
                    <span className="font-medium">{pixel.name}</span>
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px] border',
                      pixel.purpose === 'advertising' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20')}>
                      {pixel.purpose}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-primary mt-3">
                🌿 Removing these pixels could save ~{sustainability.unnecessaryTracking.estimatedCo2SaveG.toFixed(3)}g CO₂/view
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ScoreCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-center">
      <div className={cn('text-3xl font-bold', color)}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  )
}

function StatusCard({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={cn('text-sm font-medium flex items-center gap-1.5', ok ? 'text-emerald-400' : 'text-red-400')}>
        <span>{ok ? '✓' : '✗'}</span>
        <span>{value}</span>
      </div>
    </div>
  )
}

function InfoPill({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg bg-secondary/50 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={cn('text-xs font-medium mt-0.5', className)}>{value}</div>
    </div>
  )
}

function SustainMetric({ label, value, suffix, good }: { label: string; value: number; suffix: string; good: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
      <div className={cn('text-xl font-bold', good ? 'text-emerald-400' : value >= 50 ? 'text-yellow-400' : 'text-red-400')}>
        {value}{suffix}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1">{label}</div>
    </div>
  )
}

function CacheBar({ label, pct, color, bad }: { label: string; pct: number; color: string; bad?: boolean }) {
  return (
    <div>
      <div className="flex justify-between mb-1 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={bad && pct > 20 ? 'text-red-400' : 'text-foreground'}>{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function HintCard({ label, ok, value }: { label: string; ok: boolean; value?: string }) {
  return (
    <div className={cn('rounded-lg border p-3 text-center',
      ok ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-border bg-secondary/20')}>
      <div className={cn('text-sm font-bold', ok ? 'text-emerald-400' : 'text-muted-foreground')}>
        {value ?? (ok ? '✓' : '✗')}
      </div>
      <div className={cn('text-[10px] mt-1', ok ? 'text-emerald-400' : 'text-muted-foreground')}>{label}</div>
    </div>
  )
}

function getGradeColor(grade: string): string {
  if (grade === 'A+') return 'text-emerald-400'
  if (grade === 'A') return 'text-green-400'
  if (grade === 'B') return 'text-blue-400'
  if (grade === 'C') return 'text-yellow-400'
  if (grade === 'D') return 'text-orange-400'
  return 'text-red-400'
}
