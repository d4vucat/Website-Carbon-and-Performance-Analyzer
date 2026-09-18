import got from 'got';
import { promises as dnsPromises } from 'dns';
import CacheableLookup from 'cacheable-lookup';
import dns from 'dns';
import tls from 'tls';
import { createModuleLogger } from '../utils/logger.js';
import type { DNSAnalysis, WHOISInfo, CertificateInfo } from '../types/index.js';

const logger = createModuleLogger('http-analyzer');

// ── Custom DNS resolver ────────────────────────────────────────────────────────
// On Windows (and restricted containers), Node's default dns.lookup() goes through
// the OS resolver which may not have external DNS access.
// CacheableLookup with an explicit Resolver bypasses the OS and queries 8.8.8.8 directly.
const dnsResolver = new dnsPromises.Resolver();
dnsResolver.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1']);

// Also patch the global resolver used by analyzeDns() / lookupWhois()
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1']);

const dnsCache = new CacheableLookup({ resolver: dnsResolver });
// ─────────────────────────────────────────────────────────────────────────────

export interface HttpAnalysisResult {
  finalUrl: string;
  redirectChain: Array<{ url: string; status: number }>;
  responseHeaders: Record<string, string>;
  responseCode: number;
  serverIp?: string;
  htmlContent: string;
  responseTime: number;
  fetchError?: string;
  /** Distinguishes TLS/socket disconnects (soft — Playwright can still succeed)
   *  from hard network errors (ENOTFOUND, ECONNREFUSED, ETIMEDOUT). */
  fetchErrorType?: 'tls-socket' | 'network';
}

export interface WellKnownResults {
  securityTxt?: { found: boolean; content?: string };
  adsTxt?: { found: boolean; entries?: number };
  humansTxt?: { found: boolean };
  robotsTxt?: { found: boolean; content?: string };
  sitemapXml?: { found: boolean; urlCount?: number; sitemapType?: string };
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

const BASE_HEADERS = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'max-age=0',
  'DNT': '1',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
};

// Errors that indicate the TLS/socket layer dropped before the handshake completed.
// These are typically caused by bot-detection middleware (Cloudflare, Akamai, etc.)
// terminating the connection early. Playwright handles TLS natively and succeeds
// where got (Node TLS) fails, so we treat these as "soft" errors.
const TLS_SOCKET_ERRORS = [
  'socket disconnected before secure TLS connection',
  'Client network socket disconnected before secure TLS connection',
  'write ECONNRESET',
  'read ECONNRESET',
  'socket hang up',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ECONNABORTED',
  'TLS connection timeout',
  'self-signed certificate',
  'unable to verify',
];

