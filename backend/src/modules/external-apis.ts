import _gotBase from 'got';
import { promises as dnsPromises } from 'dns';
import CacheableLookup from 'cacheable-lookup';
import { createModuleLogger } from '../utils/logger.js';

// Shared DNS resolver — bypasses Windows OS DNS, uses Google/Cloudflare directly
const _dnsResolver = new dnsPromises.Resolver();
_dnsResolver.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1']);
const _dnsCache = new CacheableLookup({ resolver: _dnsResolver });

// Pre-configured got instance with custom DNS for all outbound requests
const got = _gotBase.extend({ dnsCache: _dnsCache });

const logger = createModuleLogger('external-apis');

// ============================================================
// Chrome UX Report (CrUX) API
// ============================================================
export interface CrUXResult {
  origin: string;
  hasData: boolean;
  metrics: {
    lcp?: CrUXMetric;
    inp?: CrUXMetric;
    cls?: CrUXMetric;
    fcp?: CrUXMetric;
    ttfb?: CrUXMetric;
  };
  collectionPeriod?: { firstDate: string; lastDate: string };
}

interface CrUXMetric {
  histogram: Array<{ start: number; end?: number; density: number }>;
  percentiles: { p75: number };
  rating: 'good' | 'needs-improvement' | 'poor';
}

export async function fetchCrUXData(origin: string): Promise<CrUXResult> {
  const apiKey = process.env.CRUX_API_KEY;
  if (!apiKey) return { origin, hasData: false, metrics: {} };

  try {
    const res = await got.post(
      `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${apiKey}`,
      {
        json: {
          origin,
          metrics: [
            'largest_contentful_paint',
            'interaction_to_next_paint',
            'cumulative_layout_shift',
            'first_contentful_paint',
            'experimental_time_to_first_byte',
          ],
        },
        timeout: { request: 10000 },
        throwHttpErrors: false,
      }
    );

    if (res.statusCode !== 200) return { origin, hasData: false, metrics: {} };

    const data = JSON.parse(res.body) as {
      record?: {
        metrics?: Record<string, {
          histogram: Array<{ start: number; end?: number; density: number }>;
          percentiles: { p75: number };
        }>;
        collectionPeriod?: { firstDate: { year: number; month: number; day: number }; lastDate: { year: number; month: number; day: number } };
      };
    };

    if (!data.record?.metrics) return { origin, hasData: false, metrics: {} };

    const m = data.record.metrics;
    const rateMetric = (
      key: string,
      goodThreshold: number,
      poorThreshold: number
    ): CrUXMetric | undefined => {
      const metric = m[key];
      if (!metric) return undefined;
      const p75 = metric.percentiles.p75;
      return {
        histogram: metric.histogram,
        percentiles: { p75 },
        rating: p75 <= goodThreshold ? 'good' : p75 <= poorThreshold ? 'needs-improvement' : 'poor',
      };
    };

    const cp = data.record.collectionPeriod;
    return {
      origin,
      hasData: true,
      metrics: {
        lcp: rateMetric('largest_contentful_paint', 2500, 4000),
        inp: rateMetric('interaction_to_next_paint', 200, 500),
        cls: rateMetric('cumulative_layout_shift', 0.1, 0.25),
        fcp: rateMetric('first_contentful_paint', 1800, 3000),
        ttfb: rateMetric('experimental_time_to_first_byte', 800, 1800),
      },
      collectionPeriod: cp ? {
        firstDate: `${cp.firstDate.year}-${String(cp.firstDate.month).padStart(2,'0')}-${String(cp.firstDate.day).padStart(2,'0')}`,
        lastDate: `${cp.lastDate.year}-${String(cp.lastDate.month).padStart(2,'0')}-${String(cp.lastDate.day).padStart(2,'0')}`,
      } : undefined,
    };
  } catch (err) {
    logger.warn({ err }, 'CrUX API failed');
    return { origin, hasData: false, metrics: {} };
  }
}

