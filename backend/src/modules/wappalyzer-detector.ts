/**
 * Wappalyzer-compatible technology detector
 * Uses the official Wappalyzer technology database (2520+ technologies, 96 categories)
 * Supports all detection vectors: headers, cookies, html, meta, scriptSrc, js, xhr, dns, certIssuer, dom, url
 * Supports version extraction via \;version:\N pattern
 * Supports confidence scoring, implies chains, and exclusions
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createModuleLogger } from '../utils/logger.js';
import type { TechnologyMatch, ThirdPartyProvider } from '../types/index.js';
import { THIRD_PARTY_DOMAINS } from './tech-patterns.js';

const logger = createModuleLogger('wappalyzer-detector');
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../data/wappalyzer');

// ─────────────────────────────────────────────────────────────────────────────
// Types matching the Wappalyzer JSON schema
// ─────────────────────────────────────────────────────────────────────────────

interface WapTech {
  cats?: number[];
  website?: string;
  icon?: string;
  description?: string;
  pricing?: string[];
  saas?: boolean;
  oss?: boolean;
  cpe?: string;

  // Detection vectors
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  html?: string | string[];
  meta?: Record<string, string>;
  scriptSrc?: string | string[];
  js?: Record<string, string>;
  xhr?: string | string[];
  dom?: string | Record<string, { attributes?: Record<string, string>; text?: string; exists?: string }>;
  dns?: Record<string, string | string[]>;
  certIssuer?: string;
  url?: string;
  text?: string | string[];
  robots?: string;
  css?: string | string[];

  implies?: string | string[];
  excludes?: string | string[];
  requires?: string | string[];
  requiresCategory?: number | number[];
}

interface WapCategory {
  name: string;
  priority: number;
  groups?: number[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Load all data at startup
// ─────────────────────────────────────────────────────────────────────────────

let _technologies: Record<string, WapTech> | null = null;
let _categories: Record<string, WapCategory> | null = null;

// Compiled pattern cache: pattern string → { regex, confidence, version }
interface CompiledPattern {
  regex: RegExp;
  confidence: number;
  versionGroup?: string; // e.g. "1" → capture group index
  versionStr?: string;   // e.g. "\\1" template
}

const _compiledCache = new Map<string, CompiledPattern | null>();

function loadData() {
  if (_technologies) return;
  try {
    const cats = JSON.parse(readFileSync(join(DATA_DIR, 'categories.json'), 'utf-8')) as Record<string, WapCategory>;
    _categories = cats;

    const techs: Record<string, WapTech> = {};
    for (const fname of readdirSync(DATA_DIR)) {
      if (!fname.endsWith('.json') || fname === 'categories.json' || fname === 'groups.json') continue;
      const chunk = JSON.parse(readFileSync(join(DATA_DIR, fname), 'utf-8')) as Record<string, WapTech>;
      Object.assign(techs, chunk);
    }
    _technologies = techs;
    logger.info({ count: Object.keys(techs).length }, 'Wappalyzer tech DB loaded');
  } catch (err) {
    logger.error({ err }, 'Failed to load Wappalyzer data');
    _technologies = {};
    _categories = {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern compilation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wappalyzer pattern format:
 *   "pattern\\;confidence:75\\;version:\\1"
 * The part before \; is the regex. The rest are key:value attributes.
 */
function compilePattern(raw: string): CompiledPattern | null {
  const cached = _compiledCache.get(raw);
  if (cached !== undefined) return cached;

  try {
    const parts = raw.split('\\;');
    const regexStr = parts[0];
    let confidence = 100;
    let versionStr: string | undefined;

    for (let i = 1; i < parts.length; i++) {
      const [key, ...valParts] = parts[i].split(':');
      const val = valParts.join(':');
      if (key === 'confidence') confidence = parseInt(val) || 100;
      if (key === 'version') versionStr = val;
    }

    if (!regexStr) {
      const result: CompiledPattern = { regex: /(?:)/, confidence, versionStr };
      _compiledCache.set(raw, result);
      return result;
    }

    const regex = new RegExp(regexStr, 'i');
    const result: CompiledPattern = { regex, confidence, versionStr };
    _compiledCache.set(raw, result);
    return result;
  } catch {
    _compiledCache.set(raw, null);
    return null;
  }
}

