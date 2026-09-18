import { useAppStore } from '@/store'
import type { AnalysisJob, AnalysisResult } from '@/store'
import { OverviewTab } from './tabs/OverviewTab'
import { CarbonTab } from './tabs/CarbonTab'
import { PerformanceTab } from './tabs/PerformanceTab'
import { TechnologiesTab } from './tabs/TechnologiesTab'
import { SecurityTab } from './tabs/SecurityTab'
import { ThirdPartiesTab } from './tabs/ThirdPartiesTab'
import { AccessibilityTab } from './tabs/AccessibilityTab'
import { NetworkTab } from './tabs/NetworkTab'
import { SeoTab } from './tabs/SeoTab'
import { DnsTab } from './tabs/DnsTab'
import { ConsentTab } from './tabs/ConsentTab'
import { CookieAuditTab } from './tabs/CookieAuditTab'
import { ModernWebTab } from './tabs/ModernWebTab'
import { JsProfileTab } from './tabs/JsProfileTab'
import { ImagesTab } from './tabs/ImagesTab'
import { FontsTab } from './tabs/FontsTab'
import { BuiltWithTab } from './tabs/BuiltWithTab'
import { ShareButton, PdfExportButton } from './ShareExport'
import { getGradeColor, formatDuration, getDomain } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface Props {
  job: AnalysisJob
  result: AnalysisResult
}

const TABS = [
  { id: 'overview',      label: 'Overview',          icon: '📊' },
  { id: 'carbon',        label: 'Carbon',            icon: '🌿' },
  { id: 'performance',   label: 'Performance',       icon: '⚡' },
  { id: 'images',        label: 'Images',            icon: '🖼️' },
  { id: 'fonts',         label: 'Fonts',             icon: '🔤' },
  { id: 'js-profile',    label: 'JS Profile',        icon: '⚙️' },
  { id: 'builtwith',     label: 'BuiltWith',         icon: '🏗️' },
  { id: 'technologies',  label: 'Technologies',      icon: '🔍' },
  { id: 'security',      label: 'Security',          icon: '🔒' },
  { id: 'cookie-audit',  label: 'Cookie Audit',      icon: '🍪' },
  { id: 'third-parties', label: 'Third Parties',     icon: '👁' },
  { id: 'consent',       label: 'GDPR & Consent',    icon: '🔏' },
  { id: 'accessibility', label: 'Accessibility',     icon: '♿' },
  { id: 'network',       label: 'Network',           icon: '🌐' },
  { id: 'seo',           label: 'SEO',               icon: '🔎' },
  { id: 'modern-web',    label: 'Modern Web',        icon: '🚀' },
  { id: 'dns',           label: 'DNS & WHOIS',       icon: '🏗️' },
]

export function ResultsDashboard({ job, result }: Props) {
  const { activeTab, setActiveTab } = useAppStore()

  const domain = getDomain(result.meta.finalUrl)

  const handleExport = (format: 'json' | 'csv') => {
    window.open(`/api/v1/analyze/${job.jobId}/report.${format}`, '_blank')
  }

  return (
    <div className="max-w-7xl mx-auto px-4 pb-16 animate-slide-up">
      {/* Result header */}
      <div className="rounded-xl border border-border bg-card p-4 mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h2 className="font-semibold text-sm truncate">{domain}</h2>
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded border font-medium',
              result.security.https ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-red-400 border-red-500/30 bg-red-500/10'
            )}>
              {result.security.https ? 'HTTPS' : 'HTTP'}
            </span>
            {result.carbon.models.greenHosting && (
              <span className="text-xs px-1.5 py-0.5 rounded border text-emerald-400 border-emerald-500/30 bg-emerald-500/10">🌱 Green</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{result.meta.finalUrl}</p>
        </div>

        {/* Quick scores */}
        <div className="flex items-center gap-4 flex-shrink-0">
          {[
            { label: 'Carbon', value: result.scores.carbon.grade, isGrade: true },
            { label: 'Perf', value: result.scores.performance.grade, isGrade: true },
            { label: 'Security', value: result.scores.security.grade, isGrade: true },
            { label: 'A11y', value: result.scores.accessibility.grade, isGrade: true },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className={`text-lg font-bold ${getGradeColor(s.value)}`}>{s.value}</div>
              <div className="text-[10px] text-muted-foreground">{s.label}</div>
            </div>
          ))}
          <div className="text-center">
            <div className="text-xs text-muted-foreground">{formatDuration(result.meta.durationMs)}</div>
            <div className="text-[10px] text-muted-foreground">analysis time</div>
          </div>
        </div>

        {/* Export & Share */}
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <button
            onClick={() => handleExport('json')}
            className="text-xs px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-secondary/80 transition-colors"
          >
            JSON
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="text-xs px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-secondary/80 transition-colors"
          >
            CSV
          </button>
          <PdfExportButton jobId={job.jobId} />
          <ShareButton jobId={job.jobId} />
        </div>
      </div>

      {/* Tab navigation */}
      <div className="border-b border-border mb-6 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              )}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'overview' && <OverviewTab result={result} onTabChange={setActiveTab} />}
        {activeTab === 'carbon' && <CarbonTab result={result} />}
        {activeTab === 'performance' && <PerformanceTab result={result} />}
        {activeTab === 'technologies' && <TechnologiesTab result={result} />}
        {activeTab === 'security' && <SecurityTab result={result} />}
        {activeTab === 'cookie-audit' && <CookieAuditTab result={result} />}
        {activeTab === 'third-parties' && <ThirdPartiesTab result={result} />}
        {activeTab === 'accessibility' && <AccessibilityTab result={result} />}
        {activeTab === 'network' && <NetworkTab result={result} />}
        {activeTab === 'seo' && <SeoTab result={result} />}
        {activeTab === 'consent' && <ConsentTab result={result} />}
        {activeTab === 'modern-web' && <ModernWebTab result={result} />}
        {activeTab === 'dns' && <DnsTab result={result} />}
        {activeTab === 'images'     && <ImagesTab result={result} />}
        {activeTab === 'fonts'      && <FontsTab result={result} />}
        {activeTab === 'js-profile' && <JsProfileTab result={result} />}
        {activeTab === 'builtwith'  && <BuiltWithTab result={result} />}
      </div>
    </div>
  )
}