// ============================================================
// Qualys SSL Labs API
// ============================================================
export interface SSLLabsResult {
  grade?: string;
  gradeTrustIgnored?: string;
  hasWarnings: boolean;
  isExceptional: boolean;
  protocols: Array<{ name: string; version: string; enabled: boolean }>;
  vulnerabilities: {
    beast: boolean;
    crime: boolean;
    poodle: boolean;
    robot: 'not-vulnerable' | 'vulnerable' | 'unknown';
    heartbleed: boolean;
    logjam: boolean;
    drown: boolean;
    ticketbleed: boolean;
    bleichenbacher: 'not-vulnerable' | 'vulnerable' | 'unknown';
  };
  forwardSecrecy: boolean;
  supportsHsts: boolean;
  certChain: Array<{ subject: string; issuer: string; notAfter: number }>;
  cipherSuites: Array<{ name: string; strength: string; forward: boolean }>;
  error?: string;
}

export async function fetchSSLLabsGrade(hostname: string): Promise<SSLLabsResult> {
  try {
    // Trigger analysis
    await got(
      `https://api.ssllabs.com/api/v3/analyze?host=${hostname}&publish=off&startNew=on&all=done&ignoreMismatch=on`,
      { timeout: { request: 10000 }, throwHttpErrors: false }
    );

    // Poll until done (max 90s)
    for (let i = 0; i < 18; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const res = await got(
        `https://api.ssllabs.com/api/v3/analyze?host=${hostname}&all=done`,
        { timeout: { request: 15000 }, throwHttpErrors: false }
      );

      if (res.statusCode !== 200) continue;

      const data = JSON.parse(res.body) as {
        status: string;
        endpoints?: Array<{
          grade?: string;
          gradeTrustIgnored?: string;
          hasWarnings?: boolean;
          isExceptional?: boolean;
          details?: {
            protocols?: Array<{ name: string; version: string; q: number }>;
            vulnBeast?: boolean;
            poodle?: boolean;
            freak?: boolean;
            heartbleed?: boolean;
            logjam?: boolean;
            drown?: boolean;
            ticketbleed?: number;
            bleichenbacher?: number;
            robotAttack?: number;
            forwardSecrecy?: number;
            supportsAead?: boolean;
            hstsPolicy?: { status: string };
            certChains?: Array<{
              certs?: Array<{ subject?: string; issuerSubject?: string; notAfter?: number }>;
            }>;
            suites?: Array<{
              list?: Array<{ name: string; cipherStrength: number; q: number; fsSec?: number }>;
            }>;
          };
        }>;
      };

      if (data.status === 'READY' && data.endpoints?.length) {
        const ep = data.endpoints[0];
        const details = ep.details;

        const protocols = (details?.protocols ?? []).map(p => ({
          name: p.name,
          version: p.version,
          enabled: p.q !== -1,
        }));

        const vulns = {
          beast: details?.vulnBeast ?? false,
          crime: false, // covered by freak/RC4
          poodle: details?.poodle ?? false,
          robot: (['not-vulnerable', 'not-vulnerable', 'vulnerable', 'unknown', 'vulnerable'][details?.robotAttack ?? 0] ?? 'unknown') as 'not-vulnerable' | 'vulnerable' | 'unknown',
          heartbleed: details?.heartbleed ?? false,
          logjam: details?.logjam ?? false,
          drown: details?.drown ?? false,
          ticketbleed: (details?.ticketbleed ?? 0) > 0,
          bleichenbacher: (details?.bleichenbacher ?? 0) > 0 ? 'vulnerable' : 'not-vulnerable' as 'not-vulnerable' | 'vulnerable' | 'unknown',
        };

        const certChain = (details?.certChains?.[0]?.certs ?? []).map(c => ({
          subject: c.subject ?? '',
          issuer: c.issuerSubject ?? '',
          notAfter: c.notAfter ?? 0,
        }));

        const cipherSuites = (details?.suites?.[0]?.list ?? []).slice(0, 20).map(s => ({
          name: s.name,
          strength: s.cipherStrength >= 256 ? 'strong' : s.cipherStrength >= 128 ? 'adequate' : 'weak',
          forward: (s.fsSec ?? 0) > 0,
        }));

        return {
          grade: ep.grade,
          gradeTrustIgnored: ep.gradeTrustIgnored,
          hasWarnings: ep.hasWarnings ?? false,
          isExceptional: ep.isExceptional ?? false,
          protocols,
          vulnerabilities: vulns,
          forwardSecrecy: (details?.forwardSecrecy ?? 0) > 0,
          supportsHsts: details?.hstsPolicy?.status === 'present',
          certChain,
          cipherSuites,
        };
      }

      if (data.status === 'ERROR') {
        return { hasWarnings: false, isExceptional: false, protocols: [], vulnerabilities: { beast: false, crime: false, poodle: false, robot: 'unknown', heartbleed: false, logjam: false, drown: false, ticketbleed: false, bleichenbacher: 'unknown' }, forwardSecrecy: false, supportsHsts: false, certChain: [], cipherSuites: [], error: 'SSL Labs error' };
      }
    }

    return { hasWarnings: false, isExceptional: false, protocols: [], vulnerabilities: { beast: false, crime: false, poodle: false, robot: 'unknown', heartbleed: false, logjam: false, drown: false, ticketbleed: false, bleichenbacher: 'unknown' }, forwardSecrecy: false, supportsHsts: false, certChain: [], cipherSuites: [], error: 'Timeout' };
  } catch (err) {
    logger.warn({ hostname, err }, 'SSL Labs API failed');
    return { hasWarnings: false, isExceptional: false, protocols: [], vulnerabilities: { beast: false, crime: false, poodle: false, robot: 'unknown', heartbleed: false, logjam: false, drown: false, ticketbleed: false, bleichenbacher: 'unknown' }, forwardSecrecy: false, supportsHsts: false, certChain: [], cipherSuites: [], error: String(err) };
  }
}

