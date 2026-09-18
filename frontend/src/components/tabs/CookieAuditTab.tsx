import { useState, useMemo } from 'react'
import type { AnalysisResult } from '@/store'
import { cn } from '@/lib/utils'

interface Props { result: AnalysisResult }

// Extended types to match backend output
interface AuditedCookie {
  name: string
  value: string
  domain: string
  path: string
  httpOnly: boolean
  secure: boolean
  sameSite?: string
  expires?: number
  size: number
  isSession: boolean
  isThirdParty: boolean
  prefix: '' | '__Secure-' | '__Host-' | '__Http-' | '__Host-Http-'
  prefixValid: boolean
  prefixIssues: string[]
  classification: 'essential' | 'functional' | 'tracking' | 'advertising' | 'unknown'
  securityScore: number
  securityIssues: string[]
  technology?: string
  partitioned: boolean
}

interface IabTcfPurpose {
  id: number
  name: string
  description: string
  hasConsent: boolean | null
  hasLegitimateInterest: boolean | null
}

interface IabTcfData {
  version: string | null
  cmpId: number | null
  cmpVersion: number | null
  tcString: string | null
  created: string | null
  lastUpdated: string | null
  purposes: IabTcfPurpose[]
  specialFeatureOptins: Record<number, boolean>
  vendorConsents: number[]
  vendorLegitimateInterests: number[]
  vendorCount: number
  publisherCC: string | null
  isServiceSpecific: boolean | null
  gdprApplies: boolean | null
  uspString: string | null
  gppDetected: boolean
  apiCallSuccess: boolean
}

interface ConsentResult {
  hasCMP: boolean
  cmpName?: string
  cmpType: string
  iabTcfVersion?: string
  iabTcfCompliant: boolean
  iabTcfData: IabTcfData | null
  cookieBannerDetected: boolean
  defaultConsent: string
  analyticsBeforeConsent: boolean
  consentSignals: string[]
  gdprScore: number
  gdprIssues: string[]
  gdprRecommendations: string[]
  cookieAudit: {
    total: number
    firstParty: number
    thirdParty: number
    session: number
    persistent: number
    secure: number
    httpOnly: number
    sameSiteStrict: number
    sameSiteLax: number
    sameSiteNone: number
    sameSiteUnset: number
    tracking: number
    advertising: number
    essential: number
    functional: number
    unknown: number
    withPrefixes: number
    prefixViolations: number
    avgSecurityScore: number
    criticalIssues: number
    topIssues: string[]
  }
}

type ExtResult = AnalysisResult & {
  consent?: ConsentResult
}

type FilterType = 'all' | 'tracking' | 'advertising' | 'essential' | 'functional' | 'issues' | 'third-party'
type SortField = 'name' | 'score' | 'domain' | 'classification' | 'expires'

// === Utility functions ===

function getClassColor(cls: string) {
  switch (cls) {
    case 'essential': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    case 'functional': return 'text-blue-400 bg-blue-500/10 border-blue-500/20'
    case 'tracking': return 'text-orange-400 bg-orange-500/10 border-orange-500/20'
    case 'advertising': return 'text-red-400 bg-red-500/10 border-red-500/20'
    default: return 'text-muted-foreground bg-secondary/40 border-border'
  }
}

function getScoreColor(score: number) {
  if (score >= 80) return 'text-emerald-400'
  if (score >= 60) return 'text-yellow-400'
  if (score >= 40) return 'text-orange-400'
  return 'text-red-400'
}

function getSameSiteColor(ss: string | undefined) {
  const v = (ss ?? '').toLowerCase()
  if (v === 'strict') return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
  if (v === 'lax')    return 'text-blue-400 border-blue-500/30 bg-blue-500/10'
  if (v === 'none')   return 'text-orange-400 border-orange-500/30 bg-orange-500/10'
  return 'text-muted-foreground border-border bg-secondary/30'
}

function formatExpiry(expires?: number): string {
  if (!expires || expires <= 0 || expires === -1) return 'Session'
  const ms = expires * 1000
  const now = Date.now()
  const diff = ms - now
  const diffDays = Math.round(diff / (1000 * 60 * 60 * 24))
  if (diff < 0) return 'Expired'
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays < 365) return `${diffDays}d`
  return `${Math.round(diffDays / 365)}y ${diffDays % 365}d`
}

function formatDomain(domain: string): string {
  return domain.startsWith('.') ? domain : domain
}

function getPurposeConsentIcon(hasConsent: boolean | null) {
  if (hasConsent === true) return <span className="text-emerald-400 font-bold">✓</span>
  if (hasConsent === false) return <span className="text-red-400 font-bold">✗</span>
  return <span className="text-muted-foreground">—</span>
}

// ================================================================
// Sub-components
// ================================================================

