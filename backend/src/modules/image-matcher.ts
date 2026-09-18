/**
 * image-matcher.ts
 */

import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('image-matcher');

// ---------------------------------------------------------------------------
// CDN URL normalization — strip transformation params to canonical form
// ---------------------------------------------------------------------------

const CDN_TRANSFORMS: Array<{ name: string; pattern: RegExp; normalize: (url: string) => string }> = [
  // Next.js Image Optimization: /_next/image?url=<encoded>&w=1200&q=75
  { name: 'Next.js', pattern: /\/_next\/image\?/i, normalize: url => {
    try { return decodeURIComponent(new URL(url).searchParams.get('url') ?? url); } catch { return url; }
  }},
  // Cloudinary: /image/upload/c_fill,w_800/v1234/image.jpg → /image/upload/v1234/image.jpg
  { name: 'Cloudinary', pattern: /cloudinary\.com.*\/image\/upload\//i, normalize: url =>
    url.replace(/\/image\/upload\/[a-z_,0-9]+\//, '/image/upload/') },
  // imgix: strip all transformation params
  { name: 'imgix', pattern: /\.imgix\.net/i, normalize: url => url.split('?')[0] },
  // ImageKit.io
  { name: 'ImageKit', pattern: /imagekit\.io/i, normalize: url => url.split('?')[0] },
  // Shopify: product-image_1024x1024.jpg → product-image.jpg
  { name: 'Shopify', pattern: /cdn\.shopify\.com/i, normalize: url =>
    url.replace(/_\d+x(\d+)?(\.[a-z]+)(\?.*)?$/, '$2').split('?')[0] },
  // WordPress: image-800x600.jpg → image.jpg
  { name: 'WordPress', pattern: /wp-content\/uploads/i, normalize: url =>
    url.replace(/-\d+x\d+(\.[a-z]+)/, '$1').split('?')[0] },
  // Sanity CDN
  { name: 'Sanity', pattern: /cdn\.sanity\.io/i, normalize: url => url.split('?')[0] },
  // Contentful
  { name: 'Contentful', pattern: /images\.ctfassets\.net/i, normalize: url => url.split('?')[0] },
  // GitHub / Fastly (githubassets, avatars.githubusercontent.com)
  { name: 'GitHub/Fastly', pattern: /github(assets|usercontent|avatars)\.com|githubusercontent\.com/i,
    normalize: url => url.split('?')[0] },
  // Akamai
  { name: 'Akamai', pattern: /akamaized\.net|akamai\.com/i, normalize: url => url.split('?')[0] },
  // BunnyCDN
  { name: 'BunnyCDN', pattern: /b-cdn\.net/i, normalize: url => url.split('?')[0] },
  // Fastly generic
  { name: 'Fastly', pattern: /fastly\.net/i, normalize: url => url.split('?')[0] },
  // StackPath
  { name: 'StackPath', pattern: /stackpathcdn\.com/i, normalize: url => url.split('?')[0] },
  // KeyCDN
  { name: 'KeyCDN', pattern: /keycdn\.com/i, normalize: url => url.split('?')[0] },
  // Vercel image optimization
  { name: 'Vercel', pattern: /vercel\.app.*\/_next\/image/i, normalize: url => {
    try { return decodeURIComponent(new URL(url).searchParams.get('url') ?? url); } catch { return url; }
  }},
  // Contentstack
  { name: 'Contentstack', pattern: /contentstack\.io/i, normalize: url => url.split('?')[0] },
  // Strapi / Cloudflare Images
  { name: 'Cloudflare Images', pattern: /imagedelivery\.net/i, normalize: url => {
    // https://imagedelivery.net/account/image-id/public → strip /variant
    return url.replace(/\/[^/]+$/, '');
  }},
  // Generic: strip common non-visual query params
  { name: 'Generic', pattern: /./, normalize: url => {
    try {
      const u = new URL(url);
      ['utm_source','utm_medium','utm_campaign','ref','fbclid','gclid','v','cache','t','cb','_t'].forEach(p => u.searchParams.delete(p));
      return u.href;
    } catch { return url; }
  }},
];

function canonicalize(url: string): string {
  for (const cdn of CDN_TRANSFORMS) {
    if (cdn.pattern.test(url)) {
      try {
        const normalized = cdn.normalize(url);
        if (normalized && normalized !== url) return normalized;
      } catch { /* ignore */ }
    }
  }
  return url;
}

function urlPathKey(url: string): string {
  try { return new URL(url).pathname.toLowerCase(); } catch { return url.toLowerCase(); }
}

function urlFilenameKey(url: string): string {
  try {
    return new URL(url).pathname.split('/').pop()?.split('?')[0].toLowerCase() ?? '';
  } catch { return url.split('/').pop()?.split('?')[0].toLowerCase() ?? ''; }
}

function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|webp|avif|gif|svg|ico|bmp|tiff|jxl|apng)(\?|$)/i.test(url);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NetworkImageEntry {
  url: string;
  transferSize: number;
  decodedBodySize: number;
  contentType: string | null;
  cacheControl: string | null;
  etag: string | null;
  fromCache: boolean;
  isCdn: boolean;
  source: 'playwright' | 'cdp' | 'performance-timing' | 'head-request';
}

export interface MatchedImage {
  src: string;
  matchedUrl: string | null;
  transferSize: number;
  decodedBodySize: number;
  contentType: string | null;
  cacheControl: string | null;
  etag: string | null;
  fromCache: boolean;
  isCdn: boolean;
  matchMethod: 'exact' | 'canonical' | 'path' | 'filename' | 'head-request' | 'unmatched';
  source: NetworkImageEntry['source'] | 'none';
}

export interface ImageMatchStats {
  total: number;
  matched: number;
  unmatched: number;
  cached: number;
  matchRate: number;
  byMethod: Record<string, number>;
  bySource: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Build lookup maps from all data sources
// ---------------------------------------------------------------------------

function buildLookupMaps(
  networkRequests: Array<{
    url: string; type: string; transferSize: number;
    decodedSize?: number;
    responseHeaders?: Record<string, string>;
    fromCache?: boolean;
  }>,
  cdpImageData?: Array<{ url: string; bytes: number }>,
  resourceTimings?: Array<{
    name: string; initiatorType: string;
    transferSize: number; decodedBodySize: number; encodedBodySize: number; duration: number;
  }>,
): {
  byExact: Map<string, NetworkImageEntry>;
  byCanonical: Map<string, NetworkImageEntry>;
  byPath: Map<string, NetworkImageEntry>;
  byFilename: Map<string, NetworkImageEntry>;
} {
  const byExact    = new Map<string, NetworkImageEntry>();
  const byCanonical = new Map<string, NetworkImageEntry>();
  const byPath     = new Map<string, NetworkImageEntry>();
  const byFilename = new Map<string, NetworkImageEntry>();

  function addEntry(url: string, entry: NetworkImageEntry): void {
    // Prefer higher quality (larger size) entries when duplicated
    const existing = byExact.get(url);
    if (existing && existing.transferSize >= entry.transferSize && existing.decodedBodySize >= entry.decodedBodySize) return;

    byExact.set(url, entry);

    const canonical = canonicalize(url);
    if (!byCanonical.has(canonical)) byCanonical.set(canonical, entry);
    if (canonical !== url) {
      if (!byCanonical.has(url)) byCanonical.set(url, entry); // also map original
    }

    const path = urlPathKey(url);
    if (!byPath.has(path)) byPath.set(path, entry);

    const filename = urlFilenameKey(url);
    if (filename && filename.length > 3 && !byFilename.has(filename)) byFilename.set(filename, entry);
  }

  // Source 1: Playwright response interceptor (best body data)
  for (const req of networkRequests) {
    if (req.type === 'image' || req.type === 'images' || isImageUrl(req.url)) {
      addEntry(req.url, {
        url: req.url,
        transferSize: req.transferSize,
        decodedBodySize: req.decodedSize ?? req.transferSize,
        contentType: req.responseHeaders?.['content-type'] ?? null,
        cacheControl: req.responseHeaders?.['cache-control'] ?? null,
        etag: req.responseHeaders?.['etag'] ?? null,
        fromCache: req.fromCache ?? false,
        isCdn: !!(req.responseHeaders?.['cf-cache-status'] || req.responseHeaders?.['x-amz-cf-id'] || req.responseHeaders?.['x-fastly-request-id']),
        source: 'playwright',
      });
    }
  }

  // Source 2: CDP Network events (catches preload, prefetch, HTTP/2 push)
  for (const cdp of (cdpImageData ?? [])) {
    if (!cdp.url || !isImageUrl(cdp.url)) continue;
    const existing = byExact.get(cdp.url);
    if (!existing || existing.transferSize === 0) {
      addEntry(cdp.url, {
        url: cdp.url,
        transferSize: cdp.bytes,
        decodedBodySize: cdp.bytes,
        contentType: null,
        cacheControl: null,
        etag: null,
        fromCache: cdp.bytes === 0,
        isCdn: false,
        source: 'cdp',
      });
    }
  }

  // Source 3: PerformanceResourceTiming (ground truth — catches ALL including cached + SW)
  for (const timing of (resourceTimings ?? [])) {
    if (!timing.name || timing.name.startsWith('data:')) continue;
    const isImage = timing.initiatorType === 'img' || timing.initiatorType === 'css' ||
                    timing.initiatorType === 'link' || isImageUrl(timing.name);
    if (!isImage) continue;

    const existing = byExact.get(timing.name);
    // PerformanceResourceTiming has decodedBodySize even for cached — always better than 0
    const betterSize = (timing.decodedBodySize > 0 && (existing?.decodedBodySize ?? 0) === 0);
    if (!existing || betterSize) {
      const isCached = timing.transferSize === 0 && timing.decodedBodySize > 0;
      addEntry(timing.name, {
        url: timing.name,
        transferSize: timing.transferSize > 0 ? timing.transferSize : timing.encodedBodySize,
        decodedBodySize: timing.decodedBodySize,
        contentType: null,
        cacheControl: null,
        etag: null,
        fromCache: isCached,
        isCdn: false,
        source: 'performance-timing',
      });
    }
  }

  return { byExact, byCanonical, byPath, byFilename };
}

// ---------------------------------------------------------------------------
// HEAD request fallback for unmatched images
// ---------------------------------------------------------------------------

async function headRequestFallback(
  urls: string[],
  concurrency = 6,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (urls.length === 0) return result;

  const { default: pLimit } = await import('p-limit');
  const { default: got } = await import('got');
  const limit = pLimit(concurrency);

  await Promise.allSettled(urls.map(url => limit(async () => {
    try {
      const res = await got.head(url, {
        timeout: { request: 5_000 },
        followRedirect: true,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CarbonAnalyzer/2.1)' },
        throwHttpErrors: false,
      });
      const cl = parseInt(res.headers['content-length'] ?? '0', 10);
      if (cl > 0) result.set(url, cl);
    } catch { /* ignore */ }
  })));

  logger.debug({ total: urls.length, resolved: result.size }, 'HEAD request fallback complete');
  return result;
}

// ---------------------------------------------------------------------------
// Main export: match DOM images to network data
// ---------------------------------------------------------------------------

export async function matchImagesToNetwork(
  domImages: Array<{ src: string; srcset?: string | null }>,
  networkRequests: Array<{
    url: string; type: string; transferSize: number;
    decodedSize?: number;
    responseHeaders?: Record<string, string>;
    fromCache?: boolean;
  }>,
  pageUrl: string,
  options?: {
    cdpImageData?: Array<{ url: string; bytes: number }>;
    resourceTimings?: Array<{
      name: string; initiatorType: string;
      transferSize: number; decodedBodySize: number; encodedBodySize: number; duration: number;
    }>;
    useHeadFallback?: boolean;  // default true
  },
): Promise<MatchedImage[]> {
  const { cdpImageData, resourceTimings, useHeadFallback = true } = options ?? {};

  // Build all lookup maps from combined data sources
  const { byExact, byCanonical, byPath, byFilename } = buildLookupMaps(
    networkRequests, cdpImageData, resourceTimings
  );

  // Extract all candidate URLs from DOM image (src + srcset candidates)
  function getCandidates(src: string, srcset?: string | null): string[] {
    const candidates: string[] = [];
    if (src && !src.startsWith('data:')) {
      try { candidates.push(new URL(src, pageUrl).href); } catch { candidates.push(src); }
    }
    if (srcset) {
      for (const part of srcset.split(',')) {
        const urlPart = part.trim().split(/\s+/)[0];
        if (urlPart && !urlPart.startsWith('data:')) {
          try { candidates.push(new URL(urlPart, pageUrl).href); } catch { candidates.push(urlPart); }
        }
      }
    }
    return [...new Set(candidates)];
  }

  // First pass: match all possible images
  const results: MatchedImage[] = domImages.map(img => {
    const candidates = getCandidates(img.src, img.srcset);

    for (const candidate of candidates) {
      // Tier 1: exact URL
      let entry = byExact.get(candidate);
      if (entry) return { src: img.src, matchedUrl: candidate, ...entry, matchMethod: 'exact' as const };

      // Tier 2: canonical (CDN param stripped)
      const canonical = canonicalize(candidate);
      entry = byCanonical.get(canonical);
      if (!entry && canonical !== candidate) entry = byCanonical.get(candidate);
      if (entry) return { src: img.src, matchedUrl: canonical, ...entry, matchMethod: 'canonical' as const };

      // Tier 3: path match
      const path = urlPathKey(candidate);
      entry = byPath.get(path);
      if (entry) return { src: img.src, matchedUrl: candidate, ...entry, matchMethod: 'path' as const };

      // Tier 4: filename match (last resort before HEAD)
      const filename = urlFilenameKey(candidate);
      if (filename && filename.length > 3) {
        entry = byFilename.get(filename);
        if (entry) return { src: img.src, matchedUrl: candidate, ...entry, matchMethod: 'filename' as const };
      }
    }

    return {
      src: img.src, matchedUrl: null,
      transferSize: 0, decodedBodySize: 0,
      contentType: null, cacheControl: null, etag: null,
      fromCache: false, isCdn: false,
      matchMethod: 'unmatched' as const, source: 'none' as const,
    };
  });

  // Tier 5: HEAD request fallback for still-unmatched images
  if (useHeadFallback) {
    const unmatchedUrls = results
      .filter(r => r.matchMethod === 'unmatched' && r.src && !r.src.startsWith('data:'))
      .map(r => { try { return new URL(r.src, pageUrl).href; } catch { return r.src; } })
      .filter((url, i, arr) => arr.indexOf(url) === i && isImageUrl(url)); // dedupe

    if (unmatchedUrls.length > 0) {
      logger.debug({ count: unmatchedUrls.length }, 'Running HEAD request fallback for unmatched images');
      const headSizes = await headRequestFallback(unmatchedUrls);

      for (const result of results) {
        if (result.matchMethod !== 'unmatched') continue;
        const url = (() => { try { return new URL(result.src, pageUrl).href; } catch { return result.src; } })();
        const size = headSizes.get(url);
        if (size) {
          result.transferSize = size;
          result.decodedBodySize = size;
          result.matchedUrl = url;
          result.matchMethod = 'head-request' as const;
          result.source = 'head-request';
          result.fromCache = false;
        }
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Stats helper
// ---------------------------------------------------------------------------

export function buildImageMatchStats(matched: MatchedImage[]): ImageMatchStats {
  const byMethod: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  let matchedCount = 0;
  let cachedCount = 0;

  for (const img of matched) {
    byMethod[img.matchMethod] = (byMethod[img.matchMethod] ?? 0) + 1;
    bySource[img.source] = (bySource[img.source] ?? 0) + 1;
    if (img.matchMethod !== 'unmatched') matchedCount++;
    if (img.fromCache) cachedCount++;
  }

  return {
    total: matched.length,
    matched: matchedCount,
    unmatched: matched.length - matchedCount,
    cached: cachedCount,
    matchRate: matched.length > 0 ? Math.round((matchedCount / matched.length) * 100) : 0,
    byMethod,
    bySource,
  };
}

// Backwards-compat sync version (no HEAD fallback) — used by orchestrator inline path
export function matchImagesToNetworkSync(
  domImages: Array<{ src: string; srcset?: string | null }>,
  networkRequests: Array<{
    url: string; type: string; transferSize: number;
    decodedSize?: number;
    responseHeaders?: Record<string, string>;
    fromCache?: boolean;
  }>,
  pageUrl: string,
  options?: {
    cdpImageData?: Array<{ url: string; bytes: number }>;
    resourceTimings?: Array<{
      name: string; initiatorType: string;
      transferSize: number; decodedBodySize: number; encodedBodySize: number; duration: number;
    }>;
  },
): MatchedImage[] {
  const { cdpImageData, resourceTimings } = options ?? {};
  const { byExact, byCanonical, byPath, byFilename } = buildLookupMaps(
    networkRequests, cdpImageData, resourceTimings
  );

  function getCandidates(src: string, srcset?: string | null): string[] {
    const candidates: string[] = [];
    if (src && !src.startsWith('data:')) {
      try { candidates.push(new URL(src, pageUrl).href); } catch { candidates.push(src); }
    }
    if (srcset) {
      for (const part of srcset.split(',')) {
        const urlPart = part.trim().split(/\s+/)[0];
        if (urlPart && !urlPart.startsWith('data:')) {
          try { candidates.push(new URL(urlPart, pageUrl).href); } catch { candidates.push(urlPart); }
        }
      }
    }
    return [...new Set(candidates)];
  }

  return domImages.map(img => {
    for (const candidate of getCandidates(img.src, img.srcset)) {
      let entry = byExact.get(candidate);
      if (entry) return { src: img.src, matchedUrl: candidate, ...entry, matchMethod: 'exact' as const };

      const canonical = canonicalize(candidate);
      entry = byCanonical.get(canonical) ?? byCanonical.get(candidate);
      if (entry) return { src: img.src, matchedUrl: canonical, ...entry, matchMethod: 'canonical' as const };

      entry = byPath.get(urlPathKey(candidate));
      if (entry) return { src: img.src, matchedUrl: candidate, ...entry, matchMethod: 'path' as const };

      const filename = urlFilenameKey(candidate);
      if (filename && filename.length > 3) {
        entry = byFilename.get(filename);
        if (entry) return { src: img.src, matchedUrl: candidate, ...entry, matchMethod: 'filename' as const };
      }
    }
    return {
      src: img.src, matchedUrl: null,
      transferSize: 0, decodedBodySize: 0,
      contentType: null, cacheControl: null, etag: null,
      fromCache: false, isCdn: false,
      matchMethod: 'unmatched' as const, source: 'none' as const,
    };
  });
}