// ============================================================
// HSTS Preload Status
// ============================================================
export interface HSTSPreloadStatus {
  status: 'preloaded' | 'pending' | 'eligible' | 'unknown';
  includesSubDomains?: boolean;
  domain: string;
}

export async function checkHSTSPreload(domain: string): Promise<HSTSPreloadStatus> {
  try {
    const res = await got(`https://hstspreload.org/api/v2/status?domain=${domain}`, {
      timeout: { request: 8000 },
      throwHttpErrors: false,
    });
    if (res.statusCode === 200) {
      const data = JSON.parse(res.body) as {
        status?: string;
        includesSubDomains?: boolean;
      };
      return {
        domain,
        status: (['preloaded', 'pending', 'eligible'].includes(data.status ?? '') ? data.status : 'unknown') as HSTSPreloadStatus['status'],
        includesSubDomains: data.includesSubDomains,
      };
    }
    return { domain, status: 'unknown' };
  } catch {
    return { domain, status: 'unknown' };
  }
}

// ============================================================
// OSV (Open Source Vulnerabilities) API
// ============================================================
export interface OSVVulnerability {
  id: string;
  summary: string;
  severity?: string;
  publishedAt: string;
  modifiedAt: string;
  aliases: string[]; // CVE IDs
  affectedVersions: string[];
  references: string[];
  database_specific?: Record<string, unknown>;
}

export async function checkOSVVulnerabilities(
  packages: Array<{ name: string; version: string; ecosystem: 'npm' | 'PyPI' | 'Maven' | 'Go' | 'RubyGems' | 'NuGet' | 'crates.io' }>
): Promise<Map<string, OSVVulnerability[]>> {
  const results = new Map<string, OSVVulnerability[]>();

  await Promise.allSettled(
    packages.map(async pkg => {
      try {
        const res = await got.post('https://api.osv.dev/v1/query', {
          json: {
            package: { name: pkg.name, ecosystem: pkg.ecosystem },
            version: pkg.version,
          },
          timeout: { request: 8000 },
          throwHttpErrors: false,
        });

        if (res.statusCode === 200) {
          const data = JSON.parse(res.body) as {
            vulns?: Array<{
              id: string;
              summary?: string;
              severity?: Array<{ type: string; score: string }>;
              published?: string;
              modified?: string;
              aliases?: string[];
              affected?: Array<{
                versions?: string[];
                ranges?: Array<{ events?: Array<{ introduced?: string; fixed?: string }> }>;
              }>;
              references?: Array<{ url: string }>;
              database_specific?: Record<string, unknown>;
            }>;
          };

          if (data.vulns?.length) {
            const vulns: OSVVulnerability[] = data.vulns.map(v => ({
              id: v.id,
              summary: v.summary ?? 'No summary',
              severity: v.severity?.[0]?.score,
              publishedAt: v.published ?? '',
              modifiedAt: v.modified ?? '',
              aliases: v.aliases ?? [],
              affectedVersions: v.affected?.flatMap(a => a.versions ?? []) ?? [],
              references: v.references?.map(r => r.url) ?? [],
              database_specific: v.database_specific,
            }));
            results.set(`${pkg.name}@${pkg.version}`, vulns);
          }
        }
      } catch (err) {
        logger.warn({ pkg, err }, 'OSV query failed');
      }
    })
  );

  return results;
}