function OverviewCards({ audit, consent }: { audit: ConsentResult['cookieAudit']; consent: ConsentResult }) {
  const cards = [
    {
      label: 'Avg Security Score',
      value: audit.avgSecurityScore,
      suffix: '/100',
      color: getScoreColor(audit.avgSecurityScore),
      sub: `${audit.criticalIssues} critical`,
    },
    {
      label: 'Total Cookies',
      value: audit.total,
      color: 'text-foreground',
      sub: `${audit.firstParty} 1st · ${audit.thirdParty} 3rd`,
    },
    {
      label: 'Tracking / Ads',
      value: audit.tracking + audit.advertising,
      color: (audit.tracking + audit.advertising) > 0 ? 'text-orange-400' : 'text-emerald-400',
      sub: `${audit.tracking} tracking · ${audit.advertising} ads`,
    },
    {
      label: 'GDPR Score',
      value: consent.gdprScore,
      suffix: '/100',
      color: getScoreColor(consent.gdprScore),
      sub: consent.hasCMP ? consent.cmpName ?? 'CMP detected' : 'No CMP',
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      {cards.map(c => (
        <div key={c.label} className="rounded-xl border border-border bg-card p-4">
          <div className={cn('text-2xl font-bold tabular-nums', c.color)}>
            {c.value}{c.suffix ?? ''}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{c.label}</div>
          <div className="text-[10px] text-muted-foreground/60 mt-1">{c.sub}</div>
        </div>
      ))}
    </div>
  )
}

function AttributeMatrix({ audit }: { audit: ConsentResult['cookieAudit'] }) {
  const pct = (n: number) => audit.total > 0 ? Math.round((n / audit.total) * 100) : 0

  const rows = [
    {
      label: 'Secure flag',
      yes: audit.secure,
      no: audit.total - audit.secure,
      yesLabel: 'Set',
      noLabel: 'Missing',
      critical: audit.total - audit.secure > 0,
    },
    {
      label: 'HttpOnly',
      yes: audit.httpOnly,
      no: audit.total - audit.httpOnly,
      yesLabel: 'Set',
      noLabel: 'Missing',
      critical: false,
    },
    {
      label: 'Persistent',
      yes: audit.persistent,
      no: audit.session,
      yesLabel: 'Persistent',
      noLabel: 'Session',
      critical: false,
    },
  ]

  return (
    <div className="rounded-xl border border-border bg-card p-5 mb-4">
      <h3 className="text-sm font-semibold mb-4">Attribute Coverage</h3>
      <div className="space-y-3">
        {rows.map(r => (
          <div key={r.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="text-foreground">{r.yes}/{audit.total} {r.yesLabel}</span>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden flex">
              <div
                className="h-full rounded-l-full bg-emerald-500"
                style={{ width: `${pct(r.yes)}%` }}
              />
              <div
                className={cn('h-full rounded-r-full', r.critical && r.no > 0 ? 'bg-red-500' : 'bg-secondary/80')}
                style={{ width: `${pct(r.no)}%` }}
              />
            </div>
          </div>
        ))}

        {/* SameSite breakdown */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">SameSite</span>
            <span className="text-foreground">{audit.sameSiteStrict + audit.sameSiteLax}/{audit.total} set</span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden flex">
            <div className="h-full bg-emerald-500" style={{ width: `${pct(audit.sameSiteStrict)}%` }} title="Strict" />
            <div className="h-full bg-blue-500" style={{ width: `${pct(audit.sameSiteLax)}%` }} title="Lax" />
            <div className="h-full bg-orange-500" style={{ width: `${pct(audit.sameSiteNone)}%` }} title="None" />
            <div className="h-full bg-secondary/80" style={{ width: `${pct(audit.sameSiteUnset)}%` }} title="Unset" />
          </div>
          <div className="flex gap-3 mt-1">
            {[
              { label: 'Strict', color: 'bg-emerald-500', n: audit.sameSiteStrict },
              { label: 'Lax',    color: 'bg-blue-500',    n: audit.sameSiteLax },
              { label: 'None',   color: 'bg-orange-500',  n: audit.sameSiteNone },
              { label: 'Unset',  color: 'bg-secondary',   n: audit.sameSiteUnset },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <div className={cn('w-2 h-2 rounded-full', s.color)} />
                {s.label} ({s.n})
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ClassificationBreakdown({ audit }: { audit: ConsentResult['cookieAudit'] }) {
  const items = [
    { label: 'Essential',   count: audit.essential,   color: 'bg-emerald-500', desc: 'Required for site to function' },
    { label: 'Functional',  count: audit.functional,  color: 'bg-blue-500',    desc: 'Preferences & settings' },
    { label: 'Tracking',    count: audit.tracking,    color: 'bg-orange-500',  desc: 'Analytics & user tracking' },
    { label: 'Advertising', count: audit.advertising, color: 'bg-red-500',     desc: 'Ad targeting & retargeting' },
    { label: 'Unknown',     count: audit.unknown,     color: 'bg-secondary',   desc: 'Unclassified cookies' },
  ]
  const max = Math.max(...items.map(i => i.count), 1)

  return (
    <div className="rounded-xl border border-border bg-card p-5 mb-4">
      <h3 className="text-sm font-semibold mb-4">Cookie Classification</h3>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.label} className="flex items-center gap-3">
            <div className="w-20 text-xs text-right text-muted-foreground shrink-0">{item.label}</div>
            <div className="flex-1 h-5 rounded-full bg-secondary overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', item.color)}
                style={{ width: `${(item.count / max) * 100}%` }}
              />
            </div>
            <div className="w-6 text-xs text-right tabular-nums font-medium">{item.count}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TopIssuesList({ issues }: { issues: string[] }) {
  if (!issues.length) return null
  return (
    <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 mb-4">
      <h3 className="text-sm font-semibold text-orange-400 mb-3">⚠ Top Cookie Issues</h3>
      <div className="space-y-1.5">
        {issues.map((issue, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span className="text-orange-400 shrink-0 mt-0.5">›</span>
            <span className="text-muted-foreground">{issue}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CookieRow({ cookie, expanded, onToggle }: {
  cookie: AuditedCookie
  expanded: boolean
  onToggle: () => void
}) {
  const expiryStr = formatExpiry(cookie.expires)
  const hasIssues = cookie.securityIssues.length > 0

  return (
    <>
      <tr
        className={cn(
          'border-b border-border/50 cursor-pointer hover:bg-secondary/20 transition-colors text-xs',
          hasIssues && cookie.securityScore < 60 && 'bg-red-500/5',
        )}
        onClick={onToggle}
      >
        <td className="py-2 px-3 font-mono font-medium max-w-[180px] truncate">
          <div className="flex items-center gap-1.5">
            {cookie.prefix && (
              <span className={cn(
                'text-[9px] px-1 py-0.5 rounded border font-sans shrink-0',
                cookie.prefixValid
                  ? 'text-purple-400 border-purple-500/30 bg-purple-500/10'
                  : 'text-red-400 border-red-500/30 bg-red-500/10'
              )}>
                {cookie.prefix}
              </span>
            )}
            <span className="truncate">{cookie.name.replace(cookie.prefix, '')}</span>
          </div>
        </td>
        <td className="py-2 px-3 text-muted-foreground max-w-[120px] truncate">{formatDomain(cookie.domain)}</td>
        <td className="py-2 px-3">
          <span className={cn('px-1.5 py-0.5 rounded border text-[10px]', getClassColor(cookie.classification))}>
            {cookie.classification}
          </span>
        </td>
        <td className="py-2 px-3">
          <span className={cn('px-1.5 py-0.5 rounded border text-[10px]', getSameSiteColor(cookie.sameSite))}>
            {cookie.sameSite || 'Unset'}
          </span>
        </td>
        <td className="py-2 px-3 text-center">
          {cookie.secure
            ? <span className="text-emerald-400 text-xs">✓</span>
            : <span className="text-red-400 text-xs">✗</span>}
        </td>
        <td className="py-2 px-3 text-center">
          {cookie.httpOnly
            ? <span className="text-emerald-400 text-xs">✓</span>
            : <span className="text-muted-foreground text-xs">—</span>}
        </td>
        <td className="py-2 px-3 text-muted-foreground">{expiryStr}</td>
        <td className="py-2 px-3">
          <div className="flex items-center gap-1.5">
            <div className={cn('text-xs font-bold tabular-nums', getScoreColor(cookie.securityScore))}>
              {cookie.securityScore}
            </div>
            {hasIssues && <span className="text-orange-400 text-[10px]">⚠</span>}
          </div>
        </td>
        <td className="py-2 px-3 text-right">
          <span className="text-muted-foreground/50 text-[10px]">{expanded ? '▲' : '▼'}</span>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-secondary/10 border-b border-border/50">
          <td colSpan={9} className="px-3 py-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Cookie details */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-semibold uppercase text-muted-foreground/60 mb-2">Attributes</h4>
                {[
                  { label: 'Name',       value: cookie.name },
                  { label: 'Domain',     value: cookie.domain || '(host-only)' },
                  { label: 'Path',       value: cookie.path },
                  { label: 'Size',       value: `${cookie.size} bytes` },
                  { label: 'Expires',    value: cookie.isSession ? 'Session (deleted on browser close)' : new Date((cookie.expires ?? 0) * 1000).toUTCString() },
                  { label: 'SameSite',   value: cookie.sameSite || 'Not set (browser default: Lax)' },
                  { label: 'Secure',     value: cookie.secure ? 'Yes — HTTPS only' : 'No — sent over HTTP too' },
                  { label: 'HttpOnly',   value: cookie.httpOnly ? 'Yes — not accessible via JS' : 'No — accessible via document.cookie' },
                  { label: 'Partitioned',value: cookie.partitioned ? 'Yes (CHIPS)' : 'No' },
                  { label: 'First/Third',value: cookie.isThirdParty ? '3rd party' : '1st party' },
                  ...(cookie.prefix ? [{
                    label: 'Prefix',
                    value: `${cookie.prefix} — ${cookie.prefixValid ? '✓ Valid' : `✗ Invalid: ${cookie.prefixIssues.join('; ')}`}`,
                  }] : []),
                  ...(cookie.technology ? [{ label: 'Technology', value: cookie.technology }] : []),
                ].map(row => (
                  <div key={row.label} className="flex gap-2 text-xs">
                    <span className="text-muted-foreground w-20 shrink-0">{row.label}</span>
                    <span className="font-mono text-foreground/80 break-all">{row.value}</span>
                  </div>
                ))}
              </div>

              {/* Security issues */}
              <div>
                <h4 className="text-[10px] font-semibold uppercase text-muted-foreground/60 mb-2">
                  Security Score: <span className={getScoreColor(cookie.securityScore)}>{cookie.securityScore}/100</span>
                </h4>
                {cookie.securityIssues.length > 0 ? (
                  <div className="space-y-1.5">
                    {cookie.securityIssues.map((issue, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs rounded-lg bg-red-500/5 border border-red-500/20 px-2 py-1.5">
                        <span className="text-red-400 shrink-0">✗</span>
                        <span className="text-foreground/80">{issue}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-emerald-400 flex items-center gap-1.5">
                    <span>✓</span>
                    <span>No security issues detected</span>
                  </div>
                )}

                {/* Value preview */}
                {cookie.value && (
                  <div className="mt-3">
                    <h4 className="text-[10px] font-semibold uppercase text-muted-foreground/60 mb-1">Value Preview</h4>
                    <div className="font-mono text-[10px] text-muted-foreground bg-secondary/50 rounded px-2 py-1.5 break-all max-h-16 overflow-auto">
                      {cookie.value.slice(0, 300)}{cookie.value.length > 300 ? '…' : ''}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function IabTcfSection({ tcfData, cmpName, iabVersion }: {
  tcfData: IabTcfData | null
  cmpName?: string
  iabVersion?: string
}) {
  const [showPurposes, setShowPurposes] = useState(false)

  if (!tcfData && !iabVersion) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-2">IAB Transparency & Consent Framework</h3>
        <p className="text-xs text-muted-foreground">No IAB TCF API detected on this page.</p>
        <p className="text-xs text-muted-foreground mt-1">
          TCF is the industry standard for GDPR consent signaling between publishers, CMPs, and ad vendors.
          Implement a TCF-registered CMP and expose <code className="text-primary">window.__tcfapi</code>.
        </p>
      </div>
    )
  }

  const purposeConsented = tcfData?.purposes.filter(p => p.hasConsent === true).length ?? 0
  const purposeLI = tcfData?.purposes.filter(p => p.hasLegitimateInterest === true).length ?? 0
  const purposeTotal = tcfData?.purposes.length ?? 11

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">IAB TCF — Transparency &amp; Consent Framework</h3>
          {tcfData?.version && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Version <strong className="text-primary">{tcfData.version}</strong>
              {cmpName && <> · CMP: <strong className="text-foreground">{cmpName}</strong></>}
              {tcfData.cmpId && <> · CMP ID: <code className="text-muted-foreground">{tcfData.cmpId}</code></>}
              {tcfData.publisherCC && <> · Publisher country: <strong>{tcfData.publisherCC}</strong></>}
            </p>
          )}
        </div>
        <span className={cn(
          'text-xs px-2 py-1 rounded-lg border font-medium',
          tcfData?.apiCallSuccess
            ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
            : 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'
        )}>
          {tcfData?.apiCallSuccess ? '✓ API responded' : '⚡ API detected'}
        </span>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
          <div className={cn('text-xl font-bold', purposeConsented > 0 ? 'text-orange-400' : 'text-emerald-400')}>
            {tcfData?.apiCallSuccess ? purposeConsented : '—'}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Purposes w/ Consent</div>
        </div>
        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
          <div className={cn('text-xl font-bold', purposeLI > 0 ? 'text-yellow-400' : 'text-muted-foreground')}>
            {tcfData?.apiCallSuccess ? purposeLI : '—'}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Legit. Interest</div>
        </div>
        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
          <div className={cn('text-xl font-bold', (tcfData?.vendorCount ?? 0) > 0 ? 'text-orange-400' : 'text-muted-foreground')}>
            {tcfData?.apiCallSuccess ? (tcfData?.vendorCount ?? 0) : '—'}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Vendors</div>
        </div>
        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
          <div className={cn('text-xl font-bold',
            tcfData?.gdprApplies === true ? 'text-orange-400'
              : tcfData?.gdprApplies === false ? 'text-emerald-400'
                : 'text-muted-foreground'
          )}>
            {tcfData?.gdprApplies === true ? 'Yes'
              : tcfData?.gdprApplies === false ? 'No'
                : '—'}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">GDPR Applies</div>
        </div>
      </div>

      {/* TC string preview */}
      {tcfData?.tcString && (
        <div className="mb-4">
          <h4 className="text-xs font-medium mb-1.5">TC String</h4>
          <div className="font-mono text-[10px] text-muted-foreground bg-secondary/40 rounded-lg px-3 py-2 break-all">
            {tcfData.tcString}…
          </div>
          <div className="flex gap-3 text-[10px] text-muted-foreground mt-1">
            {tcfData.created && <span>Created: {new Date(tcfData.created).toLocaleDateString()}</span>}
            {tcfData.lastUpdated && <span>Updated: {new Date(tcfData.lastUpdated).toLocaleDateString()}</span>}
            {tcfData.isServiceSpecific !== null && (
              <span>Service-specific: {tcfData.isServiceSpecific ? 'Yes' : 'No'}</span>
            )}
          </div>
        </div>
      )}

      {/* Purposes table */}
      {tcfData?.purposes && (
        <div>
          <button
            onClick={() => setShowPurposes(v => !v)}
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground mb-3 transition-colors"
          >
            <span>{showPurposes ? '▲' : '▼'}</span>
            {showPurposes ? 'Hide' : 'Show'} All Purposes ({purposeTotal})
          </button>

          {showPurposes && (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-secondary/30 border-b border-border">
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">#</th>
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">Purpose</th>
                    <th className="text-center px-3 py-2 text-muted-foreground font-medium">Consent</th>
                    <th className="text-center px-3 py-2 text-muted-foreground font-medium">Legit. Interest</th>
                  </tr>
                </thead>
                <tbody>
                  {tcfData.purposes.map(purpose => (
                    <tr key={purpose.id} className="border-b border-border/50 hover:bg-secondary/10">
                      <td className="px-3 py-2 text-muted-foreground font-mono">{purpose.id}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground/90">{purpose.name}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{purpose.description}</div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {!tcfData.apiCallSuccess ? '—' : getPurposeConsentIcon(purpose.hasConsent)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {!tcfData.apiCallSuccess ? '—' : getPurposeConsentIcon(purpose.hasLegitimateInterest)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Special features */}
      {tcfData?.specialFeatureOptins && Object.keys(tcfData.specialFeatureOptins).length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <h4 className="text-xs font-medium mb-2">Special Feature Opt-ins</h4>
          <div className="flex gap-3 flex-wrap">
            {[
              { id: 1, label: 'Precise geolocation' },
              { id: 2, label: 'Active device fingerprinting' },
            ].map(sf => (
              <div key={sf.id} className={cn(
                'text-xs px-2.5 py-1.5 rounded-lg border',
                tcfData.specialFeatureOptins[sf.id]
                  ? 'text-red-400 border-red-500/30 bg-red-500/10'
                  : 'text-muted-foreground border-border bg-secondary/30'
              )}>
                SF{sf.id}: {sf.label} — {tcfData.specialFeatureOptins[sf.id] ? 'Opted in' : 'Not opted in'}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CCPA / US Privacy */}
      {tcfData?.uspString && (
        <div className="mt-4 pt-4 border-t border-border">
          <h4 className="text-xs font-medium mb-2">US Privacy (CCPA)</h4>
          <div className="flex items-center gap-3">
            <code className="font-mono text-xs bg-secondary/50 px-2 py-1 rounded">{tcfData.uspString}</code>
            <div className="text-xs text-muted-foreground">
              {parseUspString(tcfData.uspString)}
            </div>
          </div>
        </div>
      )}

      {/* GPP */}
      {tcfData?.gppDetected && (
        <div className="mt-3">
          <span className="text-xs px-2 py-1 rounded border border-blue-500/30 bg-blue-500/10 text-blue-400">
            IAB GPP (Global Privacy Platform) detected
          </span>
        </div>
      )}
    </div>
  )
}

function parseUspString(usp: string): string {
  if (!usp || usp.length < 4) return 'Invalid USP string'
  const version = usp[0]
  const notice = usp[1] === 'Y' ? 'Notice given' : usp[1] === 'N' ? 'No notice' : 'N/A'
  const optOut = usp[2] === 'Y' ? 'Opted out' : usp[2] === 'N' ? 'Not opted out' : 'N/A'
  const lspa = usp[3] === 'Y' ? 'LSPA covered' : usp[3] === 'N' ? 'LSPA not covered' : 'N/A'
  return `v${version} · ${notice} · ${optOut} · ${lspa}`
}

function PrefixAnalysis({ cookies }: { cookies: AuditedCookie[] }) {
  const prefixed = cookies.filter(c => c.prefix !== '')
  if (prefixed.length === 0) return null

  const valid = prefixed.filter(c => c.prefixValid)
  const invalid = prefixed.filter(c => !c.prefixValid)

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold mb-3">Cookie Prefix Analysis</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Cookie prefixes signal security constraints to browsers. Violations are silently rejected.
      </p>

      {[
        {
          prefix: '__Host-',
          rule: 'Requires: Secure flag + no Domain attribute + Path=/',
          desc: 'Strongest — scoped to exact origin, no subdomain leakage',
        },
        {
          prefix: '__Secure-',
          rule: 'Requires: Secure flag',
          desc: 'Ensures cookie only travels over HTTPS',
        },
        {
          prefix: '__Http-',
          rule: 'Requires: Secure flag + HttpOnly',
          desc: 'MDN 2026 — cannot be set/read by JavaScript',
        },
        {
          prefix: '__Host-Http-',
          rule: 'Combines __Host- and __Http- rules',
          desc: 'Most restrictive prefix — origin-scoped and JS-inaccessible',
        },
      ].map(def => {
        const matching = prefixed.filter(c => c.prefix === def.prefix)
        if (matching.length === 0) return null
        const hasViolations = matching.some(c => !c.prefixValid)
        return (
          <div key={def.prefix} className={cn(
            'rounded-lg border p-3 mb-2',
            hasViolations ? 'border-red-500/20 bg-red-500/5' : 'border-emerald-500/20 bg-emerald-500/5'
          )}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <code className={cn('text-xs font-bold', hasViolations ? 'text-red-400' : 'text-emerald-400')}>
                  {def.prefix}
                </code>
                <span className="text-xs text-muted-foreground ml-2">{def.desc}</span>
                <div className="text-[10px] text-muted-foreground mt-0.5">{def.rule}</div>
              </div>
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded border shrink-0',
                hasViolations ? 'text-red-400 border-red-500/30' : 'text-emerald-400 border-emerald-500/30'
              )}>
                {matching.length} cookie{matching.length > 1 ? 's' : ''}
              </span>
            </div>
            {hasViolations && (
              <div className="mt-2 space-y-1">
                {matching.filter(c => !c.prefixValid).map(c => (
                  <div key={c.name} className="text-xs">
                    <code className="text-red-400">{c.name}</code>
                    {c.prefixIssues.map((iss, i) => (
                      <span key={i} className="text-muted-foreground ml-2">→ {iss}</span>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
        <span className="text-emerald-400">✓ {valid.length} valid</span>
        {invalid.length > 0 && <span className="text-red-400">✗ {invalid.length} violations</span>}
      </div>
    </div>
  )
}

// ================================================================
// Main component
// ================================================================

export function CookieAuditTab({ result }: Props) {
  const r = result as ExtResult
  const consent = r.consent

  const [filter, setFilter] = useState<FilterType>('all')
  const [sort, setSort] = useState<SortField>('score')
  const [sortAsc, setSortAsc] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedCookie, setExpandedCookie] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<'overview' | 'cookies' | 'tcf'>('overview')

  // Enrich cookies with computed fields where backend didn't supply them
  const enrichedCookies = useMemo(() => {
    const pageHostname = (() => { try { return new URL(result.meta.finalUrl).hostname; } catch { return ''; } })()
    return (result.cookies ?? []).map(c => {
      const raw = c as unknown as AuditedCookie
      // Compute missing fields if not set by backend
      if (raw.securityScore !== undefined) return raw as AuditedCookie

      const n = c.name.toLowerCase()
      let classification: AuditedCookie['classification'] = 'unknown'
      if (/^(_ga|_gid|_gat|__utma|__utmb|__utmc|__utmz)/.test(n)) classification = 'tracking'
      else if (/^(_fbp|_fbc|fr|_gcl_au|_gcl_aw|ttq_)/.test(n)) classification = 'advertising'
      else if (/^(_hjid|_hjsession|hotjar)/.test(n)) classification = 'tracking'
      else if (/(session|phpsessid|jsessionid|sid)$/i.test(n)) classification = 'essential'
      else if (/(csrf|xsrf|_token)$/i.test(n)) classification = 'essential'
      else if (/(consent|optanon|cookiebot|gdpr|tcf)$/i.test(n)) classification = 'functional'

      const cookieDomain = c.domain.replace(/^\./, '')
      const isThirdParty = pageHostname ? (!pageHostname.endsWith(cookieDomain) && !cookieDomain.endsWith(pageHostname)) : false
      const isSession = !c.expires || c.expires <= 0 || c.expires === -1

      let prefix: AuditedCookie['prefix'] = ''
      if (c.name.startsWith('__Host-Http-')) prefix = '__Host-Http-'
      else if (c.name.startsWith('__Host-')) prefix = '__Host-'
      else if (c.name.startsWith('__Secure-')) prefix = '__Secure-'
      else if (c.name.startsWith('__Http-')) prefix = '__Http-'

      const securityIssues: string[] = []
      let securityScore = 100
      if (!c.secure) { securityScore -= 20; securityIssues.push('Missing Secure flag') }
      if (!c.httpOnly) { securityScore -= 10; securityIssues.push('Missing HttpOnly flag') }
      if (!c.sameSite) { securityScore -= 8; securityIssues.push('SameSite not set') }
      if ((c.sameSite ?? '').toLowerCase() === 'none' && !c.secure) { securityScore -= 30; securityIssues.push('SameSite=None without Secure') }

      return {
        ...c,
        size: c.name.length + (c.value?.length ?? 0),
        isSession,
        isThirdParty,
        prefix,
        prefixValid: true,
        prefixIssues: [],
        classification,
        securityScore: Math.max(0, securityScore),
        securityIssues,
        partitioned: false,
      } satisfies AuditedCookie
    })
  }, [result.cookies, result.meta.finalUrl])

  const filteredCookies = useMemo(() => {
    let list = enrichedCookies
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.domain.toLowerCase().includes(q) ||
        c.classification.includes(q)
      )
    }
    switch (filter) {
      case 'tracking':    list = list.filter(c => c.classification === 'tracking'); break
      case 'advertising': list = list.filter(c => c.classification === 'advertising'); break
      case 'essential':   list = list.filter(c => c.classification === 'essential'); break
      case 'functional':  list = list.filter(c => c.classification === 'functional'); break
      case 'issues':      list = list.filter(c => c.securityIssues.length > 0); break
      case 'third-party': list = list.filter(c => c.isThirdParty); break
    }
    list = [...list].sort((a, b) => {
      let cmp = 0
      switch (sort) {
        case 'score': cmp = a.securityScore - b.securityScore; break
        case 'name': cmp = a.name.localeCompare(b.name); break
        case 'domain': cmp = a.domain.localeCompare(b.domain); break
        case 'classification': cmp = a.classification.localeCompare(b.classification); break
        case 'expires': cmp = (a.expires ?? 0) - (b.expires ?? 0); break
      }
      return sortAsc ? cmp : -cmp
    })
    return list
  }, [enrichedCookies, filter, sort, sortAsc, search])

  const handleSort = (field: SortField) => {
    if (sort === field) setSortAsc(v => !v)
    else { setSort(field); setSortAsc(false) }
  }

  if (!result.cookies || result.cookies.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <div className="text-4xl mb-3">🍪</div>
        <p className="text-sm">No cookies were set by this page.</p>
      </div>
    )
  }

  const audit = consent?.cookieAudit
  const tcfData = consent?.iabTcfData

  const sections: Array<{ id: typeof activeSection; label: string; icon: string }> = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'cookies',  label: `Cookies (${enrichedCookies.length})`, icon: '🍪' },
    { id: 'tcf',      label: 'IAB TCF / Privacy APIs', icon: '🔐' },
  ]

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Section tabs */}
      <div className="flex gap-1 border-b border-border pb-0 overflow-x-auto">
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 -mb-px whitespace-nowrap transition-colors',
              activeSection === s.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <span>{s.icon}</span>
            {s.label}
          </button>
        ))}
      </div>

      {/* === OVERVIEW SECTION === */}
      {activeSection === 'overview' && (
        <div>
          {audit ? (
            <>
              <OverviewCards audit={audit} consent={consent!} />

              {/* Top issues */}
              {audit.topIssues.length > 0 && <TopIssuesList issues={audit.topIssues} />}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <AttributeMatrix audit={audit} />
                <ClassificationBreakdown audit={audit} />
              </div>

              {/* Prefix analysis */}
              <PrefixAnalysis cookies={enrichedCookies} />

              {/* GDPR issues */}
              {consent && (consent.gdprIssues.length > 0 || consent.gdprRecommendations.length > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  {consent.gdprIssues.length > 0 && (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                      <h3 className="text-sm font-semibold text-red-400 mb-3">GDPR Issues</h3>
                      {consent.gdprIssues.map((issue, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs mb-1.5">
                          <span className="text-red-400 shrink-0">✗</span>
                          <span>{issue}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {consent.gdprRecommendations.length > 0 && (
                    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                      <h3 className="text-sm font-semibold text-blue-400 mb-3">Recommendations</h3>
                      {consent.gdprRecommendations.map((rec, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs mb-1.5">
                          <span className="text-blue-400 shrink-0">→</span>
                          <span>{rec}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            // Fallback overview without consent data
            <div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="rounded-xl border border-border bg-card p-4 text-center">
                  <div className="text-2xl font-bold">{enrichedCookies.length}</div>
                  <div className="text-xs text-muted-foreground">Total Cookies</div>
                </div>
                <div className="rounded-xl border border-border bg-card p-4 text-center">
                  <div className="text-2xl font-bold text-orange-400">
                    {enrichedCookies.filter(c => c.classification === 'tracking' || c.classification === 'advertising').length}
                  </div>
                  <div className="text-xs text-muted-foreground">Tracking / Ads</div>
                </div>
                <div className="rounded-xl border border-border bg-card p-4 text-center">
                  <div className="text-2xl font-bold text-red-400">
                    {enrichedCookies.filter(c => c.securityIssues.length > 0).length}
                  </div>
                  <div className="text-xs text-muted-foreground">With Issues</div>
                </div>
                <div className="rounded-xl border border-border bg-card p-4 text-center">
                  <div className="text-2xl font-bold">
                    {enrichedCookies.filter(c => c.isThirdParty).length}
                  </div>
                  <div className="text-xs text-muted-foreground">Third-Party</div>
                </div>
              </div>
              <ClassificationBreakdown audit={{
                total: enrichedCookies.length,
                firstParty: enrichedCookies.filter(c => !c.isThirdParty).length,
                thirdParty: enrichedCookies.filter(c => c.isThirdParty).length,
                session: enrichedCookies.filter(c => c.isSession).length,
                persistent: enrichedCookies.filter(c => !c.isSession).length,
                secure: enrichedCookies.filter(c => c.secure).length,
                httpOnly: enrichedCookies.filter(c => c.httpOnly).length,
                sameSiteStrict: enrichedCookies.filter(c => (c.sameSite ?? '').toLowerCase() === 'strict').length,
                sameSiteLax: enrichedCookies.filter(c => (c.sameSite ?? '').toLowerCase() === 'lax').length,
                sameSiteNone: enrichedCookies.filter(c => (c.sameSite ?? '').toLowerCase() === 'none').length,
                sameSiteUnset: enrichedCookies.filter(c => !c.sameSite).length,
                tracking: enrichedCookies.filter(c => c.classification === 'tracking').length,
                advertising: enrichedCookies.filter(c => c.classification === 'advertising').length,
                essential: enrichedCookies.filter(c => c.classification === 'essential').length,
                functional: enrichedCookies.filter(c => c.classification === 'functional').length,
                unknown: enrichedCookies.filter(c => c.classification === 'unknown').length,
                withPrefixes: enrichedCookies.filter(c => c.prefix !== '').length,
                prefixViolations: enrichedCookies.filter(c => c.prefix && !c.prefixValid).length,
                avgSecurityScore: Math.round(enrichedCookies.reduce((s, c) => s + c.securityScore, 0) / enrichedCookies.length),
                criticalIssues: enrichedCookies.filter(c => c.securityScore < 50).length,
                topIssues: [],
              }} />
              <PrefixAnalysis cookies={enrichedCookies} />
            </div>
          )}
        </div>
      )}

      {/* === COOKIES TABLE SECTION === */}
      {activeSection === 'cookies' && (
        <div>
          {/* Filters + search */}
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search cookies…"
              className="flex-1 text-xs px-3 py-2 rounded-lg border border-border bg-secondary/30 outline-none focus:border-primary/50 placeholder:text-muted-foreground/50"
            />
            <div className="flex gap-1 flex-wrap">
              {(['all', 'issues', 'tracking', 'advertising', 'essential', 'functional', 'third-party'] as FilterType[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors',
                    filter === f
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border bg-secondary/30 text-muted-foreground hover:text-foreground'
                  )}
                >
                  {f === 'all' ? `All (${enrichedCookies.length})` : f}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="bg-secondary/40 border-b border-border text-xs">
                    {[
                      { field: 'name' as SortField,           label: 'Name' },
                      { field: 'domain' as SortField,         label: 'Domain' },
                      { field: 'classification' as SortField, label: 'Type' },
                      { field: null,                          label: 'SameSite' },
                      { field: null,                          label: 'Secure' },
                      { field: null,                          label: 'HttpOnly' },
                      { field: 'expires' as SortField,        label: 'Expires' },
                      { field: 'score' as SortField,          label: 'Score' },
                      { field: null,                          label: '' },
                    ].map((col, i) => (
                      <th
                        key={i}
                        className={cn(
                          'text-left px-3 py-2.5 text-muted-foreground font-medium',
                          col.field && 'cursor-pointer hover:text-foreground select-none'
                        )}
                        onClick={() => col.field && handleSort(col.field)}
                      >
                        {col.label}
                        {col.field && sort === col.field && (
                          <span className="ml-1 text-primary">{sortAsc ? '↑' : '↓'}</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCookies.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-muted-foreground text-xs">
                        No cookies match this filter.
                      </td>
                    </tr>
                  ) : (
                    filteredCookies.map(cookie => (
                      <CookieRow
                        key={`${cookie.name}-${cookie.domain}`}
                        cookie={cookie}
                        expanded={expandedCookie === `${cookie.name}-${cookie.domain}`}
                        onToggle={() => {
                          const key = `${cookie.name}-${cookie.domain}`
                          setExpandedCookie(prev => prev === key ? null : key)
                        }}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground mt-2">
            Showing {filteredCookies.length} of {enrichedCookies.length} cookies. Click any row to expand details.
          </p>
        </div>
      )}

      {/* === IAB TCF / PRIVACY SECTION === */}
      {activeSection === 'tcf' && (
        <div className="space-y-4">
          <IabTcfSection
            tcfData={tcfData ?? null}
            cmpName={consent?.cmpName}
            iabVersion={consent?.iabTcfVersion}
          />

          {/* Consent signals */}
          {consent?.consentSignals && consent.consentSignals.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold mb-3">Detection Signals</h3>
              <div className="space-y-1.5">
                {consent.consentSignals.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-emerald-400">✓</span>
                    <span className="text-muted-foreground">{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Analytics before consent warning */}
          {consent?.analyticsBeforeConsent && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4">
              <div className="flex items-start gap-3">
                <span className="text-xl">🚨</span>
                <div>
                  <h3 className="font-semibold text-red-400 text-sm mb-1">
                    Analytics Loaded Before Consent — GDPR Violation
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Tracking scripts (analytics, advertising) are loading without obtaining user consent first.
                    This violates GDPR Article 7 and the ePrivacy Directive and can result in significant fines
                    (up to 4% of annual global turnover or €20M, whichever is higher).
                  </p>
                  <p className="text-xs text-red-400 mt-2 font-medium">
                    Fix: Configure your CMP to block third-party scripts until consent is granted.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* IAB TCF reference */}
          <div className="rounded-xl border border-border bg-secondary/20 p-4">
            <h3 className="text-xs font-semibold text-muted-foreground mb-2">IAB TCF Reference</h3>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>The <strong className="text-foreground">IAB Transparency and Consent Framework (TCF)</strong> defines how CMPs collect and signal GDPR consent.</p>
              <p>TCF v2.2 (current) adds new restrictions on profiling and requires explicit consent for political advertising.</p>
              <p>The <code className="text-primary">__tcfapi</code> function exposes: consent state per purpose, vendor list, TC string, and CMP metadata.</p>
              <p>The <code className="text-primary">__uspapi</code> function (CCPA) exposes the US Privacy String (e.g., <code>1YNY</code>).</p>
              <p>The <code className="text-primary">__gpp</code> function (GPP) is the next-gen cross-jurisdiction privacy signaling API.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
