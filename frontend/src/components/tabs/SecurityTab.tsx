import type { AnalysisResult } from '@/store'
import { getGradeColor, cn } from '@/lib/utils'

interface Props { result: AnalysisResult }

export function SecurityTab({ result }: Props) {
  const { security } = result

  const headers = [
    { key: 'hsts', label: 'HTTP Strict Transport Security', abbr: 'HSTS', result: security.headers.hsts },
    { key: 'csp', label: 'Content Security Policy', abbr: 'CSP', result: security.headers.csp },
    { key: 'xFrameOptions', label: 'X-Frame-Options', abbr: 'X-FO', result: security.headers.xFrameOptions },
    { key: 'xContentTypeOptions', label: 'X-Content-Type-Options', abbr: 'XCTO', result: security.headers.xContentTypeOptions },
    { key: 'referrerPolicy', label: 'Referrer Policy', abbr: 'RP', result: security.headers.referrerPolicy },
    { key: 'permissionsPolicy', label: 'Permissions Policy', abbr: 'PP', result: security.headers.permissionsPolicy },
    { key: 'coep', label: 'Cross-Origin Embedder Policy', abbr: 'COEP', result: security.headers.coep },
    { key: 'coop', label: 'Cross-Origin Opener Policy', abbr: 'COOP', result: security.headers.coop },
    { key: 'corp', label: 'Cross-Origin Resource Policy', abbr: 'CORP', result: security.headers.corp },
    { key: 'xxssProtection', label: 'X-XSS-Protection', abbr: 'XSS', result: security.headers.xxssProtection },
  ]

  const presentCount = headers.filter(h => h.result.present).length

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Score overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className={cn('text-4xl font-bold mb-1', getGradeColor(security.grade))}>{security.grade}</div>
          <div className="text-xs text-muted-foreground">Security Grade</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className={cn('text-3xl font-bold mb-1', security.score >= 70 ? 'text-emerald-400' : security.score >= 40 ? 'text-yellow-400' : 'text-red-400')}>
            {security.score}
          </div>
          <div className="text-xs text-muted-foreground">Score / 100</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className={cn('text-3xl font-bold mb-1', presentCount >= 7 ? 'text-emerald-400' : presentCount >= 4 ? 'text-yellow-400' : 'text-red-400')}>
            {presentCount}/{headers.length}
          </div>
          <div className="text-xs text-muted-foreground">Headers Present</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className={cn('text-sm font-bold mb-1', security.https ? 'text-emerald-400' : 'text-red-400')}>
            {security.https ? '✓ HTTPS' : '✗ HTTP'}
          </div>
          <div className="text-xs text-muted-foreground">TLS {security.tlsVersion}</div>
          {security.mixedContent && <div className="text-[10px] text-red-400 mt-0.5">⚠ Mixed Content</div>}
        </div>
      </div>

      {/* TLS Certificate */}
      {security.certificate && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4">🔐 TLS Certificate</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <CertField label="Subject" value={security.certificate.subject} />
            <CertField label="Issuer" value={security.certificate.issuer} />
            <CertField label="Algorithm" value={security.certificate.algorithm} />
            <CertField label="Valid From" value={new Date(security.certificate.validFrom).toLocaleDateString()} />
            <CertField label="Valid To" value={new Date(security.certificate.validTo).toLocaleDateString()} />
            <CertField
              label="Days Until Expiry"
              value={`${security.certificate.daysUntilExpiry} days`}
              className={security.certificate.daysUntilExpiry < 30 ? 'text-red-400' : security.certificate.daysUntilExpiry < 90 ? 'text-yellow-400' : 'text-emerald-400'}
            />
            {security.certificate.isWildcard && <CertField label="Type" value="Wildcard" className="text-blue-400" />}
            {security.certificate.isEV && <CertField label="EV Certificate" value="Yes" className="text-emerald-400" />}
          </div>
          {security.certificate.sans.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-xs text-muted-foreground mb-2">Subject Alternative Names ({security.certificate.sans.length})</div>
              <div className="flex flex-wrap gap-1.5">
                {security.certificate.sans.slice(0, 12).map(san => (
                  <span key={san} className="text-[11px] px-2 py-0.5 rounded bg-secondary font-mono">{san}</span>
                ))}
                {security.certificate.sans.length > 12 && (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-secondary text-muted-foreground">+{security.certificate.sans.length - 12} more</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Security Headers */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">Security Headers Analysis</h3>
        </div>
        <div className="divide-y divide-border">
          {headers.map(({ key, label, abbr, result: hr }) => (
            <div key={key} className="px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className={cn('w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0',
                    hr.present ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400')}>
                    {hr.present ? '✓' : '✗'}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{label}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">{abbr}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className={cn('text-sm font-bold', getGradeColor(hr.grade))}>{hr.grade}</div>
                    <div className="text-[10px] text-muted-foreground">{hr.score} pts</div>
                  </div>
                </div>
              </div>

              {hr.value && (
                <div className="mt-2 mb-2">
                  <code className="text-[11px] font-mono px-2 py-1.5 rounded bg-secondary/50 text-muted-foreground block overflow-x-auto whitespace-pre-wrap break-all">
                    {hr.value.length > 200 ? hr.value.slice(0, 200) + '…' : hr.value}
                  </code>
                </div>
              )}

              {hr.issues.length > 0 && (
                <div className="mt-2 space-y-1">
                  {hr.issues.map((issue, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-yellow-400">
                      <span className="flex-shrink-0 mt-0.5">⚠</span>
                      <span>{issue}</span>
                    </div>
                  ))}
                </div>
              )}

              {hr.recommendations.length > 0 && (
                <div className="mt-2 space-y-1">
                  {hr.recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-blue-400">
                      <span className="flex-shrink-0 mt-0.5">💡</span>
                      <span>{rec}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Vulnerable Libraries */}
      {security.vulnerableLibraries.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5">
          <h3 className="text-sm font-semibold text-red-400 mb-3">⚠️ Vulnerable Libraries ({security.vulnerableLibraries.length})</h3>
          <div className="space-y-2">
            {security.vulnerableLibraries.map(lib => (
              <div key={lib.name} className="flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
                <div>
                  <span className="text-sm font-medium">{lib.name}</span>
                  <span className="ml-2 text-xs font-mono text-muted-foreground">v{lib.version}</span>
                </div>
                <div className="flex gap-1">
                  {lib.cves.map(cve => (
                    <a key={cve} href={`https://nvd.nist.gov/vuln/detail/${cve}`} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">
                      {cve}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CertField({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg bg-secondary/50 px-3 py-2.5">
      <div className="text-[10px] text-muted-foreground mb-1">{label}</div>
      <div className={cn('text-xs font-medium truncate', className)}>{value}</div>
    </div>
  )
}
