/**
 * builtwith.ts
 * BuiltWith Free API client.
 * Endpoint: https://api.builtwith.com/free1/api.json?KEY=<key>&LOOKUP=<domain>
 *
 * Free API response format:
 *   { free1: { domain, first, last, groups: [{ name, live, dead, latest, oldest, categories: [...] }] } }
 *
 * Note: free tier returns GROUP/CATEGORY counts, not individual tech names.
 * For full tech names, upgrade to /v19 API.
 *
 * API key: set BUILTWITH_API_KEY in .env — falls back to demo key (limited).
 */

import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('builtwith');

const BASE_URL = 'https://api.builtwith.com/free1/api.json';

// In-memory cache: domain → result (6 hour TTL)
const CACHE = new Map<string, { data: BuiltWithResult; expiresAt: number }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types matching the free API response
// ---------------------------------------------------------------------------

export interface BuiltWithCategory {
  name: string;       // category id e.g. "social-sdk", "ab-testing"
  live: number;       // technologies currently live in this category
  dead: number;       // technologies no longer live
  latest: number;     // epoch — most recent tech indexed in this category
  oldest: number;     // epoch — earliest tech indexed
}

export interface BuiltWithGroup {
  name: string;             // group name e.g. "javascript", "cms", "hosting", "analytics"
  live: number;             // total live technologies in this group
  dead: number;             // total dead technologies in this group
  latest: number;           // epoch — most recent tech in group
  oldest: number;           // epoch — earliest tech in group
  categories: BuiltWithCategory[];
}

export interface BuiltWithResult {
  domain: string;
  firstIndexed: number;     // epoch — first time BuiltWith indexed this domain
  lastIndexed: number;      // epoch — most recent index
  firstIndexedDate: string; // ISO date string
  lastIndexedDate: string;  // ISO date string
  groups: BuiltWithGroup[];
  totalLive: number;        // sum of live techs across all groups
  totalDead: number;        // sum of dead techs
  topGroups: string[];      // groups with most live technologies
  source: 'builtwith-api' | 'cached' | 'unavailable';
  error?: string;
}

// ---------------------------------------------------------------------------
// Raw API response types
// ---------------------------------------------------------------------------

interface BwRawCategory {
  Name?: string;   name?: string;
  Live?: number;   live?: number;
  Dead?: number;   dead?: number;
  Latest?: number; latest?: number;
  Oldest?: number; oldest?: number;
}

interface BwRawGroup {
  Name?: string;   name?: string;
  Live?: number;   live?: number;
  Dead?: number;   dead?: number;
  Latest?: number; latest?: number;
  Oldest?: number; oldest?: number;
  Categories?: BwRawCategory[];
  categories?: BwRawCategory[];
}

interface BwRawFree1 {
  Domain?: string; domain?: string;
  First?: number;  first?: number;
  Last?: number;   last?: number;
  Groups?: BwRawGroup[];
  groups?: BwRawGroup[];
}

interface BwRawResponse {
  free1?: BwRawFree1;
  Errors?: Array<{ Message: string }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function epochToIso(epoch: number): string {
  if (!epoch || epoch === 0) return '';
  try { return new Date(epoch * 1000).toISOString().split('T')[0]; } catch { return ''; }
}

function normalizeDomain(input: string): string {
  return input
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./i, '')
    .toLowerCase()
    .trim();
}

