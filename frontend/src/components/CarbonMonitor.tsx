import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

interface Snapshot {
  id: number
  domain: string
  co2PerView: number
  transferBytes: number
  carbonGrade: string
  greenHosting: boolean
  performanceScore?: number
  recordedAt: number
}

interface TrendData {
  domain: string
  snapshots: Snapshot[]
  trend: 'improving' | 'degrading' | 'stable' | 'insufficient-data'
  changePercent: number
  baseline?: Snapshot
  latest?: Snapshot
  weeklyAverage?: number
  monthlyAverage?: number
}

function fmtBytes(b: number) {
  if (!b) return '0 B'
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1048576).toFixed(2)} MB`
}

function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const TREND_CONFIG = {
  improving: { color: 'text-emerald-400', icon: '↓', label: 'Improving' },
  degrading: { color: 'text-red-400', icon: '↑', label: 'Degrading' },
  stable: { color: 'text-yellow-400', icon: '→', label: 'Stable' },
  'insufficient-data': { color: 'text-muted-foreground', icon: '?', label: 'Not enough data' },
}

function MiniChart({ snapshots }: { snapshots: Snapshot[] }) {
  if (snapshots.length < 2) return null
  const vals = snapshots.map(s => s.co2PerView)
  const max = Math.max(...vals)
  const min = Math.min(...vals)
  const range = max - min || 1
  const W = 320, H = 60, PAD = 8

  const points = vals.map((v, i) => {
    const x = PAD + (i / (vals.length - 1)) * (W - PAD * 2)
    const y = H - PAD - ((v - min) / range) * (H - PAD * 2)
    return `${x},${y}`
  }).join(' ')

  const areaPoints = `${PAD},${H - PAD} ${points} ${PAD + (W - PAD * 2)},${H - PAD}`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.03" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill="url(#areaGrad)" />
      <polyline points={points} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {vals.map((_, i) => {
        const [x, y] = points.split(' ')[i].split(',').map(Number)
        return <circle key={i} cx={x} cy={y} r="3" fill="#10b981" />
      })}
    </svg>
  )
}

interface Props {
  domain?: string
}

export function CarbonMonitor({ domain: initialDomain }: Props) {
  const [domain, setDomain] = useState(initialDomain ?? '')
  const [input, setInput] = useState(initialDomain ?? '')
  const [trend, setTrend] = useState<TrendData | null>(null)
  const [loading, setLoading] = useState(false)
  const [budgetForm, setBudgetForm] = useState({ maxCo2: '', maxKb: '' })
  const [budgetSaved, setBudgetSaved] = useState(false)
  const [ciResult, setCiResult] = useState<{ passed: boolean; message: string } | null>(null)

  useEffect(() => {
    if (!domain) return
    setLoading(true)
    fetch(`${API}/api/v1/carbon/history/${encodeURIComponent(domain)}`)
      .then(r => r.json())
      .then((d: TrendData) => { setTrend(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [domain])

  function lookup() {
    if (!input.trim()) return
    const h = input.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim()
    setDomain(h)
  }

  async function saveBudget() {
    const co2 = parseFloat(budgetForm.maxCo2)
    if (!co2 || !domain) return
    const body: Record<string, unknown> = { domain, maxCo2PerView: co2 }
    if (budgetForm.maxKb) body.maxTransferBytes = parseInt(budgetForm.maxKb) * 1024
    await fetch(`${API}/api/v1/carbon/budget`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setBudgetSaved(true)
    setTimeout(() => setBudgetSaved(false), 3000)
  }

  async function runCiCheck() {
    if (!trend?.latest || !domain) return
    const res = await fetch(`${API}/api/v1/carbon/budget/${domain}/check`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        co2PerView: trend.latest.co2PerView,
        transferBytes: trend.latest.transferBytes,
        carbonGrade: trend.latest.carbonGrade,
        greenHosting: trend.latest.greenHosting,
        performanceScore: trend.latest.performanceScore,
      }),
    })
    const data = await res.json() as { passed: boolean; message: string }
    setCiResult(data)
  }

  const tc = trend ? TREND_CONFIG[trend.trend] : null

  return (
    <div className="min-h-screen bg-background px-4 py-10 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">📈 Carbon Over Time</h1>
        <p className="text-muted-foreground text-sm mt-1">Track a domain's carbon footprint across every analysis. Set budgets for CI/CD integration.</p>
      </div>

      {/* Domain lookup */}
      <div className="rounded-2xl border border-border bg-card p-5 mb-6">
        <div className="flex gap-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && lookup()}
            placeholder="example.com or https://example.com"
            className="flex-1 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button onClick={lookup} className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90">
            Load History
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading carbon history…</div>
      )}

      {trend && !loading && (
        <div className="space-y-5">
          {/* Trend summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className={cn('text-2xl font-bold', tc?.color)}>{tc?.icon} {tc?.label}</div>
              <div className="text-xs text-muted-foreground">Trend</div>
              {trend.changePercent !== 0 && (
                <div className={cn('text-xs mt-1', tc?.color)}>{Math.abs(trend.changePercent)}% {trend.trend === 'improving' ? 'reduction' : 'increase'}</div>
              )}
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-xl font-bold text-foreground">{trend.snapshots.length}</div>
              <div className="text-xs text-muted-foreground">Total Snapshots</div>
            </div>
            {trend.latest && (
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="text-xl font-bold text-foreground">{trend.latest.co2PerView.toFixed(4)}g</div>
                <div className="text-xs text-muted-foreground">Latest CO₂/view</div>
                <div className="text-[10px] text-muted-foreground/70 mt-1">{fmtDate(trend.latest.recordedAt)}</div>
              </div>
            )}
            {trend.weeklyAverage !== undefined && (
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="text-xl font-bold text-foreground">{trend.weeklyAverage.toFixed(4)}g</div>
                <div className="text-xs text-muted-foreground">7-Day Average</div>
              </div>
            )}
          </div>

          {/* Chart */}
          {trend.snapshots.length >= 2 && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold mb-3">CO₂ Trend ({trend.snapshots.length} snapshots)</h2>
              <MiniChart snapshots={trend.snapshots} />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>{fmtDate(trend.snapshots[0].recordedAt)}</span>
                <span>{fmtDate(trend.snapshots[trend.snapshots.length - 1].recordedAt)}</span>
              </div>
            </div>
          )}

          {trend.trend === 'insufficient-data' && (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
              <div className="text-3xl mb-2">📊</div>
              <p className="text-sm">Not enough data yet. Run at least 2 analyses on this domain to see trends.</p>
            </div>
          )}

          {/* History table */}
          {trend.snapshots.length > 0 && (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="p-4 border-b border-border">
                <h2 className="text-sm font-semibold">Snapshot History</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50">
                      {['Date', 'CO₂/view', 'Grade', 'Size', 'Green', 'Perf'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] text-muted-foreground font-medium uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...trend.snapshots].reverse().map(s => (
                      <tr key={s.id} className="border-b border-border/50 hover:bg-secondary/20">
                        <td className="px-3 py-2 text-muted-foreground">{fmtDate(s.recordedAt)}</td>
                        <td className="px-3 py-2 font-medium text-foreground">{s.co2PerView.toFixed(5)}g</td>
                        <td className="px-3 py-2">
                          <span className={cn('font-bold', s.carbonGrade.startsWith('A') ? 'text-emerald-400' : s.carbonGrade === 'B' ? 'text-blue-400' : s.carbonGrade === 'C' ? 'text-yellow-400' : 'text-red-400')}>
                            {s.carbonGrade}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{fmtBytes(s.transferBytes)}</td>
                        <td className="px-3 py-2">{s.greenHosting ? <span className="text-emerald-400">🌱</span> : <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-3 py-2 text-muted-foreground">{s.performanceScore ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Carbon Budget / CI-CD */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold mb-1">🔧 Carbon Budget (CI/CD)</h2>
            <p className="text-xs text-muted-foreground mb-4">Set a maximum CO₂ threshold. Use the check endpoint in CI to fail builds that exceed it.</p>

            <div className="flex flex-wrap gap-3 mb-4">
              <div className="flex-1 min-w-[160px]">
                <label className="text-[10px] text-muted-foreground uppercase font-medium block mb-1">Max CO₂ per view (g)</label>
                <input
                  type="number" step="0.0001" value={budgetForm.maxCo2}
                  onChange={e => setBudgetForm(b => ({ ...b, maxCo2: e.target.value }))}
                  placeholder="e.g. 0.005"
                  className="w-full rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="text-[10px] text-muted-foreground uppercase font-medium block mb-1">Max Transfer Size (KB, optional)</label>
                <input
                  type="number" value={budgetForm.maxKb}
                  onChange={e => setBudgetForm(b => ({ ...b, maxKb: e.target.value }))}
                  placeholder="e.g. 500"
                  className="w-full rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="flex gap-3 flex-wrap">
              <button onClick={saveBudget} className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90">
                {budgetSaved ? '✓ Saved!' : 'Save Budget'}
              </button>
              {trend.latest && (
                <button onClick={runCiCheck} className="px-4 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-secondary">
                  Run Budget Check
                </button>
              )}
            </div>

            {ciResult && (
              <div className={cn('mt-4 rounded-lg p-3 text-xs border', ciResult.passed ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400' : 'border-red-500/30 bg-red-500/5 text-red-400')}>
                {ciResult.message}
                <div className="mt-1 text-muted-foreground font-mono">Exit code: {ciResult.passed ? 0 : 1}</div>
              </div>
            )}

            <div className="mt-4 rounded-lg bg-secondary p-3 text-[10px] font-mono text-muted-foreground">
              <div className="text-foreground mb-1"># CI/CD curl example:</div>
              {`curl -s -o /dev/null -w "%{http_code}" \
  -X POST ${API}/api/v1/carbon/budget/${domain}/check \
  -H "Content-Type: application/json" \
  -d '{"co2PerView":0.004,"transferBytes":512000,"carbonGrade":"A","greenHosting":false}'`}</div>
          </div>
        </div>
      )}
    </div>
  )
}
