import type { AnalysisResult } from '@/store'
import { cn } from '@/lib/utils'

interface Props { result: AnalysisResult }

export function DnsTab({ result }: Props) {
  const { dns, whois, http, pwa, wellKnown, cookies } = result

  return (
    <div className="space-y-5 animate-fade-in">
      {/* HTTP Info */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4">🌐 HTTP Response</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <InfoCard label="Status Code" value={String(http.responseCode)}
            className={http.responseCode >= 400 ? 'text-red-400' : http.responseCode >= 300 ? 'text-yellow-400' : 'text-emerald-400'} />
          <InfoCard label="Server IP" value={http.serverIp ?? 'Unknown'} mono />
          <InfoCard label="Hosting" value={http.hostingProvider ?? 'Unknown'} />
          <InfoCard label="ASN" value={http.asn ?? 'Unknown'} mono />
        </div>

        {http.redirectChain.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Redirect Chain ({http.redirectChain.length} redirects)</h4>
            <div className="space-y-1.5">
              {http.redirectChain.map((hop, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground flex-shrink-0">{i + 1}.</span>
                  <span className={cn('font-mono px-1.5 py-0.5 rounded flex-shrink-0',
                    hop.status >= 400 ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400')}>
                    {hop.status}
                  </span>
                  <span className="text-muted-foreground truncate">{hop.url}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* DNS */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4">🏗️ DNS Records</h3>
        {dns.dnsProvider && (
          <div className="mb-3 text-xs text-muted-foreground">Provider: <span className="text-foreground font-medium">{dns.dnsProvider}</span></div>
        )}
        {dns.emailProvider && (
          <div className="mb-3 text-xs text-muted-foreground">Email: <span className="text-foreground font-medium">{dns.emailProvider}</span></div>
        )}
        <div className="space-y-3">
          {dns.a.length > 0 && <DnsRecord type="A" values={dns.a} />}
          {dns.aaaa.length > 0 && <DnsRecord type="AAAA" values={dns.aaaa} />}
          {dns.cname && <DnsRecord type="CNAME" values={[dns.cname]} />}
          {dns.ns.length > 0 && <DnsRecord type="NS" values={dns.ns} />}
          {dns.mx.length > 0 && (
            <div className="flex gap-3">
              <span className="text-xs font-mono bg-secondary px-2 py-1 rounded text-muted-foreground flex-shrink-0 self-start">MX</span>
              <div className="space-y-1">
                {dns.mx.map((mx, i) => (
                  <div key={`${mx.exchange}-${i}`} className="text-xs font-mono">
                    <span className="text-muted-foreground">{mx.priority} </span>
                    <span>{mx.exchange}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {dns.txt.length > 0 && (
            <div className="flex gap-3">
              <span className="text-xs font-mono bg-secondary px-2 py-1 rounded text-muted-foreground flex-shrink-0 self-start">TXT</span>
              <div className="space-y-1 min-w-0">
                {dns.txt.slice(0, 8).map((txt, i) => (
                  <div key={i} className="text-xs font-mono text-muted-foreground break-all leading-relaxed">
                    "{txt.length > 100 ? txt.slice(0, 100) + '…' : txt}"
                  </div>
                ))}
              </div>
            </div>
          )}
          {dns.caa && dns.caa.length > 0 && (
            <DnsRecord type="CAA" values={(dns.caa as Array<{ issue?: string; issuewild?: string; iodef?: string }>).map(c => c.issue ?? c.issuewild ?? c.iodef ?? '')} />
          )}
        </div>
      </div>

      {/* WHOIS / RDAP */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">📋 WHOIS / RDAP Information</h3>
          {whois.source && (
            <span className={cn(
              'text-[10px] px-2 py-0.5 rounded font-medium',
              whois.source === 'rdap'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
            )}>
              {whois.source === 'rdap' ? 'RDAP' : 'WhoisJSON'}
            </span>
          )}
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          {whois.createdAt && <InfoCard label="Registered" value={new Date(whois.createdAt).toLocaleDateString()} />}
          {whois.updatedAt && <InfoCard label="Last Updated" value={new Date(whois.updatedAt).toLocaleDateString()} />}
          {whois.expiresAt && (
            <InfoCard label="Expires"
              value={new Date(whois.expiresAt).toLocaleDateString()}
              className={whois.daysUntilExpiry != null && whois.daysUntilExpiry < 30 ? 'text-red-400' : whois.daysUntilExpiry != null && whois.daysUntilExpiry < 90 ? 'text-yellow-400' : ''} />
          )}
          {whois.daysUntilExpiry != null && (
            <InfoCard label="Days Until Expiry"
              value={String(whois.daysUntilExpiry)}
              className={whois.daysUntilExpiry < 30 ? 'text-red-400' : whois.daysUntilExpiry < 90 ? 'text-yellow-400' : 'text-emerald-400'} />
          )}
        </div>

        {/* Registrar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
          {whois.registrar && <InfoCard label="Registrar" value={whois.registrar} />}
          {whois.registrarIanaId && <InfoCard label="IANA ID" value={whois.registrarIanaId} mono />}
          {whois.domainHandle && <InfoCard label="Domain Handle" value={whois.domainHandle} mono />}
          <InfoCard label="Registry Locked" value={whois.isRegistryLocked ? 'Yes ✓' : 'No'}
            className={whois.isRegistryLocked ? 'text-emerald-400' : 'text-yellow-400'} />
          {whois.dnssecSigned != null && (
            <InfoCard label="DNSSEC" value={whois.dnssecSigned ? 'Signed ✓' : 'Unsigned'}
              className={whois.dnssecSigned ? 'text-emerald-400' : 'text-muted-foreground'} />
          )}
          {whois.registrarUrl && (
            <div className="rounded-lg bg-secondary/50 px-3 py-2.5">
              <div className="text-[10px] text-muted-foreground mb-1">Registrar URL</div>
              <a href={whois.registrarUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:underline truncate block">{whois.registrarUrl}</a>
            </div>
          )}
        </div>

        {/* Registrar abuse contacts */}
        {(whois.registrarAbuseEmail || whois.registrarAbusePhone) && (
          <div className="grid grid-cols-2 gap-3 mb-3">
            {whois.registrarAbuseEmail && <InfoCard label="Abuse Email" value={whois.registrarAbuseEmail} mono />}
            {whois.registrarAbusePhone && <InfoCard label="Abuse Phone" value={whois.registrarAbusePhone} mono />}
          </div>
        )}

        {/* Registrant / Tech contacts */}
        {(whois.registrantName || whois.registrantEmail || whois.techName || whois.techEmail) && (
          <div className="mt-3 pt-3 border-t border-border">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Contacts</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {whois.registrantName  && <InfoCard label="Registrant" value={whois.registrantName} />}
              {whois.registrantEmail && <InfoCard label="Registrant Email" value={whois.registrantEmail} mono />}
              {whois.registrantPhone && <InfoCard label="Registrant Phone" value={whois.registrantPhone} mono />}
              {whois.techName  && <InfoCard label="Technical Contact" value={whois.techName} />}
              {whois.techEmail && <InfoCard label="Tech Email" value={whois.techEmail} mono />}
            </div>
          </div>
        )}

        {/* Nameservers */}
        {whois.nameservers.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <h4 className="text-xs text-muted-foreground mb-2">Nameservers</h4>
            <div className="flex flex-wrap gap-1.5">
              {whois.nameservers.map((ns, i) => (
                <span key={`${ns}-${i}`} className="text-[11px] font-mono px-2 py-1 rounded bg-secondary">{ns}</span>
              ))}
            </div>
          </div>
        )}

        {/* Status codes */}
        {whois.statusCodes.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <h4 className="text-xs text-muted-foreground mb-2">Status Codes</h4>
            <div className="flex flex-wrap gap-1.5">
              {whois.statusCodes.map((sc, i) => (
                <span key={`${sc}-${i}`} className="text-[10px] px-2 py-0.5 rounded bg-secondary text-muted-foreground">{sc}</span>
              ))}
            </div>
          </div>
        )}

        {/* DNSSEC DS records */}
        {whois.dnssecDsRecords && whois.dnssecDsRecords.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <h4 className="text-xs text-muted-foreground mb-2">DNSSEC DS Records</h4>
            <div className="space-y-1">
              {whois.dnssecDsRecords.map((ds, i) => (
                <div key={i} className="text-[11px] font-mono text-muted-foreground break-all">{ds}</div>
              ))}
            </div>
          </div>
        )}

        {/* Remarks */}
        {whois.remarks && whois.remarks.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <h4 className="text-xs text-muted-foreground mb-2">Registry Remarks</h4>
            <div className="space-y-1">
              {whois.remarks.map((r, i) => (
                <div key={i} className="text-[11px] text-muted-foreground">{r}</div>
              ))}
            </div>
          </div>
        )}

        {/* RDAP URL */}
        {whois.rdapUrl && (
          <div className="mt-3 pt-3 border-t border-border">
            <a href={whois.rdapUrl} target="_blank" rel="noopener noreferrer"
              className="text-[11px] text-blue-400 hover:underline font-mono">
              🔗 View raw RDAP record
            </a>
          </div>
        )}
      </div>

      {/* Well-known files */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4">📁 Well-Known Files</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <WellKnownCard label="security.txt" found={wellKnown.securityTxt?.found ?? false} path="/.well-known/security.txt" />
          <WellKnownCard label="robots.txt" found={result.seo.robotsTxtFound} path="/robots.txt" />
          <WellKnownCard label="sitemap.xml" found={wellKnown.sitemapXml?.found ?? false}
            extra={wellKnown.sitemapXml?.found ? `${wellKnown.sitemapXml.urlCount} URLs` : undefined}
            path="/sitemap.xml" />
          <WellKnownCard label="ads.txt" found={wellKnown.adsTxt?.found ?? false}
            extra={wellKnown.adsTxt?.found ? `${wellKnown.adsTxt.entries} entries` : undefined}
            path="/ads.txt" />
        </div>
      </div>

      {/* PWA */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4">📱 Progressive Web App</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          {Object.entries(pwa.installabilityChecks).map(([key, pass]) => (
            <div key={key} className={cn('rounded-lg border p-3 text-xs',
              pass ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5')}>
              <span className={pass ? 'text-emerald-400' : 'text-red-400'}>{pass ? '✓ ' : '✗ '}</span>
              <span className={pass ? 'text-emerald-400' : 'text-red-400'}>
                {key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
              </span>
            </div>
          ))}
        </div>
        <div className={cn('rounded-lg border p-4 text-center', pwa.isInstallable ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-border bg-secondary/20')}>
          <div className={cn('text-lg font-semibold', pwa.isInstallable ? 'text-emerald-400' : 'text-muted-foreground')}>
            {pwa.isInstallable ? '✅ PWA Installable' : '⚠️ Not PWA Installable'}
          </div>
          {Boolean((pwa.manifest as Record<string, unknown>)?.name) && <p className="text-xs text-muted-foreground mt-1">App name: {String((pwa.manifest as Record<string, unknown>).name)}</p>}
        </div>
      </div>

      {/* Cookies */}
      {cookies.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h3 className="text-sm font-semibold">🍪 Cookies ({cookies.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {['Name', 'Domain', 'HttpOnly', 'Secure', 'SameSite', 'Expires'].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cookies.slice(0, 50).map((c, i) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-secondary/20">
                    <td className="px-3 py-2 font-mono max-w-xs truncate">{c.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.domain}</td>
                    <td className="px-3 py-2"><span className={c.httpOnly ? 'text-emerald-400' : 'text-red-400'}>{c.httpOnly ? '✓' : '✗'}</span></td>
                    <td className="px-3 py-2"><span className={c.secure ? 'text-emerald-400' : 'text-red-400'}>{c.secure ? '✓' : '✗'}</span></td>
                    <td className="px-3 py-2 text-muted-foreground">{c.sameSite ?? '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.expires ? new Date(c.expires * 1000).toLocaleDateString() : 'Session'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function DnsRecord({ type, values }: { type: string; values: string[] }) {
  return (
    <div className="flex gap-3">
      <span className="text-xs font-mono bg-secondary px-2 py-1 rounded text-muted-foreground flex-shrink-0 self-start w-14 text-center">{type}</span>
      <div className="space-y-1">
        {values.map(v => (
          <div key={v} className="text-xs font-mono">{v}</div>
        ))}
      </div>
    </div>
  )
}

function InfoCard({ label, value, className, mono }: { label: string; value: string; className?: string; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-secondary/50 px-3 py-2.5">
      <div className="text-[10px] text-muted-foreground mb-1">{label}</div>
      <div className={cn('text-xs font-medium truncate', mono && 'font-mono', className)}>{value}</div>
    </div>
  )
}

function WellKnownCard({ label, found, extra, path }: { label: string; found: boolean; extra?: string; path: string }) {
  return (
    <div className={cn('rounded-lg border p-3 text-center', found ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-border bg-secondary/20')}>
      <div className={cn('text-lg mb-1', found ? 'text-emerald-400' : 'text-muted-foreground')}>{found ? '✅' : '❌'}</div>
      <div className={cn('text-xs font-medium font-mono', found ? 'text-emerald-400' : 'text-muted-foreground')}>{label}</div>
      {extra && <div className="text-[10px] text-muted-foreground mt-0.5">{extra}</div>}
    </div>
  )
}
