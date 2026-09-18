import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '@/store'
import { getDomain } from '@/lib/utils'

const DEMO_URLS = [
  'https://www.bbc.com',
  'https://www.wikipedia.org',
  'https://vercel.com',
  'https://github.com',
  'https://www.nytimes.com',
]

export function HeroSection() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { startAnalysis, jobs, activeJobId } = useAppStore()
  const inputRef = useRef<HTMLInputElement>(null)

  const activeJob = activeJobId ? jobs.get(activeJobId) : null
  const isRunning = activeJob?.status === 'queued' || activeJob?.status === 'running'

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    setError('')
    setLoading(true)
    try {
      await startAnalysis(trimmed, {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start analysis')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="relative pt-12 pb-8 px-4 text-center overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          Real Chromium · Stealth Mode · IAB TCF v2.2 · WCAG 2.1 AA
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
          Website Carbon &amp;{' '}
          <span className="text-primary">Performance Analyzer</span>
        </h1>
        <p className="text-sm text-muted-foreground mb-8 max-w-xl mx-auto">
          Measure CO₂ per page view, Core Web Vitals, security headers, cookie audit, IAB TCF
          compliance, third-party tracking, accessibility, and 200+ technologies.
        </p>

        {/* URL form */}
        <form onSubmit={handleSubmit} className="relative max-w-2xl mx-auto">
          <div className="flex items-center gap-2 p-1.5 rounded-xl border border-border bg-card focus-within:border-primary/50 transition-colors">
            <div className="flex-1 flex items-center gap-2 px-3">
              <svg className="w-4 h-4 text-muted-foreground flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={url}
                onChange={e => { setUrl(e.target.value); setError('') }}
                placeholder="Enter any URL — https://example.com"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 py-2"
                disabled={loading || isRunning}
                autoComplete="off"
                spellCheck={false}
              />
              {url && (
                <button type="button" onClick={() => setUrl('')} className="text-muted-foreground hover:text-foreground transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || isRunning || !url.trim()}
              className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors whitespace-nowrap flex items-center gap-2"
            >
              {loading || isRunning ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analyzing…
                </>
              ) : 'Analyze'}
            </button>
          </div>
          {error && (
            <p className="mt-2 text-xs text-red-400 text-left px-2">{error}</p>
          )}
        </form>

        {/* Demo URLs */}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {DEMO_URLS.map(demoUrl => (
            <button
              key={demoUrl}
              onClick={() => { setUrl(demoUrl); inputRef.current?.focus() }}
              disabled={loading || isRunning}
              className="px-3 py-1 rounded-full border border-border bg-card text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors disabled:opacity-40"
            >
              {getDomain(demoUrl)}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
