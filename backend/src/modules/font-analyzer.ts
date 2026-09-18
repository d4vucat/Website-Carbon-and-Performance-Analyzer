import { createModuleLogger } from '../utils/logger.js';
/**
 * font-analyzer.ts
 * Analyzes web font loading performance, format choices, subsetting,
 * FOUT/FOIT risk, self-hosting vs third-party, and carbon attribution.
 */




const logger = createModuleLogger('font-analyzer');

/** Cache: font URL → real family name from binary metadata */
const fontNameCache = new Map<string, string>();

async function resolveFontNameFromBinary(url: string): Promise<string | null> {
  if (fontNameCache.has(url)) return fontNameCache.get(url)!;
  try {
    const { default: got } = await import('got');
    const buf = await got(url, {
      responseType: 'buffer',
      timeout: { request: 8_000 },
      followRedirect: true,
      headers: { 'User-Agent': 'carbon-analyzer-font-probe/1.0' },
    }).buffer();
    // Dynamically import fontkit (ESM)
    const fontkit = await import('fontkit');
    const font = (fontkit as unknown as { create: (buf: Buffer) => { familyName: string } }).create(buf);
    const name = font.familyName?.trim() ?? null;
    if (name) fontNameCache.set(url, name);
    return name;
  } catch { return null; }
}



// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FontFormat = 'woff2' | 'woff' | 'ttf' | 'otf' | 'eot' | 'svg-font' | 'unknown';
export type FontDisplayValue = 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
export type FontLoadStrategy = 'preloaded' | 'preconnected' | 'standard' | 'render-blocking';

export interface FontRecord {
  family: string;
  url: string;
  format: FontFormat;
  bytes: number;
  subsetsDetected: string[];
  isVariableFont: boolean;
  fontDisplay: FontDisplayValue;
  isPreloaded: boolean;
  isPreconnected: boolean;
  isSelfHosted: boolean;
  provider: string | null;
  loadStrategy: FontLoadStrategy;
  unicodeRange: string | null;
  weight: string;
  style: string;
  issues: string[];
  recommendations: FontRecommendation[];
}

export interface FontRecommendation {
  type: 'format' | 'subsetting' | 'display' | 'preload' | 'self-host' | 'variable' | 'unused';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  estimatedSavingMs?: number;
  estimatedSavingBytes?: number;
}

export interface FontAnalysisReport {
  totalFonts: number;
  totalBytes: number;
  thirdPartyFonts: number;
  selfHostedFonts: number;
  woff2Count: number;
  legacyFormatCount: number;
  hasGoogleFonts: boolean;
  hasAdobeFonts: boolean;
  foutRisk: boolean;
  foitRisk: boolean;
  renderBlockingFonts: number;
  preloadedFonts: number;
  fonts: FontRecord[];
  providers: Record<string, number>;
  score: number;
  grade: string;
  carbonEstimate: { totalCo2G: number };
  recommendations: FontRecommendation[];
}

// ---------------------------------------------------------------------------
// Known font providers
// ---------------------------------------------------------------------------

const FONT_PROVIDERS: Array<{ name: string; pattern: RegExp; isThirdParty: boolean }> = [
  { name: 'Google Fonts',   pattern: /fonts\.googleapis\.com|fonts\.gstatic\.com/i, isThirdParty: true },
  { name: 'Adobe Fonts',    pattern: /use\.typekit\.net|typekit\.com/i,             isThirdParty: true },
  { name: 'Font Awesome',   pattern: /fontawesome\.com|fa-/i,                       isThirdParty: true },
  { name: 'Fonts.com',      pattern: /fast\.fonts\.net/i,                           isThirdParty: true },
  { name: 'Bunny Fonts',    pattern: /fonts\.bunny\.net/i,                          isThirdParty: true },
  { name: 'jsDelivr',       pattern: /cdn\.jsdelivr\.net.*font/i,                   isThirdParty: true },
  { name: 'cdnjs',          pattern: /cdnjs\.cloudflare\.com.*font/i,               isThirdParty: true },
];

function detectProvider(url: string): { name: string | null; isThirdParty: boolean } {
  for (const p of FONT_PROVIDERS) {
    if (p.pattern.test(url)) return { name: p.name, isThirdParty: p.isThirdParty };
  }
  return { name: null, isThirdParty: false };
}