function buildResult(raw: BwRawFree1, source: 'builtwith-api' | 'cached' = 'builtwith-api'): BuiltWithResult {
  const g = (v: BwRawGroup, key: 'Name' | 'name') => (v[key] ?? '') as string;
  const n = (v: BwRawGroup | BwRawCategory, key: string) => ((v as Record<string, number>)[key] ?? 0);

  const rawGroups = raw.Groups ?? raw.groups ?? [];
  const groups: BuiltWithGroup[] = rawGroups.map(grp => {
    const cats = grp.Categories ?? grp.categories ?? [];
    return {
      name: (grp.Name ?? grp.name ?? '').toLowerCase(),
      live: grp.Live ?? grp.live ?? 0,
      dead: grp.Dead ?? grp.dead ?? 0,
      latest: grp.Latest ?? grp.latest ?? 0,
      oldest: grp.Oldest ?? grp.oldest ?? 0,
      categories: cats.map(c => ({
        name: (c.Name ?? c.name ?? '').toLowerCase(),
        live: c.Live ?? c.live ?? 0,
        dead: c.Dead ?? c.dead ?? 0,
        latest: c.Latest ?? c.latest ?? 0,
        oldest: c.Oldest ?? c.oldest ?? 0,
      })),
    };
  });

  const totalLive = groups.reduce((s, g) => s + g.live, 0);
  const totalDead = groups.reduce((s, g) => s + g.dead, 0);
  const topGroups = [...groups]
    .sort((a, b) => b.live - a.live)
    .slice(0, 5)
    .filter(g => g.live > 0)
    .map(g => g.name);

  return {
    domain: raw.Domain ?? raw.domain ?? '',
    firstIndexed: raw.First ?? raw.first ?? 0,
    lastIndexed: raw.Last ?? raw.last ?? 0,
    firstIndexedDate: epochToIso(raw.First ?? raw.first ?? 0),
    lastIndexedDate: epochToIso(raw.Last ?? raw.last ?? 0),
    groups,
    totalLive,
    totalDead,
    topGroups,
    source,
  };
}

function unavailableResult(domain: string, error: string): BuiltWithResult {
  return {
    domain, firstIndexed: 0, lastIndexed: 0,
    firstIndexedDate: '', lastIndexedDate: '',
    groups: [], totalLive: 0, totalDead: 0, topGroups: [],
    source: 'unavailable', error,
  };
}

// ---------------------------------------------------------------------------
// Main fetch function
// ---------------------------------------------------------------------------

export async function fetchBuiltWith(domain: string): Promise<BuiltWithResult> {
  const normalized = normalizeDomain(domain);

  // Cache hit
  const cached = CACHE.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    logger.debug({ domain: normalized }, 'BuiltWith cache hit');
    return { ...cached.data, source: 'cached' };
  }

  const apiKey = process.env.BUILTWITH_API_KEY ?? '4d411b16-e153-4a3a-a590-a0680583cbf5';
  const url = `${BASE_URL}?KEY=${apiKey}&LOOKUP=${encodeURIComponent(normalized)}`;

  try {
    const { default: got } = await import('got');
    const res = await got(url, {
      headers: { 'User-Agent': 'carbon-analyzer/2.1' },
      timeout: { request: 3_000 },
      followRedirect: true,
      throwHttpErrors: false,
    });

    if (res.statusCode !== 200) {
      logger.warn({ domain: normalized, status: res.statusCode }, 'BuiltWith API non-200');
      return unavailableResult(normalized, `HTTP ${res.statusCode}`);
    }

    const data = JSON.parse(res.body) as Record<string, unknown>;

    // API returns data at ROOT level: { domain, first, last, groups }
    // NOT wrapped in a free1 key (despite docs suggesting otherwise)
    const topErrors = data['Errors'] as Array<{ Message: string }> | undefined;
    if (topErrors?.length) {
      logger.warn({ domain: normalized, msg: topErrors[0].Message }, 'BuiltWith API error');
      return unavailableResult(normalized, topErrors[0].Message);
    }

    // Check if this looks like a valid response (has domain + groups)
    if (!data['domain'] && !data['groups']) {
      logger.warn({ domain: normalized, keys: Object.keys(data) }, 'BuiltWith: unexpected response structure');
      return unavailableResult(normalized, `Unexpected keys: ${Object.keys(data).join(', ')}`);
    }

    const payload = data as unknown as BwRawFree1;
    const result = buildResult(payload);
    CACHE.set(normalized, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });

    logger.info({ domain: normalized, totalLive: result.totalLive, groups: result.groups.length }, 'BuiltWith data fetched');
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ domain: normalized, err: msg }, 'BuiltWith API call failed');
    return unavailableResult(normalized, msg);
  }
}

/**
 * Bulk fetch for multiple domains (competitor comparison etc.)
 */
export async function fetchBuiltWithBulk(
  domains: string[],
  concurrency = 3,
): Promise<Map<string, BuiltWithResult>> {
  const { default: pLimit } = await import('p-limit');
  const limit = pLimit(concurrency);
  const results = await Promise.all(
    domains.map(d => limit(() => fetchBuiltWith(d).then(r => [d, r] as [string, BuiltWithResult])))
  );
  return new Map(results);
}
