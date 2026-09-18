/**
 * image-analyzer.ts
 * Deep image analysis: format intelligence, size/dimension analysis,
 * compression benchmarking, LCP detection, CLS risk, memory pressure,
 * duplicate detection, CDN analysis, accessibility, and carbon attribution.
 */

import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('image-analyzer');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'gif' | 'svg' | 'ico' | 'bmp' | 'tiff' | 'jxl' | 'apng' | 'unknown';
export type FormatRating = 'excellent' | 'good' | 'legacy' | 'bad' | 'context-dependent';
export type ImageRole = 'photo' | 'logo' | 'icon' | 'screenshot' | 'diagram' | 'text-heavy' | 'pixel-art' | 'transparent-ui' | 'animation' | 'unknown';

export interface ImageRecord {
  url: string;
  src: string;
  type: ImageFormat;
  naturalWidth: number;
  naturalHeight: number;
  displayWidth: number;
  displayHeight: number;
  bytes: number;
  decodedBytes: number;
  aspectRatio: number;
  pixelCount: number;
  density: number;
  loading: 'lazy' | 'eager' | 'none';
  fetchPriority: 'high' | 'low' | 'auto' | 'none';
  decoding: 'async' | 'sync' | 'auto' | 'none';
  isLCP: boolean;
  isAboveFold: boolean;
  isBackground: boolean;
  hasAlpha: boolean;
  isAnimated: boolean;
  alt: string | null;
  width: number | null;   // HTML attribute
  height: number | null;  // HTML attribute
  hasDimensions: boolean;
  srcset: string | null;
  sizes: string | null;
  cdnProvider: string | null;
  cacheControl: string | null;
  etag: string | null;
  contentType: string | null;
  // Derived scores
  formatRating: FormatRating;
  role: ImageRole;
  oversizedFactor: number;
  widthWaste: number;
  bytesWaste: number;
  clsRisk: boolean;
  issues: string[];
  recommendations: ImageRecommendation[];
}

export interface ImageRecommendation {
  type: 'format' | 'size' | 'lazy' | 'preload' | 'alt' | 'dimensions' | 'cdn' | 'compression';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  estimatedSavingBytes?: number;
  estimatedSavingPct?: number;
}

export interface CompressionEstimate {
  format: ImageFormat;
  quality: number;
  estimatedBytes: number;
  savingBytes: number;
  savingPct: number;
}

export interface DuplicateGroup {
  images: string[];
  type: 'exact' | 'near-duplicate' | 'same-image-different-format' | 'same-image-different-size';
}