// ============================================================
// RDAP (Modern WHOIS replacement)
// ============================================================
export interface RDAPResult {
  domainName?: string;
  registrar?: string;
  registrarUrl?: string;
  registrationDate?: string;
  expirationDate?: string;
  updatedDate?: string;
  status?: string[];
  nameservers?: string[];
  secureDNS?: boolean;
  registrantCountry?: string;
  abuseEmail?: string;
  rdapConformance?: string[];
  source: string;
}

export async function fetchRDAPDomain(domain: string): Promise<RDAPResult> {
  const rdapBootstrap = [
    `https://rdap.org/domain/${domain}`, // Universal proxy
    `https://www.iana.org/cgi-bin/rdap-bootstrap?url=https://rdap.iana.org/domain/${domain}`,
  ];

  for (const url of rdapBootstrap) {
    try {
      const res = await got(url, {
        timeout: { request: 8000 },
        throwHttpErrors: false,
        followRedirect: true,
        maxRedirects: 5,
      });
      if (res.statusCode === 200) {
        const data = JSON.parse(res.body) as {
          ldhName?: string;
          rdapConformance?: string[];
          entities?: Array<{
            roles?: string[];
            vcardArray?: unknown[][];
            handle?: string;
          }>;
          events?: Array<{ eventAction: string; eventDate: string }>;
          status?: string[];
          nameservers?: Array<{ ldhName?: string }>;
          secureDNS?: { delegationSigned?: boolean };
          port43?: string;
        };

        const getEvent = (action: string) =>
          data.events?.find(e => e.eventAction === action)?.eventDate;

        const registrarEntity = data.entities?.find(e => e.roles?.includes('registrar'));
        const registrarVcard = registrarEntity?.vcardArray?.[1] as Array<[string, unknown, unknown, string]> | undefined;
        const registrarName = registrarVcard?.find(v => v[0] === 'fn')?.[3] as string | undefined;

        const abuseEntity = data.entities?.find(e => e.roles?.includes('abuse'));
        const abuseVcard = abuseEntity?.vcardArray?.[1] as Array<[string, unknown, unknown, string]> | undefined;
        const abuseEmail = abuseVcard?.find(v => v[0] === 'email')?.[3] as string | undefined;

        return {
          domainName: data.ldhName,
          registrar: registrarName,
          registrationDate: getEvent('registration'),
          expirationDate: getEvent('expiration'),
          updatedDate: getEvent('last changed'),
          status: data.status ?? [],
          nameservers: data.nameservers?.map(n => n.ldhName ?? '').filter(Boolean),
          secureDNS: data.secureDNS?.delegationSigned ?? false,
          rdapConformance: data.rdapConformance,
          source: url,
        };
      }
    } catch {
      continue;
    }
  }

  return { source: 'none', status: [] };
}