function detectFormat(url: string, contentType: string | null): FontFormat {
  const u = url.toLowerCase();
  if (contentType?.includes('woff2') || u.endsWith('.woff2')) return 'woff2';
  if (contentType?.includes('woff') || u.endsWith('.woff')) return 'woff';
  if (u.endsWith('.ttf')) return 'ttf';
  if (u.endsWith('.otf')) return 'otf';
  if (u.endsWith('.eot')) return 'eot';
  if (u.endsWith('.svg')) return 'svg-font';
  // Google Fonts CDN URL hints
  if (url.includes('fonts.gstatic.com')) return 'woff2';
  return 'unknown';
}

function detectSubsets(url: string, unicodeRange: string | null): string[] {
  const subsets: string[] = [];
  if (url.includes('subset=') || unicodeRange) {
    if (url.includes('latin') || unicodeRange?.startsWith('U+0')) subsets.push('latin');
    if (url.includes('greek') || unicodeRange?.includes('U+0370')) subsets.push('greek');
    if (url.includes('cyrillic') || unicodeRange?.includes('U+0400')) subsets.push('cyrillic');
    if (url.includes('chinese') || url.includes('cjk')) subsets.push('cjk');
    if (url.includes('arabic') || unicodeRange?.includes('U+0600')) subsets.push('arabic');
  }
  return subsets.length ? subsets : ['full'];
}