export interface ImageAnalysisReport {
  totalImages: number;
  totalBytes: number;
  totalDecodedBytes: number;
  potentialSavingBytes: number;
  potentialSavingPct: number;
  images: ImageRecord[];
  lcpImage: ImageRecord | null;
  duplicateGroups: DuplicateGroup[];
  formatDistribution: Record<ImageFormat, number>;
  scores: {
    format: number;
    sizing: number;
    responsive: number;
    lazyLoading: number;
    lcp: number;
    cls: number;
    compression: number;
    accessibility: number;
    carbon: number;
    overall: number;
  };
  carbonEstimate: {
    totalCo2G: number;
    potentialSavingCo2G: number;
    topOffenders: Array<{ url: string; bytes: number; co2G: number }>;
  };
  memorySummary: {
    totalDecodedMb: number;
    pressureScore: number;
    level: 'low' | 'medium' | 'high' | 'critical';
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CDN_PATTERNS: Record<string, RegExp> = {
  'Cloudflare': /cloudflare|cf-cache/i,
  'CloudFront': /cloudfront\.net|amazonaws\.com\/cloudfront/i,
  'Fastly': /fastly\.net/i,
  'Akamai': /akamaized\.net|akamai\.com/i,
  'Bunny CDN': /b-cdn\.net|bunnycdn/i,
  'imgix': /imgix\.net/i,
  'ImageKit': /imagekit\.io/i,
  'Cloudinary': /cloudinary\.com|res\.cloudinary/i,
  'Vercel': /vercel-cdn|_next\/image/i,
  'Netlify': /netlify\.app/i,
};

const FORMAT_SIGNATURES: Record<string, ImageFormat> = {
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/jxl': 'jxl',
  'image/apng': 'apng',
};

// ---------------------------------------------------------------------------
// Core Analysis Functions
// ---------------------------------------------------------------------------

function detectFormatFromUrl(url: string): ImageFormat {
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'jpeg';
  if (clean.endsWith('.png')) return 'png';
  if (clean.endsWith('.webp')) return 'webp';
  if (clean.endsWith('.avif')) return 'avif';
  if (clean.endsWith('.gif')) return 'gif';
  if (clean.endsWith('.svg')) return 'svg';
  if (clean.endsWith('.ico')) return 'ico';
  if (clean.endsWith('.bmp')) return 'bmp';
  if (clean.endsWith('.tiff') || clean.endsWith('.tif')) return 'tiff';
  if (clean.endsWith('.jxl')) return 'jxl';
  return 'unknown';
}

function detectFormatFromMime(mime: string | null): ImageFormat {
  if (!mime) return 'unknown';
  const clean = mime.toLowerCase().split(';')[0].trim();
  return FORMAT_SIGNATURES[clean] ?? detectFormatFromUrl(clean);
}

function rateFormat(format: ImageFormat, role: ImageRole, hasAlpha: boolean, isAnimated: boolean): FormatRating {
  if (isAnimated) {
    if (format === 'avif' || format === 'webp') return 'excellent';
    if (format === 'gif') return 'bad';
    return 'context-dependent';
  }
  if (role === 'icon' || role === 'logo') {
    if (format === 'svg') return 'excellent';
    if (format === 'png') return 'context-dependent';
    return 'legacy';
  }
  switch (format) {
    case 'avif': return 'excellent';
    case 'webp': return 'excellent';
    case 'jpeg': return role === 'photo' ? 'good' : 'legacy';
    case 'png':
      if (hasAlpha && role === 'transparent-ui') return 'good';
      if (role === 'photo') return 'bad';
      return 'legacy';
    case 'svg': return 'excellent';
    case 'gif': return 'bad';
    case 'bmp': return 'bad';
    case 'tiff': return 'bad';
    default: return 'context-dependent';
  }
}

function classifyRole(
  url: string,
  alt: string | null,
  naturalWidth: number,
  naturalHeight: number,
  hasAlpha: boolean,
  format: ImageFormat,
): ImageRole {
  const urlLower = url.toLowerCase();
  const altLower = (alt ?? '').toLowerCase();

  if (format === 'svg') return 'icon';
  if (urlLower.includes('logo') || altLower.includes('logo')) return 'logo';
  if (urlLower.includes('icon') || altLower.includes('icon')) return 'icon';
  if (urlLower.includes('screenshot') || urlLower.includes('screen')) return 'screenshot';
  if (urlLower.includes('diagram') || urlLower.includes('chart') || urlLower.includes('graph')) return 'diagram';
  if (naturalWidth < 64 && naturalHeight < 64) return 'icon';
  if (hasAlpha && naturalWidth < 200) return 'transparent-ui';
  if (naturalWidth > 800 && naturalHeight > 400) return 'photo';
  return 'unknown';
}

function detectCdn(url: string): string | null {
  for (const [name, pattern] of Object.entries(CDN_PATTERNS)) {
    if (pattern.test(url)) return name;
  }
  return null;
}

function computeOversizedFactor(
  naturalWidth: number,
  displayWidth: number,
  density: number,
): number {
  if (displayWidth <= 0 || naturalWidth <= 0) return 1;
  const idealWidth = displayWidth * density;
  return Number((naturalWidth / idealWidth).toFixed(2));
}

function estimateDecodedBytes(width: number, height: number): number {
  return width * height * 4; // RGBA
}

/** Heuristic byte savings if converted to AVIF */
function estimateAvifSaving(bytes: number, format: ImageFormat): number {
  const factors: Partial<Record<ImageFormat, number>> = {
    jpeg: 0.55,
    png: 0.70,
    webp: 0.20,
    gif: 0.80,
    bmp: 0.85,
  };
  const factor = factors[format] ?? 0.40;
  return Math.round(bytes * factor);
}

function buildRecommendations(img: Partial<ImageRecord>): ImageRecommendation[] {
  const recs: ImageRecommendation[] = [];
  const format = img.type ?? 'unknown';
  const bytes = img.bytes ?? 0;

  // Format
  if (format === 'jpeg' || format === 'png' || format === 'gif' || format === 'bmp') {
    const saving = estimateAvifSaving(bytes, format);
    recs.push({
      type: 'format',
      severity: format === 'gif' || format === 'bmp' ? 'critical' : 'high',
      message: `Convert ${format.toUpperCase()} to AVIF or WebP for modern browsers.`,
      estimatedSavingBytes: saving,
      estimatedSavingPct: bytes > 0 ? Math.round((saving / bytes) * 100) : 0,
    });
  }

  // Oversized
  const oversized = img.oversizedFactor ?? 1;
  if (oversized > 2) {
    const wastedBytes = Math.round(bytes * (1 - 1 / (oversized * oversized)));
    recs.push({
      type: 'size',
      severity: oversized > 3 ? 'critical' : 'high',
      message: `Image is ${oversized}× too large for its displayed size. Serve a smaller variant.`,
      estimatedSavingBytes: wastedBytes,
      estimatedSavingPct: Math.round((wastedBytes / bytes) * 100),
    });
  }

  // LCP-specific
  if (img.isLCP) {
    if (!img.fetchPriority || img.fetchPriority === 'auto') {
      recs.push({ type: 'preload', severity: 'critical', message: 'Add fetchpriority="high" to the LCP image.' });
    }
    if (img.loading === 'lazy') {
      recs.push({ type: 'lazy', severity: 'critical', message: 'Remove loading="lazy" from the LCP image — it delays the most important paint.' });
    }
  }

  // Below-fold needs lazy
  if (!img.isAboveFold && !img.isLCP && img.loading !== 'lazy') {
    recs.push({ type: 'lazy', severity: 'medium', message: 'Add loading="lazy" to below-fold images to defer their download.' });
  }

  // Missing alt
  if (img.alt === null && !img.isBackground) {
    recs.push({ type: 'alt', severity: 'high', message: 'Missing alt attribute. Add alt="" for decorative images, or a descriptive alt for content images.' });
  }

  // CLS risk
  if (img.clsRisk) {
    recs.push({ type: 'dimensions', severity: 'high', message: 'Missing or mismatched width/height attributes cause Cumulative Layout Shift (CLS).' });
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

export function buildImageIssues(img: Partial<ImageRecord>): string[] {
  const issues: string[] = [];
  if (!img.isAboveFold && !img.isLCP && img.loading !== 'lazy') issues.push('missing-lazy');
  if (img.isLCP && img.loading === 'lazy') issues.push('lcp-lazy');
  if (img.isLCP && img.fetchPriority !== 'high') issues.push('lcp-no-priority');
  if ((img.type === 'jpeg' || img.type === 'png') && !img.isBackground) issues.push('legacy-format');
  if ((img.oversizedFactor ?? 1) > 2) issues.push('oversized');
  if (img.alt === null && !img.isBackground) issues.push('missing-alt');
  if (img.clsRisk) issues.push('cls-risk');
  if (img.type === 'gif') issues.push('gif-use-video');
  return issues;
}

/**
 * Analyses raw image data collected by the browser agent and produces
 * a comprehensive ImageAnalysisReport.
 */
export function analyzeImages(rawImages: Array<{
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  displayWidth: number;
  displayHeight: number;
  bytes: number;
  loading: string;
  fetchPriority: string;
  decoding: string;
  isLCP: boolean;
  isAboveFold: boolean;
  isBackground: boolean;
  hasAlpha: boolean;
  isAnimated: boolean;
  alt: string | null;
  width: number | null;
  height: number | null;
  srcset: string | null;
  sizes: string | null;
  contentType: string | null;
  cacheControl: string | null;
  etag: string | null;
  density: number;
}>): ImageAnalysisReport {
  const images: ImageRecord[] = rawImages.map(raw => {
    const format = detectFormatFromMime(raw.contentType) !== 'unknown'
      ? detectFormatFromMime(raw.contentType)
      : detectFormatFromUrl(raw.src);

    const role = classifyRole(raw.src, raw.alt, raw.naturalWidth, raw.naturalHeight, raw.hasAlpha, format);
    const formatRating = rateFormat(format, role, raw.hasAlpha, raw.isAnimated);
    const density = raw.density > 0 ? raw.density : (typeof window !== 'undefined' ? 2 : 2);
    const oversizedFactor = computeOversizedFactor(raw.naturalWidth, raw.displayWidth, density);
    const decodedBytes = estimateDecodedBytes(raw.naturalWidth, raw.naturalHeight);
    const aspectRatio = raw.naturalHeight > 0 ? Number((raw.naturalWidth / raw.naturalHeight).toFixed(3)) : 0;
    const widthWaste = raw.naturalWidth > 0 && raw.displayWidth > 0
      ? Math.max(0, Math.round((1 - (raw.displayWidth * density) / raw.naturalWidth) * 100))
      : 0;
    const bytesWaste = oversizedFactor > 1
      ? Math.round(raw.bytes * (1 - 1 / Math.max(1, oversizedFactor * oversizedFactor)))
      : 0;
    const clsRisk = !raw.width || !raw.height;
    const cdnProvider = detectCdn(raw.src);

    const partial: Partial<ImageRecord> = {
      url: raw.src,
      src: raw.src,
      type: format,
      naturalWidth: raw.naturalWidth,
      naturalHeight: raw.naturalHeight,
      displayWidth: raw.displayWidth,
      displayHeight: raw.displayHeight,
      bytes: raw.bytes,
      decodedBytes,
      aspectRatio,
      pixelCount: raw.naturalWidth * raw.naturalHeight,
      density,
      loading: (raw.loading as ImageRecord['loading']) || 'none',
      fetchPriority: (raw.fetchPriority as ImageRecord['fetchPriority']) || 'none',
      decoding: (raw.decoding as ImageRecord['decoding']) || 'none',
      isLCP: raw.isLCP,
      isAboveFold: raw.isAboveFold,
      isBackground: raw.isBackground,
      hasAlpha: raw.hasAlpha,
      isAnimated: raw.isAnimated,
      alt: raw.alt,
      width: raw.width,
      height: raw.height,
      hasDimensions: !!(raw.width && raw.height),
      srcset: raw.srcset,
      sizes: raw.sizes,
      cdnProvider,
      cacheControl: raw.cacheControl,
      etag: raw.etag,
      contentType: raw.contentType,
      formatRating,
      role,
      oversizedFactor,
      widthWaste,
      bytesWaste,
      clsRisk,
    };

    const issues = buildImageIssues(partial);
    const recommendations = buildRecommendations(partial);

    return { ...partial, issues, recommendations } as ImageRecord;
  });

  // Aggregate
  const totalBytes = images.reduce((s, i) => s + i.bytes, 0);
  const totalDecodedBytes = images.reduce((s, i) => s + i.decodedBytes, 0);
  const totalDecodedMb = totalDecodedBytes / 1_048_576;
  const potentialSavingBytes = images.reduce((s, i) => s + i.bytesWaste, 0);

  const lcpImage = images.find(i => i.isLCP) ?? null;

  // Format distribution
  const formatDistribution = {} as Record<ImageFormat, number>;
  for (const img of images) {
    formatDistribution[img.type] = (formatDistribution[img.type] ?? 0) + 1;
  }

  // Duplicate detection (simple URL-hash based)
  const urlGroups = new Map<string, string[]>();
  for (const img of images) {
    const key = img.src.split('?')[0];
    const arr = urlGroups.get(key) ?? [];
    arr.push(img.url);
    urlGroups.set(key, arr);
  }
  const duplicateGroups: DuplicateGroup[] = [];
  for (const [, urls] of urlGroups) {
    if (urls.length > 1) {
      duplicateGroups.push({ images: urls, type: 'exact' });
    }
  }

  // Scores
  const formatScore = computeFormatScore(images);
  const sizingScore = computeSizingScore(images);
  const lazyScore = computeLazyScore(images);
  const lcpScore = computeLcpScore(lcpImage);
  const clsScore = computeClsScore(images);
  const a11yScore = computeA11yScore(images);
  const carbonScore = computeCarbonScore(totalBytes);
  const overallScore = Math.round(
    (formatScore + sizingScore + lazyScore + lcpScore + clsScore + a11yScore + carbonScore) / 7
  );

  // Memory pressure
  const pressureScore = Math.min(100, Math.round((totalDecodedMb / 200) * 100));
  const memLevel = pressureScore < 25 ? 'low' : pressureScore < 50 ? 'medium' : pressureScore < 75 ? 'high' : 'critical';

  // Carbon estimate (0.00006 gCO2e per KB over typical network)
  const CO2_PER_BYTE = 0.00000006; // g CO2e
  const totalCo2G = totalBytes * CO2_PER_BYTE;
  const savingCo2G = potentialSavingBytes * CO2_PER_BYTE;
  const topOffenders = [...images]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 5)
    .map(i => ({ url: i.url, bytes: i.bytes, co2G: i.bytes * CO2_PER_BYTE }));

  return {
    totalImages: images.length,
    totalBytes,
    totalDecodedBytes,
    potentialSavingBytes,
    potentialSavingPct: totalBytes > 0 ? Math.round((potentialSavingBytes / totalBytes) * 100) : 0,
    images,
    lcpImage,
    duplicateGroups,
    formatDistribution,
    scores: {
      format: formatScore,
      sizing: sizingScore,
      responsive: Math.round((formatScore + sizingScore) / 2), // approximation
      lazyLoading: lazyScore,
      lcp: lcpScore,
      cls: clsScore,
      compression: formatScore,
      accessibility: a11yScore,
      carbon: carbonScore,
      overall: overallScore,
    },
    carbonEstimate: { totalCo2G, potentialSavingCo2G: savingCo2G, topOffenders },
    memorySummary: { totalDecodedMb: Number(totalDecodedMb.toFixed(1)), pressureScore, level: memLevel },
  };
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function computeFormatScore(images: ImageRecord[]): number {
  if (!images.length) return 100;
  const weights = { excellent: 100, good: 80, 'context-dependent': 60, legacy: 30, bad: 0 };
  const avg = images.reduce((s, i) => s + (weights[i.formatRating] ?? 50), 0) / images.length;
  return Math.round(avg);
}

function computeSizingScore(images: ImageRecord[]): number {
  if (!images.length) return 100;
  let score = 100;
  for (const img of images) {
    if (img.oversizedFactor > 3) score -= 15;
    else if (img.oversizedFactor > 2) score -= 8;
    else if (img.oversizedFactor > 1.5) score -= 3;
  }
  return Math.max(0, Math.min(100, score));
}

function computeLazyScore(images: ImageRecord[]): number {
  const belowFold = images.filter(i => !i.isAboveFold && !i.isLCP);
  if (!belowFold.length) return 100;
  const lazyCount = belowFold.filter(i => i.loading === 'lazy').length;
  return Math.round((lazyCount / belowFold.length) * 100);
}

function computeLcpScore(lcp: ImageRecord | null): number {
  if (!lcp) return 80;
  let score = 100;
  if (lcp.loading === 'lazy') score -= 40;
  if (lcp.fetchPriority !== 'high') score -= 20;
  if (lcp.type === 'jpeg' || lcp.type === 'png') score -= 15;
  if (lcp.oversizedFactor > 2) score -= 15;
  return Math.max(0, score);
}

function computeClsScore(images: ImageRecord[]): number {
  if (!images.length) return 100;
  const risky = images.filter(i => i.clsRisk).length;
  return Math.max(0, Math.round(100 - (risky / images.length) * 100));
}

function computeA11yScore(images: ImageRecord[]): number {
  const content = images.filter(i => !i.isBackground);
  if (!content.length) return 100;
  const withAlt = content.filter(i => i.alt !== null).length;
  return Math.round((withAlt / content.length) * 100);
}

function computeCarbonScore(totalBytes: number): number {
  const mb = totalBytes / 1_048_576;
  if (mb < 0.5) return 100;
  if (mb < 1) return 90;
  if (mb < 2) return 75;
  if (mb < 5) return 55;
  if (mb < 10) return 35;
  return 15;
}

/**
 * Extracts image data from Playwright browser result's network requests
 * and DOM analysis, returning raw image records for analyzeImages().
 */
export function extractImagesFromBrowserData(
  networkRequests: Array<{
    url: string;
    type: string;
    transferSize: number;
    decodedSize: number;
    responseHeaders?: Record<string, string>;
    fromCache?: boolean;
  }>,
  domImages: Array<{
    src: string;
    naturalWidth: number;
    naturalHeight: number;
    displayWidth: number;
    displayHeight: number;
    isAboveFold: boolean;
    isLCP: boolean;
    loading: string;
    fetchPriority: string;
    decoding: string;
    alt: string | null;
    width: number | null;
    height: number | null;
    srcset: string | null;
    sizes: string | null;
    isBackground: boolean;
  }>,
): Parameters<typeof analyzeImages>[0] {
  const networkMap = new Map<string, (typeof networkRequests)[number]>();
  for (const req of networkRequests) {
    if (req.type === 'image' || req.url.match(/\.(jpg|jpeg|png|webp|avif|gif|svg|ico|bmp|tiff|jxl)(\?|$)/i)) {
      networkMap.set(req.url, req);
    }
  }

  return domImages.map(dom => {
    const net = networkMap.get(dom.src);
    return {
      src: dom.src,
      naturalWidth: dom.naturalWidth,
      naturalHeight: dom.naturalHeight,
      displayWidth: dom.displayWidth,
      displayHeight: dom.displayHeight,
      bytes: net?.transferSize ?? 0,
      loading: dom.loading,
      fetchPriority: dom.fetchPriority,
      decoding: dom.decoding,
      isLCP: dom.isLCP,
      isAboveFold: dom.isAboveFold,
      isBackground: dom.isBackground,
      hasAlpha: dom.src.includes('.png') || dom.src.includes('.webp'), // heuristic
      isAnimated: dom.src.includes('.gif') || dom.src.includes('.apng'),
      alt: dom.alt,
      width: dom.width,
      height: dom.height,
      srcset: dom.srcset,
      sizes: dom.sizes,
      contentType: net?.responseHeaders?.['content-type'] ?? null,
      cacheControl: net?.responseHeaders?.['cache-control'] ?? null,
      etag: net?.responseHeaders?.['etag'] ?? null,
      density: 2,
    };
  });
}
