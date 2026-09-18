import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { HeroSection } from '@/components/HeroSection'
import { AnalysisProgress } from '@/components/AnalysisProgress'
import { ResultsDashboard } from '@/components/ResultsDashboard'
import { CompetitorMode } from '@/components/CompetitorMode'
import { CarbonMonitor } from '@/components/CarbonMonitor'
import { SharedReportBanner } from '@/components/ShareExport'
import { cn } from '@/lib/utils'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

type AppView = 'analyze' | 'compare' | 'monitor' | 'shared'

export default function App() {
  const { jobs, activeJobId } = useAppStore()
  const activeJob = activeJobId ? jobs.get(activeJobId) : null

  const [view, setView] = useState<AppView>('analyze')
  const [sharedReport, setSharedReport] = useState<{
    result: import('@/store').AnalysisResult
    url: string
    viewCount: number
    createdAt: number
    reportId: string
  } | null>(null)

  // Handle /results/:reportId permalink
  useEffect(() => {
    const path = window.location.pathname
    const match = path.match(/^\/results\/([a-zA-Z0-9]+)$/)
    if (match) {
      const reportId = match[1]
      fetch(`${API}/api/v1/results/${reportId}`)
        .then(r => r.json())
        .then((data: { result: import('@/store').AnalysisResult; url: string; viewCount: number; createdAt: number }) => {
          setSharedReport({ ...data, reportId })
          setView('shared')
        })
        .catch(() => { /* show normal UI */ })
    }
  }, [])

  const navItems: Array<{ id: AppView; label: string; icon: string }> = [
    { id: 'analyze',  label: 'Analyze',  icon: '🌿' },
    { id: 'compare',  label: 'Compare',  icon: '⚡' },
    { id: 'monitor',  label: 'Monitor',  icon: '📈' },
  ]

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div
            className="flex items-center gap-2.5 cursor-pointer"
            onClick={() => { setView('analyze'); setSharedReport(null); window.history.pushState({}, '', '/') }}
          >
            <div className="w-7 h-7 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
              <span className="text-sm">🌿</span>
            </div>
            <span className="font-semibold text-sm tracking-tight">
              Carbon<span className="text-primary">Analyzer</span>
            </span>
          </div>

          <nav className="flex items-center gap-1">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  view === item.id
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                )}
              >
                <span>{item.icon}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main>
        {/* Shared report banner */}
        {view === 'shared' && sharedReport && (
          <div className="max-w-7xl mx-auto px-4 pt-4">
            <SharedReportBanner
              url={sharedReport.url}
              viewCount={sharedReport.viewCount}
              createdAt={sharedReport.createdAt}
            />
          </div>
        )}

        {/* Shared report result */}
        {view === 'shared' && sharedReport && (
          <ResultsDashboard
            job={{ jobId: sharedReport.reportId, url: sharedReport.url, status: 'done', progress: 100, phase: 7, result: sharedReport.result, createdAt: sharedReport.createdAt }}
            result={sharedReport.result}
          />
        )}

        {/* Main analyze view */}
        {view === 'analyze' && (
          <>
            <HeroSection />
            {activeJob && (activeJob.status === 'queued' || activeJob.status === 'running') && (
              <AnalysisProgress job={activeJob} />
            )}
            {activeJob && activeJob.status === 'done' && activeJob.result && (
              <ResultsDashboard job={activeJob} result={activeJob.result} />
            )}
            {activeJob && activeJob.status === 'error' && (
              <div className="max-w-3xl mx-auto px-4 py-12">
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
                  <div className="text-2xl mb-3">⚠️</div>
                  <h3 className="font-semibold text-red-400 mb-2">Analysis Failed</h3>
                  <p className="text-sm text-muted-foreground">{activeJob.error ?? 'An unknown error occurred.'}</p>
                </div>
              </div>
            )}
            {!activeJob && (
              <div className="max-w-4xl mx-auto px-4 pb-20">
                <FeatureGrid />
              </div>
            )}
          </>
        )}

        {view === 'compare' && <CompetitorMode />}
        {view === 'monitor' && <CarbonMonitor />}
      </main>
    </div>
  )
}

function FeatureGrid() {
  const features = [
    { icon: '🌿', title: 'Carbon Footprint', desc: 'Three CO₂ models: SWD v4, 1byte, and our Hybrid model with per-resource segmentation.' },
    { icon: '⚡', title: 'Core Web Vitals', desc: 'Real LCP, FCP, TTFB, TBT, CLS, INP measured with Chromium.' },
    { icon: '🖼️', title: 'Image Deep-Dive', desc: '47 image metrics per image: format, sizing, LCP, CLS risk, lazy loading, duplicates, CDN, carbon.' },
    { icon: '🔤', title: 'Font Analysis', desc: 'WOFF2 check, FOIT/FOUT risk, preload status, subsetting, third-party font privacy.' },
    { icon: '🔍', title: 'Tech Detection', desc: '200+ technologies fingerprinted via headers, cookies, globals, DOM, DNS, and TLS signals.' },
    { icon: '🔒', title: 'Security Audit', desc: 'Full security header analysis with CSP, HSTS, COEP, COOP grading and actionable fixes.' },
    { icon: '⚡', title: 'Competitor Compare', desc: 'Analyze 2–4 sites in parallel. Side-by-side carbon, performance, security rankings.' },
    { icon: '📈', title: 'Carbon Monitoring', desc: 'Track CO₂ over time, set budgets, fail CI/CD builds that exceed thresholds.' },
    { icon: '🔗', title: 'Shareable Reports', desc: 'One-click permalink to share results. 90-day expiry, view counts, PDF export.' },
    { icon: '🌱', title: 'Green Hosting', desc: 'Green Web Foundation API verification with evidence type: on-site solar vs REC vs offset.' },
    { icon: '🕷️', title: 'Multi-page Crawl', desc: 'Crawl up to 50 pages, aggregate site-wide carbon, identify worst offenders.' },
    { icon: '♿', title: 'Accessibility', desc: 'axe-core WCAG 2.1 AA compliance checking with violation details and remediation guidance.' },
  ]

  return (
    <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {features.map((f, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-colors">
          <div className="text-2xl mb-3">{f.icon}</div>
          <h3 className="font-semibold text-sm mb-1.5">{f.title}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
        </div>
      ))}
    </div>
  )
}
