import { useState } from 'react'
import { cn } from '@/lib/utils'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

interface ShareButtonProps {
  jobId: string
  className?: string
}

export function ShareButton({ jobId, className }: ShareButtonProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'copied' | 'error'>('idle')
  const [reportId, setReportId] = useState<string | null>(null)

  async function handleShare() {
    setState('loading')
    try {
      const res = await fetch(`${API}/api/v1/analyze/${jobId}/share`, { method: 'POST' })
      if (!res.ok) throw new Error('Share failed')
      const { reportId } = await res.json() as { reportId: string }
      setReportId(reportId)
      const shareUrl = `${window.location.origin}/results/${reportId}`
      await navigator.clipboard.writeText(shareUrl)
      setState('copied')
      setTimeout(() => setState('idle'), 3000)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleShare}
        disabled={state === 'loading'}
        className={cn(
          'flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition',
          state === 'copied' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400' :
          state === 'error' ? 'border-red-500/50 bg-red-500/10 text-red-400' :
          'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary',
          className
        )}
      >
        {state === 'loading' && <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
        {state === 'copied' && '✓'}
        {state === 'idle' && '🔗'}
        {state === 'error' && '✕'}
        <span>
          {state === 'loading' ? 'Creating…' :
           state === 'copied' ? 'Link copied!' :
           state === 'error' ? 'Share failed' :
           'Share Report'}
        </span>
      </button>

      {reportId && state === 'copied' && (
        <div className="absolute top-full mt-1.5 right-0 rounded-lg border border-border bg-card shadow-xl p-3 text-xs w-72 z-50">
          <div className="text-foreground font-medium mb-1">Shareable link (90-day expiry)</div>
          <div className="font-mono text-muted-foreground bg-secondary rounded px-2 py-1 text-[10px] break-all">
            {window.location.origin}/results/{reportId}
          </div>
        </div>
      )}
    </div>
  )
}

// ── PDF Export Button ─────────────────────────────────────────────────────────

interface PdfExportButtonProps {
  jobId: string
  className?: string
}

export function PdfExportButton({ jobId, className }: PdfExportButtonProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  async function handleExport() {
    setState('loading')
    try {
      const res = await fetch(`${API}/api/v1/analyze/${jobId}/report.pdf`)
      if (!res.ok) throw new Error('PDF generation failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `carbon-report-${jobId}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      setState('done')
      setTimeout(() => setState('idle'), 3000)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={state === 'loading'}
      className={cn(
        'flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition',
        state === 'done' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400' :
        state === 'error' ? 'border-red-500/50 bg-red-500/10 text-red-400' :
        'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary',
        className
      )}
    >
      {state === 'loading' ? (
        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      ) : (
        <span>{state === 'done' ? '✓' : state === 'error' ? '✕' : '📄'}</span>
      )}
      <span>
        {state === 'loading' ? 'Generating PDF…' :
         state === 'done' ? 'Downloaded!' :
         state === 'error' ? 'Generation failed' :
         'Export PDF'}
      </span>
    </button>
  )
}

// ── Shared Report View ────────────────────────────────────────────────────────
// Renders a report loaded from a permalink (/results/:reportId)

interface SharedReportBannerProps {
  url: string
  viewCount: number
  createdAt: number
}

export function SharedReportBanner({ url, viewCount, createdAt }: SharedReportBannerProps) {
  const date = new Date(createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 px-4 py-3 flex items-center gap-3 text-sm">
      <span className="text-blue-400 text-lg">🔗</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-foreground truncate">Shared Report: {url}</div>
        <div className="text-xs text-muted-foreground">Analyzed on {date} · {viewCount.toLocaleString()} view{viewCount !== 1 ? 's' : ''}</div>
      </div>
      <button
        onClick={() => window.location.href = '/'}
        className="shrink-0 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5"
      >
        Run new analysis →
      </button>
    </div>
  )
}