function extractVersion(match: RegExpMatchArray, versionStr: string | undefined): string | undefined {
  if (!versionStr || !match) return undefined;
  // Replace \1, \2, etc. with capture groups
  let version = versionStr.replace(/\\(\d)/g, (_, n) => match[parseInt(n)] ?? '');
  version = version.replace(/\\;.*$/, '').trim();
  return version || undefined;
}

function testPattern(raw: string, input: string): { matched: boolean; confidence: number; version?: string } {
  if (!input) return { matched: false, confidence: 0 };

  // Empty pattern = just presence check
  if (!raw) return { matched: true, confidence: 100 };

  const compiled = compilePattern(raw);
  if (!compiled) return { matched: false, confidence: 0 };

  const match = input.match(compiled.regex);
  if (!match) return { matched: false, confidence: 0 };

  return {
    matched: true,
    confidence: compiled.confidence,
    version: extractVersion(match, compiled.versionStr),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Input type for detection
// ─────────────────────────────────────────────────────────────────────────────

export interface WapDetectionInput {
  url: string;
  headers: Record<string, string>;         // response headers (lowercase keys)
  cookies: Array<{ name: string; value: string; domain: string }>;
  htmlContent: string;                     // full page HTML
  scriptUrls: string[];                    // all <script src="..."> URLs
  metaTags: Array<{ name: string; content: string; property?: string }>;
  jsGlobals: Record<string, unknown>;      // window.* presence
  networkRequests: Array<{ url: string; type: string; transferSize: number }>;
  cssClasses: string[];
  dnsNs?: string[];
  dnsTxt?: string[];
  dnsCname?: string;
  dnsSoa?: string;
  dnsMx?: string[];
  certIssuer?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Detection result accumulator
// ─────────────────────────────────────────────────────────────────────────────

interface Detection {
  name: string;
  confidence: number;
  version?: string;
  detectedVia: Set<string>;
  cats: number[];
  website?: string;
  icon?: string;
  description?: string;
  saas?: boolean;
  oss?: boolean;
  cpe?: string;
  pricing?: string[];
  implies: string[];
  excludes: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main detector class
// ─────────────────────────────────────────────────────────────────────────────

export class WappalyzerDetector {
  constructor() {
    loadData();
  }

  detect(input: WapDetectionInput): TechnologyMatch[] {
    const techs = _technologies!;
    const detections = new Map<string, Detection>();

    const merge = (name: string, conf: number, via: string, version?: string) => {
      const tech = techs[name];
      if (!tech) return;
      const existing = detections.get(name);
      if (existing) {
        existing.confidence = Math.min(100, Math.max(existing.confidence, conf));
        existing.detectedVia.add(via);
        if (version && !existing.version) existing.version = version;
      } else {
        detections.set(name, {
          name,
          confidence: conf,
          version,
          detectedVia: new Set([via]),
          cats: tech.cats ?? [],
          website: tech.website,
          icon: tech.icon,
          description: tech.description,
          saas: tech.saas,
          oss: tech.oss,
          cpe: tech.cpe,
          pricing: tech.pricing,
          implies: toArray(tech.implies),
          excludes: toArray(tech.excludes),
        });
      }
    };

    // Pre-compute lookups for efficiency
    const headerMap = input.headers;
    const cookieMap = new Map<string, string>();
    for (const c of input.cookies) cookieMap.set(c.name.toLowerCase(), c.value);

    // ── 1. HTTP Headers ───────────────────────────────────────────────────
    for (const [techName, tech] of Object.entries(techs)) {
      if (!tech.headers) continue;
      for (const [headerName, pattern] of Object.entries(tech.headers)) {
        const headerVal = headerMap[headerName.toLowerCase()];
        if (headerVal === undefined) continue;
        const r = testPattern(pattern, headerVal);
        if (r.matched) merge(techName, r.confidence, 'headers', r.version);
      }
    }

    // ── 2. Cookies ────────────────────────────────────────────────────────
    for (const [techName, tech] of Object.entries(techs)) {
      if (!tech.cookies) continue;
      for (const [cookieName, pattern] of Object.entries(tech.cookies)) {
        const cookieVal = cookieMap.get(cookieName.toLowerCase());
        if (cookieVal === undefined) continue;
        const r = testPattern(pattern, cookieVal);
        if (r.matched) merge(techName, r.confidence, 'cookies', r.version);
      }
    }

    // ── 3. HTML source ────────────────────────────────────────────────────
    const html = input.htmlContent;
    for (const [techName, tech] of Object.entries(techs)) {
      if (!tech.html) continue;
      for (const pattern of toArray(tech.html)) {
        const r = testPattern(pattern, html);
        if (r.matched) { merge(techName, r.confidence, 'html', r.version); break; }
      }
    }

    // ── 4. Meta tags ──────────────────────────────────────────────────────
    const metaMap = new Map<string, string>();
    for (const m of input.metaTags) {
      if (m.name) metaMap.set(m.name.toLowerCase(), m.content);
      if (m.property) metaMap.set(m.property.toLowerCase(), m.content);
    }
    for (const [techName, tech] of Object.entries(techs)) {
      if (!tech.meta) continue;
      for (const [metaName, pattern] of Object.entries(tech.meta)) {
        const metaVal = metaMap.get(metaName.toLowerCase());
        if (metaVal === undefined) continue;
        const r = testPattern(pattern, metaVal);
        if (r.matched) merge(techName, r.confidence, 'meta', r.version);
      }
    }

    // ── 5. Script URLs ────────────────────────────────────────────────────
    const allScriptUrls = input.scriptUrls.join('\n');
    for (const [techName, tech] of Object.entries(techs)) {
      if (!tech.scriptSrc) continue;
      for (const pattern of toArray(tech.scriptSrc)) {
        const r = testPattern(pattern, allScriptUrls);
        if (r.matched) { merge(techName, r.confidence, 'script-src', r.version); break; }
      }
    }

    // ── 6. JavaScript globals ─────────────────────────────────────────────
    for (const [techName, tech] of Object.entries(techs)) {
      if (!tech.js) continue;
      for (const [globalPath, pattern] of Object.entries(tech.js)) {
        const value = resolveGlobalPath(input.jsGlobals, globalPath);
        if (value === undefined) continue;
        const strVal = typeof value === 'string' ? value :
          typeof value === 'number' ? String(value) :
          typeof value === 'boolean' ? String(value) : '';
        const r = testPattern(pattern, strVal || '');
        if (r.matched) { merge(techName, r.confidence, 'js', r.version); break; }
      }
    }

    // ── 7. XHR / network requests ─────────────────────────────────────────
    const xhrUrls = input.networkRequests
      .filter(r => r.type === 'xhr' || r.type === 'fetch')
      .map(r => r.url)
      .join('\n');
    for (const [techName, tech] of Object.entries(techs)) {
      if (!tech.xhr) continue;
      for (const pattern of toArray(tech.xhr)) {
        const r = testPattern(pattern, xhrUrls);
        if (r.matched) { merge(techName, r.confidence, 'xhr', r.version); break; }
      }
    }

    // ── 8. URL ───────────────────────────────────────────────────────────
    for (const [techName, tech] of Object.entries(techs)) {
      if (!tech.url) continue;
      const r = testPattern(tech.url, input.url);
      if (r.matched) merge(techName, r.confidence, 'url', r.version);
    }

    // ── 9. DOM selectors ─────────────────────────────────────────────────
    for (const [techName, tech] of Object.entries(techs)) {
      if (!tech.dom) continue;
      if (typeof tech.dom === 'string') {
        // CSS selector string - check if selector substring appears in HTML
        const selector = tech.dom.replace(/\[.*?\]/g, '').trim();
        if (selector && html.toLowerCase().includes(selector.toLowerCase().split('[')[0])) {
          // Do a more careful check via attribute patterns in HTML
          const r = testPattern(selectorToHtmlPattern(tech.dom), html);
          if (r.matched) merge(techName, r.confidence, 'dom', r.version);
        }
      } else if (typeof tech.dom === 'object') {
        for (const [selector, checks] of Object.entries(tech.dom)) {
          const pat = selectorToHtmlPattern(selector);
          if (testPattern(pat, html).matched) {
            if (checks.attributes) {
              let matched = false;
              for (const [attr, valPat] of Object.entries(checks.attributes)) {
                const attrPat = `${attr}=["']([^"']*)["']`;
                const m = html.match(new RegExp(attrPat, 'i'));
                if (m) {
                  const r = testPattern(valPat, m[1] ?? '');
                  if (r.matched) { merge(techName, r.confidence, 'dom', r.version); matched = true; break; }
                }
              }
              if (matched) break;
            } else {
              merge(techName, 75, 'dom');
            }
          }
        }
      }
    }

    // ── 10. DNS ──────────────────────────────────────────────────────────
    for (const [techName, tech] of Object.entries(techs)) {
      if (!tech.dns) continue;
      for (const [recordType, pattern] of Object.entries(tech.dns)) {
        let values: string[] = [];
        switch (recordType.toUpperCase()) {
          case 'NS': values = input.dnsNs ?? []; break;
          case 'TXT': values = input.dnsTxt ?? []; break;
          case 'CNAME': values = input.dnsCname ? [input.dnsCname] : []; break;
          case 'SOA': values = input.dnsSoa ? [input.dnsSoa] : []; break;
          case 'MX': values = input.dnsMx ?? []; break;
        }
        const combined = values.join('\n');
        for (const pat of toArray(pattern)) {
          const r = testPattern(pat, combined);
          if (r.matched) { merge(techName, r.confidence, 'dns', r.version); break; }
        }
      }
    }

    // ── 11. SSL cert issuer ───────────────────────────────────────────────
    if (input.certIssuer) {
      for (const [techName, tech] of Object.entries(techs)) {
        if (!tech.certIssuer) continue;
        const r = testPattern(tech.certIssuer, input.certIssuer);
        if (r.matched) merge(techName, r.confidence, 'cert-issuer', r.version);
      }
    }

    // ── 12. Text (body text search) ───────────────────────────────────────
    for (const [techName, tech] of Object.entries(techs)) {
      if (!tech.text) continue;
      for (const pattern of toArray(tech.text)) {
        const r = testPattern(pattern, html);
        if (r.matched) { merge(techName, r.confidence, 'text', r.version); break; }
      }
    }

    // ── Resolve implies chains ────────────────────────────────────────────
    const impliedNames = new Set<string>();
    const resolveImplies = (techName: string, depth = 0) => {
      if (depth > 5) return;
      const det = detections.get(techName);
      if (!det) return;
      for (const implied of det.implies) {
        const cleanName = implied.replace(/\\;.*$/, '').trim();
        if (!detections.has(cleanName) && !impliedNames.has(cleanName)) {
          impliedNames.add(cleanName);
          merge(cleanName, Math.round(det.confidence * 0.9), 'implied-by:' + techName);
          resolveImplies(cleanName, depth + 1);
        }
      }
    };
    for (const name of detections.keys()) resolveImplies(name);

    // ── Apply exclusions ──────────────────────────────────────────────────
    for (const [name, det] of detections) {
      for (const excluded of det.excludes) {
        const cleanExcluded = excluded.replace(/\\;.*$/, '').trim();
        detections.delete(cleanExcluded);
      }
    }

    // ── Build final results ───────────────────────────────────────────────
    const results: TechnologyMatch[] = [];
    for (const [name, det] of detections) {
      if (det.confidence < 25) continue; // filter very low confidence

      // Multi-signal boost
      const signalCount = det.detectedVia.size;
      const boosted = Math.min(100, det.confidence + (signalCount - 1) * 3);

      const category = this.getCategorySlug(det.cats[0]);
      const gdprCategory = this.getGdprCategory(det.cats, det.saas);

      results.push({
        name,
        slug: slugify(name),
        version: det.version,
        confidence: boosted,
        category,
        detectedVia: [...det.detectedVia],
        website: det.website,
        isTracking: [10, 36, 42, 77, 83, 86].includes(det.cats[0] ?? -1),
        gdprCategory,
      });
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  /** Map Wappalyzer category ID → our slug */
  getCategorySlug(catId?: number): string {
    if (!catId || !_categories) return 'other';
    const CAT_MAP: Record<number, string> = {
      1: 'cms', 2: 'forum', 3: 'database', 4: 'documentation',
      5: 'widgets', 6: 'ecommerce', 7: 'photo-gallery', 8: 'wiki',
      9: 'hosting-panel', 10: 'analytics', 11: 'blog', 12: 'js-framework',
      13: 'issue-tracker', 14: 'video', 15: 'comments', 16: 'security',
      17: 'fonts', 18: 'web-framework', 19: 'miscellaneous', 20: 'editor',
      21: 'lms', 22: 'web-server', 23: 'cache', 24: 'rich-text-editor',
      25: 'js-graphics', 26: 'mobile-framework', 27: 'programming-language',
      28: 'os', 29: 'search', 30: 'webmail', 31: 'cdn', 32: 'marketing',
      33: 'web-server-extension', 34: 'database', 35: 'maps', 36: 'advertising',
      37: 'network', 38: 'media-server', 41: 'payment', 42: 'tag-manager',
      44: 'ci', 51: 'page-builder', 52: 'chat', 53: 'crm', 54: 'seo',
      57: 'ssg', 59: 'js-library', 62: 'paas', 63: 'iaas',
      64: 'reverse-proxy', 65: 'load-balancer', 66: 'ui-framework',
      67: 'cookie-compliance', 68: 'accessibility', 69: 'auth',
      70: 'tls-ca', 71: 'affiliate', 74: 'ab-testing', 75: 'email',
      76: 'personalisation', 77: 'retargeting', 78: 'rum', 79: 'geolocation',
      80: 'wordpress-theme', 81: 'shopify-theme', 82: 'drupal-theme',
      83: 'fingerprinting', 84: 'loyalty', 85: 'feature-flags',
      86: 'segmentation', 87: 'wordpress-plugin', 88: 'hosting',
      89: 'translation', 90: 'reviews', 91: 'bnpl', 92: 'performance',
      93: 'reservations', 94: 'referral', 95: 'dam', 97: 'cdp',
      98: 'cart-abandonment', 99: 'shipping',
    };
    return CAT_MAP[catId] ?? _categories[String(catId)]?.name?.toLowerCase().replace(/\s+/g, '-') ?? 'other';
  }

  getCategoryName(catId?: number): string {
    if (!catId || !_categories) return 'Other';
    return _categories[String(catId)]?.name ?? 'Other';
  }

  private getGdprCategory(cats: number[], saas?: boolean): 'essential' | 'functional' | 'tracking' | 'advertising' | undefined {
    const trackingCats = [10, 36, 42, 77, 83, 86, 98]; // analytics, advertising, tag managers, retargeting, fingerprinting, segmentation, cart abandonment
    const advertisingCats = [36, 77, 71]; // advertising, retargeting, affiliate
    const functionalCats = [52, 53, 72, 73, 75, 76, 89, 90, 93]; // chat, crm, appointment, surveys, email, personalisation, translation, reviews, reservations
    const essentialCats = [6, 16, 41, 69, 22, 23, 31, 64, 65]; // ecommerce, security, payment, auth, web-server, cache, cdn, reverse-proxy, lb

    for (const c of cats) {
      if (advertisingCats.includes(c)) return 'advertising';
    }
    for (const c of cats) {
      if (trackingCats.includes(c)) return 'tracking';
    }
    for (const c of cats) {
      if (functionalCats.includes(c)) return 'functional';
    }
    for (const c of cats) {
      if (essentialCats.includes(c)) return 'essential';
    }
    return undefined;
  }

  /** Build tech summary object from detected technologies */
  buildSummary(detected: TechnologyMatch[]): {
    cms?: string; framework?: string; language?: string; server?: string;
    hosting?: string; cdn?: string; analytics: string[]; tagManagers: string[];
    chatWidgets: string[]; errorTracking: string[]; abTesting: string[];
  } {
    const find = (categories: string[]) =>
      detected.find(t => categories.includes(t.category))?.name;

    return {
      cms: find(['cms', 'blog', 'wiki', 'page-builder']),
      framework: find(['js-framework', 'web-framework', 'mobile-framework']),
      language: find(['programming-language']),
      server: find(['web-server', 'reverse-proxy']),
      hosting: find(['hosting', 'paas', 'iaas', 'hosting-panel']),
      cdn: find(['cdn']),
      analytics: detected.filter(t => t.category === 'analytics').map(t => t.name),
      tagManagers: detected.filter(t => t.category === 'tag-manager').map(t => t.name),
      chatWidgets: detected.filter(t => t.category === 'chat').map(t => t.name),
      errorTracking: detected.filter(t => ['rum', 'performance'].includes(t.category)).map(t => t.name),
      abTesting: detected.filter(t => t.category === 'ab-testing').map(t => t.name),
    };
  }

  /** Detect third-party providers from network requests */
  detectThirdParties(
    requests: Array<{ url: string; transferSize: number; mainThreadTime?: number; blockingTime?: number }>,
    firstPartyDomain: string,
    cookies: Array<{ name: string; domain: string }>,
  ): ThirdPartyProvider[] {
    const byProvider = new Map<string, {
      name: string; category: string;
      gdprCategory: 'essential' | 'functional' | 'tracking' | 'advertising';
      privacySafeAlternative?: string;
      requestCount: number; transferSize: number; mainThreadTime: number; blockingTime: number;
      domains: Set<string>;
    }>();

    for (const req of requests) {
      let domain: string;
      try { domain = new URL(req.url).hostname; } catch { continue; }
      if (domain === firstPartyDomain || domain.endsWith(`.${firstPartyDomain}`)) continue;

      // Check known third-party domains
      let matched = THIRD_PARTY_DOMAINS[domain];
      if (!matched) {
        const parts = domain.split('.');
        if (parts.length > 2) matched = THIRD_PARTY_DOMAINS[parts.slice(-2).join('.')];
      }
      if (!matched) continue;

      const key = matched.name;
      const ex = byProvider.get(key);
      if (ex) {
        ex.requestCount++; ex.transferSize += req.transferSize;
        ex.mainThreadTime += req.mainThreadTime ?? 0; ex.blockingTime += req.blockingTime ?? 0;
        ex.domains.add(domain);
      } else {
        byProvider.set(key, {
          name: matched.name, category: matched.category,
          gdprCategory: matched.gdprCategory, privacySafeAlternative: matched.privacySafeAlternative,
          requestCount: 1, transferSize: req.transferSize,
          mainThreadTime: req.mainThreadTime ?? 0, blockingTime: req.blockingTime ?? 0,
          domains: new Set([domain]),
        });
      }
    }

    return [...byProvider.values()].map(p => ({
      name: p.name, category: p.category, domains: [...p.domains],
      requestCount: p.requestCount, transferSize: p.transferSize,
      mainThreadTime: p.mainThreadTime, blockingTime: p.blockingTime,
      co2Grams: Math.round((p.transferSize / (1024 ** 3)) * 0.194 * 442 * 10000) / 10000,
      gdprCategory: p.gdprCategory,
      cookiesDropped: cookies
        .filter(c => [...p.domains].some(d => c.domain === d || c.domain.endsWith(`.${d}`)))
        .map(c => c.name).filter((v, i, a) => a.indexOf(v) === i),
      privacySafeAlternative: p.privacySafeAlternative,
    })).sort((a, b) => b.transferSize - a.transferSize);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function toArray(val: string | string[] | undefined): string[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Resolve a dotted path like "jQuery.fn.jquery" in a globals object */
function resolveGlobalPath(globals: Record<string, unknown>, path: string): unknown {
  // First check if top-level key exists (common case)
  const topKey = path.split('.')[0];
  if (globals[topKey] === undefined && globals[topKey] === null) return undefined;

  // For simple keys, just return if present
  if (!path.includes('.')) {
    const v = globals[path];
    // If it's our {present: true, version: "..."} wrapper, extract the value
    if (v && typeof v === 'object' && 'present' in (v as object)) {
      const wrapped = v as { present: boolean; version?: string; value?: string };
      return wrapped.version ?? wrapped.value ?? '';
    }
    return v !== undefined ? '' : undefined; // presence = empty string to trigger empty-pattern match
  }

  // Try to resolve nested path
  const parts = path.split('.');
  let current: unknown = globals;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Convert a CSS selector to a rough HTML regex pattern for pre-filter matching.
 * This is a best-effort heuristic - axe/querySelector would be more accurate
 * but we don't have DOM access at this point.
 */
function selectorToHtmlPattern(selector: string): string {
  // Extract tag, id, class, attribute patterns
  const parts: string[] = [];

  // Attribute selector [attr="val"] or [attr*="val"] etc.
  const attrMatches = selector.match(/\[([^\]]+)\]/g) ?? [];
  for (const attrSel of attrMatches) {
    const inner = attrSel.slice(1, -1);
    // [attr] → just presence
    // [attr="val"] → attribute with value
    // [attr*="val"] → contains
    // [attr^="val"] → starts with
    const m = inner.match(/^([^=*^$~|]+)(?:[*^$~|]?=["']([^"']+)["'])?$/);
    if (m) {
      if (m[2]) {
        parts.push(`${m[1]}=["'][^"']*${escapeRegex(m[2])}[^"']*["']`);
      } else {
        parts.push(m[1]);
      }
    }
  }

  // Tag name
  const tagMatch = selector.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
  if (tagMatch) {
    parts.unshift(`<${tagMatch[1]}`);
  }

  return parts.length > 0 ? parts.join('.*') : selector;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Export singleton
export const wappalyzerDetector = new WappalyzerDetector();