function buildFontRecommendations(font: Omit<FontRecord, 'recommendations'>): FontRecommendation[] {
  const recs: FontRecommendation[] = [];

  if (font.format !== 'woff2' && font.format !== 'unknown') {
    recs.push({
      type: 'format',
      severity: 'high',
      message: `Convert ${font.format.toUpperCase()} to WOFF2 for ~30% smaller file size and universal modern browser support.`,
      estimatedSavingBytes: Math.round(font.bytes * 0.3),
    });
  }

  if (font.fontDisplay === 'block' || font.fontDisplay === 'auto') {
    recs.push({
      type: 'display',
      severity: 'high',
      message: 'Use font-display: swap or optional to prevent invisible text (FOIT) during font load.',
      estimatedSavingMs: 300,
    });
  }

  if (!font.isPreloaded && font.loadStrategy !== 'render-blocking') {
    recs.push({
      type: 'preload',
      severity: 'medium',
      message: `Preload ${font.family} with <link rel="preload" as="font"> to start download earlier.`,
      estimatedSavingMs: 150,
    });
  }

  if (!font.isSelfHosted && font.provider === 'Google Fonts') {
    recs.push({
      type: 'self-host',
      severity: 'medium',
      message: 'Self-host Google Fonts to eliminate third-party DNS + TLS latency and improve privacy.',
      estimatedSavingMs: 200,
    });
  }

  if (!font.isVariableFont && font.bytes > 50_000) {
    recs.push({
      type: 'variable',
      severity: 'low',
      message: 'Consider variable fonts to serve all weights/styles in a single file.',
      estimatedSavingBytes: Math.round(font.bytes * 0.4),
    });
  }

  if (font.subsetsDetected.includes('full') && font.bytes > 100_000) {
    recs.push({
      type: 'subsetting',
      severity: 'medium',
      message: 'Subset this font to only include the Unicode ranges actually used on your pages.',
      estimatedSavingBytes: Math.round(font.bytes * 0.6),
    });
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function analyzeFonts(
  networkRequests: Array<{
    url: string;
    type: string;
    transferSize: number;
    responseHeaders?: Record<string, string>;
    initiatorType?: string;
  }>,
  htmlContent: string,
  linkUrls: string[],
  fontFaceData?: Array<{ family: string; src: string; display: string; weight: string; style: string }>,
  fontFaceFromCss?: Record<string, { family: string; display: string; weight: string; style: string }>,
): FontAnalysisReport {

  // Find font network requests
  const fontRequests = networkRequests.filter(r =>
    r.type === 'font' || r.type === 'fonts' ||
    r.url.match(/\.(woff2?|ttf|otf|eot)(\?|$)/i) ||
    r.url.includes('fonts.gstatic.com') ||
    r.url.includes('typekit.net')
  );

  // Priority 1: fontFaceFromCss — parsed from actual CSS responses (no CORS restriction)
  const cssMap = new Map(Object.entries(fontFaceFromCss ?? {}));

  // Priority 2: fontFaceData — from browser CSS API (may be empty due to CORS)
  const urlFamilyMap = new Map<string, { family: string; display: string; weight: string; style: string }>();
  if (fontFaceData?.length) {
    for (const face of fontFaceData) {
      const urlMatches = face.src.matchAll(/url\(['"]?([^'")\s]+)['"]?\)/g);
      for (const m of urlMatches) {
        const urlKey = m[1].split('?')[0].split('/').pop() ?? '';
        if (urlKey) urlFamilyMap.set(urlKey, face);
        urlFamilyMap.set(m[1].split('?')[0], face);
      }
    }
  }

  // Check preloads
  const preloadedUrls = new Set<string>();
  const preloadMatches = htmlContent.matchAll(/<link[^>]+rel=["']preload["'][^>]+as=["']font["'][^>]*>/gi);
  for (const match of preloadMatches) {
    const hrefMatch = match[0].match(/href=["']([^"']+)["']/);
    if (hrefMatch) preloadedUrls.add(hrefMatch[1]);
  }

  // Check preconnects
  const preconnectedHosts = new Set<string>();
  const preconnectMatches = htmlContent.matchAll(/<link[^>]+rel=["']preconnect["'][^>]*>/gi);
  for (const match of preconnectMatches) {
    const hrefMatch = match[0].match(/href=["']([^"']+)["']/);
    if (hrefMatch) {
      try { preconnectedHosts.add(new URL(hrefMatch[1]).hostname); } catch {}
    }
  }

  // Extract @font-face font-display values
  const displayMap = new Map<string, FontDisplayValue>();
  const fontFaceMatches = htmlContent.matchAll(/@font-face\s*\{([^}]+)\}/gi);
  for (const match of fontFaceMatches) {
    const block = match[1];
    const familyMatch = block.match(/font-family:\s*["']?([^"';]+)["']?/i);
    const displayMatch = block.match(/font-display:\s*(\w+)/i);
    if (familyMatch && displayMatch) {
      displayMap.set(familyMatch[1].trim(), displayMatch[1] as FontDisplayValue);
    }
  }

  const fonts: FontRecord[] = fontRequests.map(req => {
    const format = detectFormat(req.url, req.responseHeaders?.['content-type'] ?? null);
    const { name: provider, isThirdParty } = detectProvider(req.url);
    const isPreloaded = Array.from(preloadedUrls).some(u => req.url.includes(u) || u.includes(req.url));
    let isPreconnected = false;
    try { isPreconnected = preconnectedHosts.has(new URL(req.url).hostname); } catch {}

    // Lookup: CSS response body > CSS API > URL param > URL path
    const urlClean = req.url.split('?')[0];
    const urlFilename = urlClean.split('/').pop() ?? '';
    const cssMatch = cssMap.get(urlFilename) ?? cssMap.get(urlClean)
      ?? urlFamilyMap.get(urlClean) ?? urlFamilyMap.get(urlFilename);

    const familyFromParam = req.url.match(/family=([^:&+]+)/i)?.[1]?.replace(/\+/g, ' ');
    const familyFromPath = req.url.match(/\/fonts?\/([a-z][a-z0-9-]{3,})\//i)?.[1]
      ?? req.url.match(/\/([a-z][a-z0-9]{3,}-[a-z][a-z0-9-]+)\.(woff2?|ttf|otf)/i)?.[1];

    const rawFamily = cssMatch?.family
      ? cssMatch.family
      : familyFromParam
        ? decodeURIComponent(familyFromParam)
        : familyFromPath
          ? familyFromPath.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
          : 'Unknown';

    // Filter generic/obfuscated names from any source (CSS, URL, etc.)
    const GENERIC_NAMES = new Set(['family', 'random', 'font', 'fonts', 'web', 'test', 'base', 'css', 'static', 'icon', 'icons', 'text', 'body', 'heading', 'sans', 'serif', 'mono']);
    const family = rawFamily === 'Unknown' || GENERIC_NAMES.has(rawFamily.toLowerCase()) || /^random\d+$/i.test(rawFamily) || rawFamily.length <= 2
      ? 'Unknown'
      : rawFamily;

    const cssDisplay = cssMatch?.display as FontDisplayValue | undefined;
    const fontDisplay: FontDisplayValue = cssDisplay ?? displayMap.get(family) ?? (req.url.includes('display=swap') ? 'swap' : 'auto');
    const weight = cssMatch?.weight ?? req.url.match(/[,:](\d{3})/)?.[1] ?? '400';
    const style = cssMatch?.style ?? (req.url.includes('ital') ? 'italic' : 'normal');
    const isVariableFont = !!(cssMatch?.weight?.includes(' ') || req.url.includes('ital,wght') || req.url.includes('wght@'));
    const unicodeRange = req.url.match(/subset=([^&]+)/i)?.[1] ?? null;
    const subsetsDetected = detectSubsets(req.url, unicodeRange);

    const loadStrategy: FontLoadStrategy = isPreloaded
      ? 'preloaded'
      : isPreconnected
        ? 'preconnected'
        : provider ? 'standard' : 'standard';

    const partial = {
      family,
      url: req.url,
      format,
      bytes: req.transferSize ?? 0,
      subsetsDetected,
      isVariableFont,
      fontDisplay,
      isPreloaded,
      isPreconnected,
      isSelfHosted: !isThirdParty,
      provider: provider ?? null,
      loadStrategy,
      unicodeRange,
      weight,
      style,
      issues: [] as string[],
    };

    const recommendations = buildFontRecommendations(partial);

    const issues: string[] = [];
    if (format !== 'woff2') issues.push('not-woff2');
    if (fontDisplay === 'block') issues.push('foit-risk');
    if (!isPreloaded && isThirdParty) issues.push('third-party-unpreloaded');
    if (subsetsDetected.includes('full') && partial.bytes > 100_000) issues.push('not-subsetted');

    return { ...partial, issues, recommendations };
  });

  // Resolve 'Unknown' font names from binary metadata (fontkit)
  // Only for fonts with actual bytes to avoid fetching zero-byte entries
  const unknownFonts = fonts.filter(f => f.family === 'Unknown' && f.bytes > 0);
  if (unknownFonts.length > 0) {
    await Promise.allSettled(
      unknownFonts.map(async f => {
        const name = await resolveFontNameFromBinary(f.url);
        if (name) f.family = name;
      })
    );
  }

  const totalBytes = fonts.reduce((s, f) => s + f.bytes, 0);
  const thirdPartyFonts = fonts.filter(f => !f.isSelfHosted).length;

  const providers: Record<string, number> = {};
  for (const f of fonts) {
    const p = f.provider ?? 'Self-hosted';
    providers[p] = (providers[p] ?? 0) + 1;
  }

  const foutRisk = fonts.some(f => f.fontDisplay === 'swap');
  const foitRisk = fonts.some(f => f.fontDisplay === 'block' || f.fontDisplay === 'auto');
  const renderBlockingFonts = fonts.filter(f => f.loadStrategy === 'render-blocking').length;

  const allRecs: FontRecommendation[] = fonts.flatMap(f => f.recommendations);

  // Score
  let score = 100;
  if (foitRisk) score -= 20;
  const nonWoff2 = fonts.filter(f => f.format !== 'woff2' && f.format !== 'unknown').length;
  score -= nonWoff2 * 8;
  score -= thirdPartyFonts * 5;
  score -= (fonts.length - fonts.filter(f => f.isPreloaded).length) * 3;
  score = Math.max(0, Math.min(100, score));

  const grades = ['F', 'F', 'E', 'E', 'D', 'D', 'C', 'B', 'B', 'A', 'A+'];
  const grade = grades[Math.round(score / 10)] ?? 'F';

  const CO2_PER_BYTE = 0.00000006;

  return {
    totalFonts: fonts.length,
    totalBytes,
    thirdPartyFonts,
    selfHostedFonts: fonts.filter(f => f.isSelfHosted).length,
    woff2Count: fonts.filter(f => f.format === 'woff2').length,
    legacyFormatCount: fonts.filter(f => ['ttf', 'otf', 'eot', 'woff'].includes(f.format)).length,
    hasGoogleFonts: fonts.some(f => f.provider === 'Google Fonts'),
    hasAdobeFonts: fonts.some(f => f.provider === 'Adobe Fonts'),
    foutRisk,
    foitRisk,
    renderBlockingFonts,
    preloadedFonts: fonts.filter(f => f.isPreloaded).length,
    fonts,
    providers,
    score,
    grade,
    carbonEstimate: { totalCo2G: totalBytes * CO2_PER_BYTE },
    recommendations: allRecs.slice(0, 10),
  };
}
