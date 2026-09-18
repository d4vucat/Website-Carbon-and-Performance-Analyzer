import { useState } from 'react'
import type { AnalysisResult } from '@/store'
import { getCategoryIcon, cn } from '@/lib/utils'

interface Props { result: AnalysisResult }

const CATEGORY_LABELS: Record<string, string> = {
  'cms': 'CMS', 'js-framework': 'JS Framework', 'ui-framework': 'UI Framework',
  'web-framework': 'Web Framework', 'programming-language': 'Language', 'web-server': 'Web Server',
  'hosting': 'Hosting', 'cdn': 'CDN', 'cache': 'Cache', 'analytics': 'Analytics',
  'tag-manager': 'Tag Manager', 'advertising': 'Advertising', 'tracking': 'Tracking',
  'chat': 'Chat / Support', 'payment': 'Payment', 'apm': 'Error Tracking',
  'auth': 'Auth', 'crm': 'CRM', 'ecommerce': 'E-commerce', 'ssg': 'Static Site Generator',
  'bundler': 'Build Tool', 'js-library': 'JS Library', 'css-framework': 'CSS Framework',
  'fonts': 'Fonts', 'maps': 'Maps', 'security': 'Security / WAF', 'waf': 'WAF',
  'ab-testing': 'A/B Testing', 'search': 'Search', 'social': 'Social', 'other': 'Other',
}

const GDPR_COLORS: Record<string, string> = {
  essential: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  functional: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  tracking: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  advertising: 'bg-red-500/10 text-red-400 border-red-500/20',
}

export function TechnologiesTab({ result }: Props) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const { technologies } = result

  // Group by category
  const byCategory = new Map<string, typeof technologies.detected>()
  for (const tech of technologies.detected) {
    const list = byCategory.get(tech.category) ?? []
    list.push(tech)
    byCategory.set(tech.category, list)
  }

  const categories = [...byCategory.keys()].sort()

  const filtered = filter === 'all'
    ? technologies.detected
    : technologies.detected.filter(t => t.category === filter)

  const searched = search
    ? filtered.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : filtered

  const trackingCount = technologies.detected.filter(t => t.gdprCategory === 'tracking' || t.gdprCategory === 'advertising').length

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Detected" value={technologies.detected.length} icon="🔍" />
        <StatCard label="Tracking/Ads" value={trackingCount} icon="👁" danger={trackingCount > 5} />
        <StatCard label="Categories" value={categories.length} icon="📂" />
        <StatCard label="Avg Confidence" value={Math.round(technologies.detected.reduce((s, t) => s + t.confidence, 0) / (technologies.detected.length || 1)) + '%'} icon="🎯" />
      </div>

      {/* Summary pills */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Tech Stack Summary</h3>
        <div className="flex flex-wrap gap-2">
          {technologies.summary.cms && <SummaryPill label="CMS" value={technologies.summary.cms} />}
          {technologies.summary.framework && <SummaryPill label="Framework" value={technologies.summary.framework} />}
          {technologies.summary.language && <SummaryPill label="Language" value={technologies.summary.language} />}
          {technologies.summary.server && <SummaryPill label="Server" value={technologies.summary.server} />}
          {technologies.summary.hosting && <SummaryPill label="Hosting" value={technologies.summary.hosting} />}
          {technologies.summary.cdn && <SummaryPill label="CDN" value={technologies.summary.cdn} />}
          {technologies.summary.analytics.map(a => <SummaryPill key={a} label="Analytics" value={a} />)}
          {technologies.summary.tagManagers.map(t => <SummaryPill key={t} label="Tag Manager" value={t} />)}
          {technologies.summary.chatWidgets.map(c => <SummaryPill key={c} label="Chat" value={c} />)}
          {technologies.summary.errorTracking.map(e => <SummaryPill key={e} label="APM" value={e} />)}
        </div>
      </div>

      {/* Filter and search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search technologies…"
          className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-xs outline-none focus:border-primary/50 transition-colors"
        />
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          <FilterBtn active={filter === 'all'} onClick={() => setFilter('all')}>All ({technologies.detected.length})</FilterBtn>
          {['analytics', 'advertising', 'tracking', 'chat', 'cms', 'js-framework', 'hosting', 'cdn'].map(cat => {
            const count = technologies.detected.filter(t => t.category === cat).length
            if (!count) return null
            return <FilterBtn key={cat} active={filter === cat} onClick={() => setFilter(cat)}>{CATEGORY_LABELS[cat] ?? cat} ({count})</FilterBtn>
          })}
        </div>
      </div>

      {/* Technology grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {searched.map(tech => (
          <div key={tech.slug} className="rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-xl flex-shrink-0">{getCategoryIcon(tech.category)}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{tech.name}</div>
                  {tech.version && <div className="text-[10px] text-muted-foreground font-mono">v{tech.version}</div>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <ConfidenceBadge confidence={tech.confidence} />
                {tech.gdprCategory && (
                  <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-medium border uppercase tracking-wide', GDPR_COLORS[tech.gdprCategory])}>
                    {tech.gdprCategory}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground capitalize">{CATEGORY_LABELS[tech.category] ?? tech.category}</span>
              <div className="flex gap-1">
                {tech.detectedVia.slice(0, 3).map(via => (
                  <span key={via} className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{via.replace(/-/g, ' ')}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {searched.length === 0 && (
        <div className="text-center py-10 text-muted-foreground text-sm">
          No technologies found matching your filter.
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon, danger }: { label: string; value: string | number; icon: string; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <span>{icon}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className={cn('text-2xl font-bold', danger ? 'text-red-400' : 'text-foreground')}>{value}</div>
    </div>
  )
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-secondary/50 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-lg text-xs whitespace-nowrap border transition-colors',
        active ? 'bg-primary/20 border-primary/40 text-primary' : 'border-border bg-card text-muted-foreground hover:border-primary/30'
      )}
    >
      {children}
    </button>
  )
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  return (
    <div className="flex items-center gap-1">
      <div className="h-1 w-12 rounded-full bg-secondary overflow-hidden">
        <div
          className={cn('h-full rounded-full', confidence >= 90 ? 'bg-emerald-500' : confidence >= 70 ? 'bg-yellow-500' : 'bg-orange-500')}
          style={{ width: `${confidence}%` }}
        />
      </div>
      <span className="text-[9px] text-muted-foreground">{confidence}%</span>
    </div>
  )
}
