import { useState, useMemo } from 'react'
import type { AnalysisResult } from '@/store'
import { formatBytes, formatDuration, truncateUrl, getResourceTypeColor, cn } from '@/lib/utils'

interface Props { result: AnalysisResult }

export function NetworkTab({ result }: Props) {
  const [typeFilter, setTypeFilter] = useState('all')
  const [partyFilter, setPartyFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'transfer' | 'duration' | 'type'>('transfer')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  const { performance } = result
  const requests = performance.networkRequests

  const filtered = useMemo(() => {
    let r = requests
    if (typeFilter !== 'all') r = r.filter(req => req.type === typeFilter)
    if (partyFilter === 'first') r = r.filter(req => !req.isThirdParty)
    if (partyFilter === 'third') r = r.filter(req => req.isThirdParty)
    if (search) r = r.filter(req => req.url.toLowerCase().includes(search.toLowerCase()))
    return [...r].sort((a, b) => {
      if (sortBy === 'transfer') return b.transferSize - a.transferSize
      if (sortBy === 'duration') return b.timing.totalDuration - a.timing.totalDuration
      return a.type.localeCompare(b.type)
    })
  }, [requests, typeFilter, partyFilter, search, sortBy])

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  const types = [...new Set(requests.map(r => r.type))].sort()
  const totalTransfer = requests.reduce((s, r) => s + r.transferSize, 0)
  const thirdPartyTransfer = requests.filter(r => r.isThirdParty).reduce((s, r) => s + r.transferSize, 0)
  const cachedCount = requests.filter(r => r.fromCache).length
  const compressedCount = requests.filter(r => r.contentEncoding && r.transferSize < r.decodedSize * 0.9).length

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Requests" value={requests.length} />
        <StatCard label="Total Transfer" value={formatBytes(totalTransfer)} />
        <StatCard label="Cached" value={`${cachedCount} (${requests.length ? Math.round((cachedCount / requests.length) * 100) : 0}%)`} color="text-emerald-400" />
        <StatCard label="3rd Party" value={`${formatBytes(thirdPartyTransfer)}`} color="text-orange-400" />
      </div>

      {/* Waterfall type breakdown */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3">Request Waterfall by Type</h3>
        <div className="h-6 rounded-full overflow-hidden flex">
          {types.map(type => {
            const typeRequests = requests.filter(r => r.type === type)
            const typeTransfer = typeRequests.reduce((s, r) => s + r.transferSize, 0)
            const pct = totalTransfer > 0 ? (typeTransfer / totalTransfer) * 100 : 0
            if (pct < 0.5) return null
            return (
              <div key={type} style={{ width: `${pct}%`, background: getResourceTypeColor(type) }}
                className="h-full" title={`${type}: ${formatBytes(typeTransfer)} (${pct.toFixed(1)}%)`} />
            )
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {types.map(type => {
            const typeRequests = requests.filter(r => r.type === type)
            const typeTransfer = typeRequests.reduce((s, r) => s + r.transferSize, 0)
            return (
              <div key={type} className="flex items-center gap-1.5 text-[11px]">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: getResourceTypeColor(type) }} />
                <span className="text-muted-foreground capitalize">{type}</span>
                <span className="font-mono">{formatBytes(typeTransfer)}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }}
          placeholder="Filter by URL…"
          className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-xs outline-none focus:border-primary/50 transition-colors" />
        <div className="flex gap-2 flex-wrap">
          {(['all', ...types] as string[]).slice(0, 6).map(type => (
            <button key={type} onClick={() => { setTypeFilter(type); setPage(0) }}
              className={cn('px-2.5 py-1.5 rounded text-xs border transition-colors capitalize',
                typeFilter === type ? 'bg-primary/20 border-primary/40 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
              {type}
            </button>
          ))}
          <select value={partyFilter} onChange={e => { setPartyFilter(e.target.value); setPage(0) }}
            className="bg-card border border-border rounded-lg px-2 py-1.5 text-xs outline-none">
            <option value="all">All parties</option>
            <option value="first">First-party</option>
            <option value="third">Third-party</option>
          </select>
        </div>
      </div>

      {/* Requests table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">{filtered.length} requests</h3>
          <div className="flex gap-2">
            {(['transfer', 'duration', 'type'] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)}
                className={cn('px-2.5 py-1 rounded text-xs border transition-colors capitalize',
                  sortBy === s ? 'bg-primary/20 border-primary/40 text-primary' : 'border-border text-muted-foreground')}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {['URL', 'Type', 'Status', 'Transfer', 'Duration', 'Cache', 'Encoding', 'Party'].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map((req, i) => (
                <tr key={i} className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
                  <td className="px-3 py-2 max-w-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: getResourceTypeColor(req.type) }} />
                      <span className="truncate font-mono text-muted-foreground" title={req.url}>
                        {truncateUrl(req.url.replace(/^https?:\/\//, ''), 55)}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 capitalize text-muted-foreground whitespace-nowrap">{req.type}</td>
                  <td className="px-3 py-2">
                    <span className={cn('font-mono', req.status >= 400 ? 'text-red-400' : req.status >= 300 ? 'text-yellow-400' : 'text-emerald-400')}>
                      {req.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono whitespace-nowrap">{formatBytes(req.transferSize)}</td>
                  <td className="px-3 py-2 font-mono whitespace-nowrap text-muted-foreground">
                    {req.timing.totalDuration > 0 ? formatDuration(req.timing.totalDuration) : '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {req.fromCache
                      ? <span className="text-emerald-400">cached</span>
                      : <span className="text-muted-foreground">{req.cacheControl?.includes('no-store') ? 'no-store' : req.cacheControl?.match(/max-age=(\d+)/)?.[1] ? `${req.cacheControl.match(/max-age=(\d+)/)![1]}s` : '—'}</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">{req.contentEncoding ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={req.isThirdParty ? 'text-orange-400' : 'text-muted-foreground'}>
                      {req.isThirdParty ? '3rd' : '1st'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages} · {filtered.length} requests
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="px-3 py-1 rounded border border-border text-xs disabled:opacity-40 hover:bg-secondary transition-colors">←</button>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="px-3 py-1 rounded border border-border text-xs disabled:opacity-40 hover:bg-secondary transition-colors">→</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={cn('text-xl font-bold', color)}>{value}</div>
    </div>
  )
}
