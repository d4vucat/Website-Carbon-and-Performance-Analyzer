import { getPhaseName } from '@/lib/utils'
import type { AnalysisJob } from '@/store'

interface Props {
  job: AnalysisJob
}

const PHASES = [
  { id: 0, label: 'Pre-flight', icon: '🔗' },
  { id: 1, label: 'HTTP & DNS', icon: '🌐' },
  { id: 2, label: 'HTML Parse', icon: '📄' },
  { id: 3, label: 'Browser', icon: '🖥️' },
  { id: 4, label: 'Performance', icon: '⚡' },
  { id: 5, label: 'Tech Stack', icon: '🔍' },
  { id: 6, label: 'Carbon', icon: '🌿' },
  { id: 7, label: 'Scoring', icon: '📊' },
]

export function AnalysisProgress({ job }: Props) {
  const { phase, progress, phaseName, url, status } = job

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 animate-fade-in">
      <div className="rounded-xl border border-border bg-card p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-semibold text-sm mb-0.5">Analyzing website…</h2>
            <p className="text-xs text-muted-foreground truncate max-w-xs">{url}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary tabular-nums">{Math.round(progress)}%</div>
            <div className="text-xs text-muted-foreground">{status}</div>
          </div>
        </div>

        {/* Main progress bar */}
        <div className="h-2 rounded-full bg-secondary overflow-hidden mb-5">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out relative overflow-hidden"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute inset-0 shimmer" />
          </div>
        </div>

        {/* Current phase */}
        <div className="flex items-center gap-2 mb-6 text-xs text-muted-foreground">
          <svg className="w-3.5 h-3.5 animate-spin text-primary flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>{phaseName ?? getPhaseName(phase)}</span>
        </div>

        {/* Phase pipeline */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {PHASES.map((p, i) => {
            const isDone = p.id < phase || (p.id === phase && progress >= 95)
            const isActive = p.id === phase && progress < 95
            const isPending = p.id > phase

            return (
              <div key={p.id} className="flex items-center gap-1 flex-shrink-0">
                <div className={`
                  flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg text-center transition-all
                  ${isActive ? 'bg-primary/20 border border-primary/40' : ''}
                  ${isDone ? 'bg-emerald-500/10 border border-emerald-500/20' : ''}
                  ${isPending ? 'opacity-40' : ''}
                `}>
                  <span className="text-base leading-none">{p.icon}</span>
                  <span className={`text-[10px] font-medium leading-tight ${isActive ? 'text-primary' : isDone ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                    {p.label}
                  </span>
                  <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-primary animate-pulse' : isDone ? 'bg-emerald-400' : 'bg-muted-foreground/20'}`} />
                </div>
                {i < PHASES.length - 1 && (
                  <div className={`h-px w-3 flex-shrink-0 ${p.id < phase ? 'bg-emerald-500/40' : 'bg-border'}`} />
                )}
              </div>
            )
          })}
        </div>

        {/* Estimated time */}
        <div className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground text-center">
          Analysis typically takes 30–60 seconds · Results streamed in real-time
        </div>
      </div>
    </div>
  )
}