function isTlsOrSocketError(msg: string): boolean {
  return TLS_SOCKET_ERRORS.some(pat => msg.includes(pat));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function analyzeHttp(url: string): Promise<HttpAnalysisResult> {
  const startTime = Date.now();
  const redirectChain: Array<{ url: string; status: number }> = [];

  const attemptFetch = async (userAgent: string, tlsPermissive: boolean): Promise<HttpAnalysisResult> => {
    const response = await got(url, {
      // ← Key fix: use custom DNS resolver, bypasses OS/Windows DNS
      dnsCache,
      followRedirect: true,
      maxRedirects: 10,
      // Increased timeout for slow TLS handshakes (e.g. behind Cloudflare)
      timeout: { request: 45000, connect: 15000, secureConnect: 20000 },
      throwHttpErrors: false,
      headers: { 'User-Agent': userAgent, ...BASE_HEADERS },
      // On TLS errors, retry with permissive settings to at least get headers/HTML
      https: tlsPermissive
        ? { rejectUnauthorized: false, minVersion: 'TLSv1' as const }
        : undefined,
      hooks: {
        beforeRedirect: [
          (_options, response) => {
            redirectChain.push({
              url: response.url ?? url,
              status: response.statusCode ?? 0,
            });
          },
        ],
      },
    });

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(response.headers)) {
      if (value) {
        headers[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
      }
    }

    return {
      finalUrl: response.url,
      redirectChain,
      responseHeaders: headers,
      responseCode: response.statusCode,
      htmlContent: response.body,
      responseTime: Date.now() - startTime,
    };
  };

  // Build attempt schedule: [ua, tlsPermissive, delayBefore]
  const attempts: Array<{ ua: string; tlsPermissive: boolean; delay: number }> = [
    { ua: getRandomUserAgent(), tlsPermissive: false, delay: 0 },
    { ua: USER_AGENTS[0],       tlsPermissive: false, delay: 1500 },  // brief pause before retry
    { ua: USER_AGENTS[2],       tlsPermissive: true,  delay: 2000 },  // permissive TLS as last resort
  ];

  let lastError: unknown;
  let lastIsTlsError = false;

  for (const { ua, tlsPermissive, delay } of attempts) {
    if (delay > 0) await sleep(delay);

    try {
      const result = await attemptFetch(ua, tlsPermissive);

      // 403/429: bot-blocked — continue to next attempt (Playwright will handle it)
      if ((result.responseCode === 403 || result.responseCode === 429) && ua !== attempts[attempts.length - 1].ua) {
        logger.warn({ url, status: result.responseCode }, 'Bot-blocked, retrying with different UA');
        lastError = new Error(`HTTP ${result.responseCode}`);
        lastIsTlsError = false;
        continue;
      }

      // Success (including 403 on last attempt — Playwright will handle rendering)
      return result;
    } catch (error: unknown) {
      lastError = error;
      const errMsg = error instanceof Error ? error.message : String(error);
      lastIsTlsError = isTlsOrSocketError(errMsg);
      logger.warn(
        { url, ua, tlsPermissive, error: errMsg },
        'HTTP fetch attempt failed, retrying...'
      );
    }
  }

  // All attempts failed — return structured error result (don't throw).
  // Mark TLS/socket errors distinctly so the orchestrator can decide whether
  // to allow Playwright to continue or surface a fatal error.
  const errMsg = lastError instanceof Error ? lastError.message : String(lastError);
  logger.error({ url, error: errMsg, isTlsError: lastIsTlsError }, 'All HTTP fetch attempts failed');

  const isHardNetworkError =
    errMsg.includes('ENOTFOUND') ||
    errMsg.includes('ECONNREFUSED') ||
    errMsg.includes('ETIMEDOUT') ||
    errMsg.includes('EHOSTUNREACH');

  return {
    finalUrl: url,
    redirectChain,
    responseHeaders: {},
    responseCode: 0,
    htmlContent: '',
    responseTime: Date.now() - startTime,
    fetchError: errMsg,
    // Discriminator for orchestrator: TLS/socket = soft (Playwright can recover),
    // network = hard (DNS/connection failure, abort), undefined = unknown.
    fetchErrorType: lastIsTlsError ? 'tls-socket' : isHardNetworkError ? 'network' : undefined,
  };
}

export async function analyzeDns(hostname: string): Promise<DNSAnalysis> {
  logger.debug({ hostname }, 'Starting DNS analysis');

  // Use the same custom resolver for all DNS lookups
  const resolver = dnsResolver;
  const result: DNSAnalysis = {
    a: [],
    aaaa: [],
    mx: [],
    ns: [],
    txt: [],
    resolvedAt: new Date().toISOString(),
  };

  await Promise.allSettled([
    resolver.resolve4(hostname).then(addrs => { result.a = addrs; }).catch(() => {}),
    resolver.resolve6(hostname).then(addrs => { result.aaaa = addrs; }).catch(() => {}),
    resolver.resolveMx(hostname).then(mx => {
      result.mx = mx.sort((a, b) => a.priority - b.priority);
    }).catch(() => {}),
    resolver.resolveNs(hostname).then(ns => { result.ns = ns; }).catch(() => {}),
    resolver.resolveTxt(hostname).then(txt => {
      result.txt = txt.map(t => t.join(''));
    }).catch(() => {}),
    resolver.resolveCname(hostname).then(cname => {
      result.cname = cname[0];
    }).catch(() => {}),
    resolver.resolveSoa(hostname).then(soa => {
      result.soa = {
        primary: soa.nsname,
        admin: soa.hostmaster,
        serial: soa.serial,
        refresh: soa.refresh,
        retry: soa.retry,
        expire: soa.expire,
        minttl: soa.minttl,
      };
    }).catch(() => {}),
    resolver.resolveCaa(hostname).then(caa => {
      result.caa = caa as DNSAnalysis['caa'];
    }).catch(() => {}),
  ]);

  result.dnsProvider = detectDnsProvider(result.ns);
  result.emailProvider = detectEmailProvider(result.mx, result.txt);

  return result;
}

function detectDnsProvider(nameservers: string[]): string | undefined {
  const ns = nameservers.join(' ').toLowerCase();
  if (ns.includes('cloudflare')) return 'Cloudflare DNS';
  if (ns.includes('awsdns')) return 'Amazon Route 53';
  if (ns.includes('azure-dns')) return 'Azure DNS';
  if (ns.includes('googledomains') || ns.includes('google.com')) return 'Google Cloud DNS';
  if (ns.includes('nsone') || ns.includes('ns1.com')) return 'NS1';
  if (ns.includes('dnsimple')) return 'DNSimple';
  if (ns.includes('godaddy') || ns.includes('domaincontrol')) return 'GoDaddy DNS';
  if (ns.includes('namecheap') || ns.includes('registrar-servers')) return 'Namecheap DNS';
  if (ns.includes('fastly')) return 'Fastly DNS';
  return undefined;
}

function detectEmailProvider(mx: Array<{ exchange: string }>, txt: string[]): string | undefined {
  const mxString = mx.map(m => m.exchange).join(' ').toLowerCase();
  const txtString = txt.join(' ').toLowerCase();
  if (mxString.includes('google') || mxString.includes('googlemail') || txtString.includes('google.com/mail')) return 'Google Workspace';
  if (mxString.includes('outlook') || mxString.includes('microsoft') || txtString.includes('outlook.com')) return 'Microsoft 365';
  if (mxString.includes('amazonses') || mxString.includes('amazon')) return 'Amazon SES';
  if (mxString.includes('sendgrid')) return 'SendGrid';
  if (mxString.includes('mailgun')) return 'Mailgun';
  if (mxString.includes('zoho')) return 'Zoho Mail';
  if (mxString.includes('protonmail')) return 'ProtonMail';
  if (mxString.includes('fastmail')) return 'FastMail';
  return undefined;
}

export async function analyzeTls(hostname: string): Promise<{
  version: string;
  certificate?: CertificateInfo;
}> {
  return new Promise((resolve) => {
    const socket = tls.connect(443, hostname, {
      servername: hostname,
      timeout: 10000,
      rejectUnauthorized: false,
    }, () => {
      try {
        const cert = socket.getPeerCertificate(true);
        const protocol = socket.getProtocol() ?? 'unknown';
        socket.destroy();

        if (!cert || !cert.subject) {
          resolve({ version: protocol });
          return;
        }

        const validTo = new Date(cert.valid_to);
        const now = new Date();
        const daysUntilExpiry = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        const sans: string[] = [];
        if (cert.subjectaltname) {
          const sanMatches = cert.subjectaltname.match(/DNS:[^,]+/g) ?? [];
          sans.push(...sanMatches.map(s => s.replace('DNS:', '')));
        }

        const certInfo: CertificateInfo = {
          subject: (Array.isArray(cert.subject.CN) ? cert.subject.CN[0] : cert.subject.CN)
            ?? (Array.isArray(cert.subject.O) ? cert.subject.O[0] : cert.subject.O)
            ?? 'Unknown',
          issuer: (Array.isArray(cert.issuer.O) ? cert.issuer.O[0] : cert.issuer.O)
            ?? (Array.isArray(cert.issuer.CN) ? cert.issuer.CN[0] : cert.issuer.CN)
            ?? 'Unknown',
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          daysUntilExpiry,
          algorithm: ((cert as unknown as Record<string, unknown>).sigalg as string ?? 'Unknown'),
          fingerprint: cert.fingerprint ?? '',
          sans,
          isWildcard: sans.some(s => s.startsWith('*.')),
          isEV: !!(cert.subject.businessCategory || cert.subject.jurisdictionCountry),
        };

        resolve({ version: protocol, certificate: certInfo });
      } catch {
        socket.destroy();
        resolve({ version: 'unknown' });
      }
    });

    socket.on('error', () => resolve({ version: 'unknown' }));
    socket.setTimeout(10000, () => { socket.destroy(); resolve({ version: 'unknown' }); });
  });
}

export async function analyzeWellKnown(baseUrl: string): Promise<WellKnownResults> {
  const results: WellKnownResults = {};
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  const fetchWellKnown = async (url: string): Promise<string | null> => {
    try {
      const res = await got(url, {
        dnsCache,
        timeout: { request: 8000 },
        throwHttpErrors: false,
        headers: { 'User-Agent': 'CarbonAnalyzer/1.0 (compatible; bot)' },
      });
      return res.statusCode === 200 ? res.body : null;
    } catch {
      return null;
    }
  };

  await Promise.allSettled([
    fetchWellKnown(`${base}/.well-known/security.txt`).then(async r => {
      if (r) { results.securityTxt = { found: true, content: r.slice(0, 2000) }; return; }
      const r2 = await fetchWellKnown(`${base}/security.txt`);
      results.securityTxt = { found: !!r2, content: r2?.slice(0, 2000) };
    }).catch(() => { results.securityTxt = { found: false }; }),

    fetchWellKnown(`${base}/ads.txt`).then(r => {
      if (r) {
        const lines = r.split('\n').filter(l => l.trim() && !l.startsWith('#'));
        results.adsTxt = { found: true, entries: lines.length };
      } else {
        results.adsTxt = { found: false };
      }
    }).catch(() => { results.adsTxt = { found: false }; }),

    fetchWellKnown(`${base}/humans.txt`).then(r => {
      results.humansTxt = { found: !!r };
    }).catch(() => { results.humansTxt = { found: false }; }),

    fetchWellKnown(`${base}/robots.txt`).then(r => {
      results.robotsTxt = { found: !!r, content: r?.slice(0, 5000) };
    }).catch(() => { results.robotsTxt = { found: false }; }),

    fetchWellKnown(`${base}/sitemap.xml`).then(async r => {
      if (r) {
        const urlCount = (r.match(/<url>/g) ?? []).length + (r.match(/<sitemap>/g) ?? []).length;
        const sitemapType = r.includes('<sitemapindex') ? 'sitemapindex' : r.includes('<urlset') ? 'urlset' : 'unknown';
        results.sitemapXml = { found: true, urlCount, sitemapType };
      } else {
        const r2 = await fetchWellKnown(`${base}/sitemap_index.xml`);
        results.sitemapXml = { found: !!r2, urlCount: r2 ? (r2.match(/<sitemap>/g) ?? []).length : 0, sitemapType: 'sitemapindex' };
      }
    }).catch(() => { results.sitemapXml = { found: false }; }),
  ]);

  return results;
}

// ---------------------------------------------------------------------------
// Domain Registration Lookup — RDAP first, WhoisJSON API as fallback.
//
// RDAP (RFC 7483): modern JSON-based protocol, no TCP/DNS issues, structured
// data with full contact/event/entity objects.
// WhoisJSON API (whoisjson.com): free HTTP API (1,000 req/mo), covers domains that have
// no RDAP bootstrap entry or whose RDAP server is unreachable.
// ---------------------------------------------------------------------------

/** IANA RDAP bootstrap — maps TLD to RDAP base URL.
 *  We embed a curated subset; missing TLDs fall through to the API fallback. */
const RDAP_BOOTSTRAP: Record<string, string> = {
  com:  'https://rdap.verisign.com/com/v1',
  net:  'https://rdap.verisign.com/net/v1',
  org:  'https://rdap.publicinterestregistry.org/rdap',
  io:   'https://rdap.nic.io',
  ai:   'https://rdap.nic.ai',
  co:   'https://rdap.nic.co',
  dev:  'https://rdap.nic.google',
  app:  'https://rdap.nic.google',
  page: 'https://rdap.nic.google',
  me:   'https://rdap.nic.me',
  info: 'https://rdap.afilias.net/rdap',
  biz:  'https://rdap.nic.biz',
  uk:   'https://rdap.nominet.uk',
  de:   'https://rdap.denic.de',
  fr:   'https://rdap.nic.fr',
  nl:   'https://rdap.sidn.nl',
  eu:   'https://rdap.eu',
  ca:   'https://rdap.ca.fury.ca',
  au:   'https://rdap.auda.org.au',
  jp:   'https://rdap.jprs.jp',
  br:   'https://rdap.registro.br',
  in:   'https://rdap.registry.in',
  vn:   'https://rdap.vnnic.vn',
  us:   'https://rdap.nic.us',
  id:   'https://rdap.pandi.or.id',
  sg:   'https://rdap.sgnic.sg',
  nz:   'https://rdap.srs.net.nz',
  se:   'https://rdap.iis.se',
  no:   'https://rdap.norid.no',
  fi:   'https://rdap.ficora.fi',
  dk:   'https://rdap.dk-hostmaster.dk',
  pl:   'https://rdap.dns.pl',
  ch:   'https://rdap.nic.ch',
  at:   'https://rdap.nic.at',
  be:   'https://rdap.dns.be',
  es:   'https://rdap.nic.es',
  it:   'https://rdap.nic.it',
  pt:   'https://rdap.dns.pt',
  ru:   'https://rdap.tcinet.ru',
  cn:   'https://rdap.cnnic.cn',
  xyz:  'https://rdap.nic.xyz',
  club: 'https://rdap.nic.club',
  shop: 'https://rdap.nic.shop',
  online:'https://rdap.nic.online',
  site: 'https://rdap.nic.site',
  tech: 'https://rdap.nic.tech',
  store:'https://rdap.nic.store',
};

interface RdapEntity {
  roles: string[];
  vcardArray?: unknown[];
  entities?: RdapEntity[];
  publicIds?: Array<{ type: string; identifier: string }>;
  links?: Array<{ rel: string; href: string; type?: string }>;
  handle?: string;
}

interface RdapEvent {
  eventAction: string;
  eventDate: string;
}

interface RdapResponse {
  ldhName?: string;
  unicodeName?: string;
  handle?: string;
  status?: string[];
  nameservers?: Array<{ ldhName: string }>;
  entities?: RdapEntity[];
  events?: RdapEvent[];
  links?: Array<{ rel: string; href: string }>;
  notices?: Array<{ title: string; description: string[] }>;
  remarks?: Array<{ title: string; description: string[] }>;
  secureDNS?: {
    delegationSigned: boolean;
    dsData?: Array<{ keyTag: number; algorithm: number; digestType: number; digest: string }>;
    keyData?: Array<{ flags: number; protocol: number; algorithm: number; publicKey: string }>;
  };
  port43?: string;
  objectClassName?: string;
  ipAddresses?: { v4?: string[]; v6?: string[] };
}

/** Extract a vCard field value from the RDAP vCard array format. */
function extractVcard(vcardArray: unknown[], field: string): string | undefined {
  if (!Array.isArray(vcardArray) || vcardArray.length < 2) return undefined;
  const props = vcardArray[1];
  if (!Array.isArray(props)) return undefined;
  for (const prop of props) {
    if (Array.isArray(prop) && prop[0] === field) {
      const val = prop[3];
      if (typeof val === 'string') return val.trim() || undefined;
      if (Array.isArray(val)) return val.filter(Boolean).join(', ').trim() || undefined;
    }
  }
  return undefined;
}

/** Find an entity by role and extract its name + contact info. */
function extractEntityInfo(entities: RdapEntity[], role: string): {
  name?: string; email?: string; url?: string; phone?: string; org?: string; ianaid?: string;
} {
  const entity = entities.find(e => e.roles?.includes(role));
  if (!entity) return {};

  const vc = entity.vcardArray;
  const vcard = Array.isArray(vc) && vc.length >= 2 ? vc : null;

  const name   = vcard ? extractVcard(vc as unknown[], 'fn') : undefined;
  const org    = vcard ? extractVcard(vc as unknown[], 'org') : undefined;
  const email  = vcard ? extractVcard(vc as unknown[], 'email') : undefined;
  const phone  = vcard ? extractVcard(vc as unknown[], 'tel') : undefined;
  const url    = entity.links?.find(l => l.rel === 'self')?.href
              ?? entity.links?.find(l => l.rel === 'related')?.href;
  const ianaid = entity.publicIds?.find(p => p.type === 'IANA Registrar ID')?.identifier;

  return { name, email, url, phone, org, ianaid };
}

async function queryRdap(domain: string, baseUrl: string): Promise<WHOISInfo | null> {
  const url = `${baseUrl.replace(/\/$/, '')}/domain/${encodeURIComponent(domain)}`;

  let res: { body: string; statusCode: number };
  try {
    res = await got(url, {
      dnsCache,
      headers: { Accept: 'application/rdap+json, application/json' },
      timeout: { request: 10000 },
      throwHttpErrors: false,
      followRedirect: true,
    });
  } catch (err) {
    throw new Error(`RDAP HTTP error: ${(err as Error).message}`);
  }

  if (res.statusCode === 404) return null;              // Domain not found
  if (res.statusCode === 429) throw new Error('RDAP rate limited');
  if (res.statusCode >= 400) throw new Error(`RDAP ${res.statusCode}`);

  let rdap: RdapResponse;
  try { rdap = JSON.parse(res.body) as RdapResponse; }
  catch { throw new Error('RDAP invalid JSON'); }

  // ── Events ──
  const events: RdapEvent[] = rdap.events ?? [];
  const getEvent = (action: string) =>
    events.find(e => e.eventAction === action)?.eventDate;

  const createdAt  = getEvent('registration');
  const updatedAt  = getEvent('last changed') ?? getEvent('last update of RDAP database');
  const expiresAt  = getEvent('expiration');

  let daysUntilExpiry: number | undefined;
  if (expiresAt) {
    const d = new Date(expiresAt);
    if (!isNaN(d.getTime()))
      daysUntilExpiry = Math.floor((d.getTime() - Date.now()) / 86_400_000);
  }

  // ── Status codes ──
  const statusCodes = rdap.status ?? [];
  const isRegistryLocked = statusCodes.some(s =>
    s.includes('server delete prohibited') ||
    s.includes('server transfer prohibited')
  );

  // ── Nameservers ──
  const nameservers = (rdap.nameservers ?? []).map(ns => ns.ldhName.toLowerCase());

  // ── Entities ──
  const entities: RdapEntity[] = rdap.entities ?? [];
  const registrarInfo = extractEntityInfo(entities, 'registrar');

  // Dig into nested entities for registrant/tech/admin contacts
  const allEntities: RdapEntity[] = [
    ...entities,
    ...entities.flatMap(e => e.entities ?? []),
  ];
  const registrantInfo = extractEntityInfo(allEntities, 'registrant');
  const technicalInfo  = extractEntityInfo(allEntities, 'technical');
  const abuseInfo      = extractEntityInfo(allEntities, 'abuse');

  // ── DNSSEC ──
  const dnssec = rdap.secureDNS;
  const dnssecSigned     = dnssec?.delegationSigned ?? false;
  const dnssecDsRecords  = dnssec?.dsData?.map(ds =>
    `${ds.keyTag} ${ds.algorithm} ${ds.digestType} ${ds.digest}`
  ) ?? [];

  // ── Remarks / Notices ──
  const remarks = (rdap.remarks ?? []).map(r => `${r.title}: ${r.description.join(' ')}`);

  // ── RDAP self link (canonical URL for this registration) ──
  const rdapUrl = rdap.links?.find(l => l.rel === 'self')?.href;

  return {
    // Core
    registrar:    registrarInfo.name ?? registrarInfo.org,
    registrarUrl: registrarInfo.url,
    registrarIanaId: registrarInfo.ianaid,
    registrarAbuseEmail: abuseInfo.email,
    registrarAbusePhone: abuseInfo.phone,
    // Dates
    createdAt, updatedAt, expiresAt, daysUntilExpiry,
    // Domain
    domainHandle: rdap.handle,
    nameservers,
    statusCodes,
    isRegistryLocked,
    // Registrant (often redacted for privacy)
    registrantName:  registrantInfo.name ?? registrantInfo.org,
    registrantEmail: registrantInfo.email,
    registrantPhone: registrantInfo.phone,
    // Technical contact
    techName:  technicalInfo.name ?? technicalInfo.org,
    techEmail: technicalInfo.email,
    // DNSSEC
    dnssecSigned, dnssecDsRecords,
    // Meta
    rdapUrl,
    remarks,
    // Source tag
    source: 'rdap' as const,
  };
}

// ---------------------------------------------------------------------------
// WhoisJSON API fallback — https://whoisjson.com/api/v1/whois
// Auth: Authorization: TOKEN=<key>  (env: WHOISJSON_API_KEY)
// Response schema (from docs):
//   name, registered, registrar{name,url}, created, expires, changed,
//   status[], nameserver[], dnssec, contacts{owner,admin,tech}[],
//   whoisserver, ips
// ---------------------------------------------------------------------------
async function queryWhoisJsonApi(domain: string): Promise<WHOISInfo | null> {
  const apiKey = process.env.WHOISJSON_API_KEY;
  if (!apiKey) {
    logger.debug({ domain }, 'WHOISJSON_API_KEY not set — skipping WhoisJSON fallback');
    return null;
  }

  try {
    const res = await got('https://whoisjson.com/api/v1/whois', {
      dnsCache,
      searchParams: { domain },
      headers: {
        Authorization: `TOKEN=${apiKey}`,
        Accept: 'application/json',
      },
      timeout: { request: 10000 },
      throwHttpErrors: false,
    });

    if (res.statusCode === 401) { logger.warn({ domain }, 'WhoisJSON API: invalid token'); return null; }
    if (res.statusCode === 404) return null;
    if (res.statusCode === 429) { logger.warn({ domain }, 'WhoisJSON API: rate limited'); return null; }
    if (res.statusCode >= 400) { logger.warn({ domain, status: res.statusCode }, 'WhoisJSON API: error'); return null; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = JSON.parse(res.body) as any;

    if (!d.registered) return null;  // Domain doesn't exist

    // Dates — API returns ISO-8601 strings: "created", "expires", "changed"
    const createdAt  = d.created  ?? undefined;
    const expiresAt  = d.expires  ?? undefined;
    const updatedAt  = d.changed  ?? undefined;

    let daysUntilExpiry: number | undefined;
    if (expiresAt) {
      const exp = new Date(expiresAt);
      if (!isNaN(exp.getTime()))
        daysUntilExpiry = Math.floor((exp.getTime() - Date.now()) / 86_400_000);
    }

    // Status — array of EPP strings e.g. "clientTransferProhibited"
    const statusCodes: string[] = Array.isArray(d.status) ? d.status
      : typeof d.status === 'string' ? [d.status] : [];

    const isRegistryLocked = statusCodes.some(s => {
      const lower = s.toLowerCase();
      return lower.includes('serverdeleteprohibited') || lower.includes('servertransferprohibited');
    });

    // Nameservers — array of strings
    const nameservers: string[] = Array.isArray(d.nameserver)
      ? d.nameserver.map((ns: string) => ns.toLowerCase())
      : [];

    // Registrar
    const registrar    = d.registrar?.name;
    const registrarUrl = d.registrar?.url;

    // Contacts — contacts.owner[], contacts.admin[], contacts.tech[]
    const owner = Array.isArray(d.contacts?.owner) ? d.contacts.owner[0] : null;
    const tech  = Array.isArray(d.contacts?.tech)  ? d.contacts.tech[0]  : null;

    // DNSSEC — string like "signedDelegation" or "unsigned"
    const dnssecSigned = typeof d.dnssec === 'string'
      ? d.dnssec.toLowerCase().includes('signed') && !d.dnssec.toLowerCase().includes('unsigned')
      : Boolean(d.dnssec);

    return {
      registrar,
      registrarUrl,
      createdAt,
      updatedAt,
      expiresAt,
      daysUntilExpiry,
      nameservers,
      statusCodes,
      isRegistryLocked,
      // Contacts (often redacted for gTLDs)
      registrantName:  owner?.organization ?? owner?.name ?? undefined,
      registrantEmail: owner?.email ?? undefined,
      registrantPhone: owner?.phone ?? undefined,
      techName:  tech?.organization ?? tech?.name ?? undefined,
      techEmail: tech?.email ?? undefined,
      // DNSSEC
      dnssecSigned,
      dnssecDsRecords: [],
      source: 'whoisjson' as const,
    };
  } catch (err) {
    logger.warn({ domain, err: (err as Error).message }, 'WhoisJSON API error');
    return null;
  }
}

export async function lookupWhois(domain: string): Promise<WHOISInfo> {
  const empty: WHOISInfo = { nameservers: [], statusCodes: [], isRegistryLocked: false };

  // ── 1. Try RDAP ──
  const tld = domain.split('.').slice(-1)[0].toLowerCase();
  const rdapBase = RDAP_BOOTSTRAP[tld];

  if (rdapBase) {
    try {
      const result = await queryRdap(domain, rdapBase);
      if (result) {
        logger.debug({ domain, source: 'rdap' }, 'WHOIS via RDAP');
        return result;
      }
    } catch (err) {
      logger.debug({ domain, err: (err as Error).message }, 'RDAP failed, falling back to WhoisJSON API');
    }
  } else {
    logger.debug({ domain, tld }, 'No RDAP bootstrap for TLD — trying WhoisJSON API');
  }

  // ── 2. Fallback: WhoisJSON API ──
  try {
    const result = await queryWhoisJsonApi(domain);
    if (result) {
      logger.debug({ domain, source: 'whoisjson' }, 'WHOIS via WhoisJSON API');
      return result;
    }
  } catch (err) {
    logger.warn({ domain, err: (err as Error).message }, 'WhoisJSON API fallback failed');
  }

  logger.warn({ domain }, 'All WHOIS/RDAP sources failed — returning empty');
  return empty;
}

export async function resolveIpInfo(ip: string): Promise<{
  asn?: string; org?: string; country?: string;
  countryCode?: string; region?: string; city?: string;
}> {
  try {
    const res = await got(`http://ip-api.com/json/${ip}?fields=status,countryCode,country,regionName,city,isp,org,as`, {
      dnsCache,
      timeout: { request: 5000 },
      throwHttpErrors: false,
    });
    const data = JSON.parse(res.body) as {
      status: string; countryCode?: string; country?: string;
      regionName?: string; city?: string; isp?: string; org?: string; as?: string;
    };
    if (data.status === 'success') {
      return { asn: data.as, org: data.org ?? data.isp, country: data.country, countryCode: data.countryCode, region: data.regionName, city: data.city };
    }
    return {};
  } catch {
    return {};
  }
}