export async function fetchRDAPIP(ip: string): Promise<{
  network?: string;
  country?: string;
  abuseEmail?: string;
  org?: string;
  asn?: string;
  source: string;
}> {
  const endpoints = [
    `https://rdap.arin.net/registry/ip/${ip}`,
    `https://rdap.db.ripe.net/ip/${ip}`,
    `https://rdap.apnic.net/ip/${ip}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await got(url, { timeout: { request: 6000 }, throwHttpErrors: false });
      if (res.statusCode === 200) {
        const data = JSON.parse(res.body) as {
          name?: string;
          country?: string;
          entities?: Array<{
            roles?: string[];
            vcardArray?: unknown[][];
            handle?: string;
          }>;
          asEventActor?: string;
          handle?: string;
        };

        const abuseEnt = data.entities?.find(e => e.roles?.includes('abuse'));
        const abuseVcard = abuseEnt?.vcardArray?.[1] as Array<[string, unknown, unknown, string]> | undefined;
        const abuseEmail = abuseVcard?.find(v => v[0] === 'email')?.[3] as string | undefined;

        const orgEnt = data.entities?.find(e => e.roles?.includes('registrant'));
        const orgVcard = orgEnt?.vcardArray?.[1] as Array<[string, unknown, unknown, string]> | undefined;
        const org = orgVcard?.find(v => v[0] === 'fn')?.[3] as string | undefined;

        return {
          network: data.name,
          country: data.country,
          abuseEmail,
          org,
          source: url,
        };
      }
    } catch {
      continue;
    }
  }
  return { source: 'none' };
}

// ============================================================
// ip-api.com (enhanced)
// ============================================================
export interface IpApiResult {
  status: string;
  country?: string;
  countryCode?: string;
  regionName?: string;
  city?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  isp?: string;
  org?: string;
  as?: string;
  asname?: string;
  hosting?: boolean;
  query?: string;
}

export async function resolveIpApiEnhanced(ip: string): Promise<IpApiResult> {
  try {
    const res = await got(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,lat,lon,timezone,isp,org,as,asname,hosting,query`,
      { timeout: { request: 5000 }, throwHttpErrors: false }
    );
    if (res.statusCode === 200) {
      return JSON.parse(res.body) as IpApiResult;
    }
    return { status: 'fail' };
  } catch {
    return { status: 'fail' };
  }
}

// ============================================================
// Electricity Maps / Carbon Intensity
// ============================================================
export interface CarbonIntensityResult {
  zone?: string;
  carbonIntensity?: number; // gCO2eq/kWh
  fossilFuelPercentage?: number;
  renewablePercentage?: number;
  powerBreakdown?: Record<string, number>;
  updatedAt?: string;
  source: string;
}

export async function fetchCarbonIntensity(
  lat: number,
  lon: number,
  countryCode: string
): Promise<CarbonIntensityResult> {
  // Try Electricity Maps first (free tier)
  const emKey = process.env.ELECTRICITY_MAPS_API_KEY;
  if (emKey) {
    try {
      const zoneRes = await got(
        `https://api.electricitymap.org/v3/carbon-intensity/latest?lat=${lat}&lon=${lon}`,
        {
          headers: { 'auth-token': emKey },
          timeout: { request: 8000 },
          throwHttpErrors: false,
        }
      );
      if (zoneRes.statusCode === 200) {
        const data = JSON.parse(zoneRes.body) as {
          zone?: string;
          carbonIntensity?: number;
          updatedAt?: string;
          fossilFuelPercentage?: number;
        };

        // Also get power breakdown
        let powerBreakdown: Record<string, number> | undefined;
        try {
          const pbRes = await got(
            `https://api.electricitymap.org/v3/power-breakdown/latest?lat=${lat}&lon=${lon}`,
            { headers: { 'auth-token': emKey }, timeout: { request: 6000 }, throwHttpErrors: false }
          );
          if (pbRes.statusCode === 200) {
            const pb = JSON.parse(pbRes.body) as { powerConsumptionBreakdown?: Record<string, number> };
            powerBreakdown = pb.powerConsumptionBreakdown;
          }
        } catch { /* optional */ }

        return {
          zone: data.zone,
          carbonIntensity: data.carbonIntensity,
          fossilFuelPercentage: data.fossilFuelPercentage,
          renewablePercentage: data.fossilFuelPercentage !== undefined ? 100 - data.fossilFuelPercentage : undefined,
          powerBreakdown,
          updatedAt: data.updatedAt,
          source: 'electricitymap',
        };
      }
    } catch { /* fall through */ }
  }

  // Try CO2signal (free, no key required for basic)
  const co2Key = process.env.CO2SIGNAL_API_KEY;
  if (co2Key) {
    try {
      const res = await got(
        `https://api.co2signal.com/v1/latest?lat=${lat}&lon=${lon}`,
        {
          headers: { 'auth-token': co2Key },
          timeout: { request: 6000 },
          throwHttpErrors: false,
        }
      );
      if (res.statusCode === 200) {
        const data = JSON.parse(res.body) as {
          data?: { carbonIntensity?: number; fossilFuelPercentage?: number };
          countryCode?: string;
          _disclaimer?: string;
        };
        return {
          zone: data.countryCode,
          carbonIntensity: data.data?.carbonIntensity,
          fossilFuelPercentage: data.data?.fossilFuelPercentage,
          renewablePercentage: data.data?.fossilFuelPercentage !== undefined ? 100 - data.data.fossilFuelPercentage : undefined,
          source: 'co2signal',
        };
      }
    } catch { /* fall through */ }
  }

  // Fallback: static lookup from our internal table
  return { source: 'static-table', zone: countryCode };
}

// ============================================================
// Cloudflare Radar ASN Info
// ============================================================
export interface CloudflareRadarASN {
  asn?: number;
  asnName?: string;
  asnOrg?: string;
  country?: string;
  countryCode?: string;
  website?: string;
  source: string;
}

export async function fetchCloudflareRadarASN(asn: string): Promise<CloudflareRadarASN> {
  const cfKey = process.env.CLOUDFLARE_API_KEY;
  const cfEmail = process.env.CLOUDFLARE_EMAIL;
  if (!cfKey || !cfEmail) return { source: 'none' };

  const asnNum = asn.replace(/^AS/i, '');
  try {
    const res = await got(
      `https://api.cloudflare.com/client/v4/radar/entities/asns/${asnNum}`,
      {
        headers: {
          'X-Auth-Email': cfEmail,
          'X-Auth-Key': cfKey,
          'Content-Type': 'application/json',
        },
        timeout: { request: 8000 },
        throwHttpErrors: false,
      }
    );
    if (res.statusCode === 200) {
      const data = JSON.parse(res.body) as {
        result?: {
          asn?: {
            asn?: number;
            name?: string;
            aka?: string;
            orgName?: string;
            country?: string;
            countryCode?: string;
            website?: string;
          };
        };
      };
      const a = data.result?.asn;
      return {
        asn: a?.asn,
        asnName: a?.name ?? a?.aka,
        asnOrg: a?.orgName,
        country: a?.country,
        countryCode: a?.countryCode,
        website: a?.website,
        source: 'cloudflare-radar',
      };
    }
    return { source: 'cloudflare-radar-error' };
  } catch {
    return { source: 'none' };
  }
}

// ============================================================
// HSTS Preload + Chain Lookup
// ============================================================
export async function fetchSecurityHeaders(url: string): Promise<Record<string, string>> {
  try {
    const res = await got.head(url, {
      timeout: { request: 8000 },
      throwHttpErrors: false,
      followRedirect: true,
      maxRedirects: 5,
    });
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(res.headers)) {
      if (v) out[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v);
    }
    return out;
  } catch {
    return {};
  }
}

// ============================================================
// MaxMind GeoIP2 (local MMDB file)
// ============================================================
let maxmindReader: unknown = null;

export async function loadMaxMindDb(): Promise<void> {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const dbPath = path.join(process.cwd(), 'data', 'GeoLite2-City.mmdb');
    if (!fs.existsSync(dbPath)) {
      logger.info('MaxMind DB not found, skipping');
      return;
    }
    // Dynamic import maxmind if available
    // @ts-ignore
    const maxmindImport = await import('maxmind').catch(() => null); const open = (maxmindImport as {open?: unknown})?.open ?? null;
    if (open && typeof open === 'function') {
      maxmindReader = await (open as (p: string) => Promise<unknown>)(dbPath);
      logger.info('MaxMind GeoLite2 City DB loaded');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to load MaxMind DB');
  }
}

export async function geolocateIp(ip: string): Promise<{
  country?: string;
  countryCode?: string;
  city?: string;
  region?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
}> {
  if (maxmindReader) {
    try {
      const reader = maxmindReader as {
        get: (ip: string) => {
          country?: { names?: { en?: string }; iso_code?: string };
          city?: { names?: { en?: string } };
          subdivisions?: Array<{ names?: { en?: string } }>;
          location?: { latitude?: number; longitude?: number; time_zone?: string };
        } | null;
      };
      const result = reader.get(ip);
      if (result) {
        return {
          country: result.country?.names?.en,
          countryCode: result.country?.iso_code,
          city: result.city?.names?.en,
          region: result.subdivisions?.[0]?.names?.en,
          lat: result.location?.latitude,
          lon: result.location?.longitude,
          timezone: result.location?.time_zone,
        };
      }
    } catch { /* fall through */ }
  }
  return {};
}
