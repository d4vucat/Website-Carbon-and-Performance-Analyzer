import { chromium, type Browser, type BrowserContext } from 'playwright';
import { createModuleLogger } from '../utils/logger.js';
import type { AxeViolation, WebAppManifest, ServiceWorkerInfo } from '../types/index.js';
import { acquireContext, isBrowserbaseEnabled } from './browser-pool.js';
import { applyDeviceEmulation, buildContextOptions, DEVICE_PROFILES } from './device-emulator.js';
import { profileJsExecution, profileJsExecutionFromCdp } from './js-profiler.js';
import type { DeviceProfile } from './device-emulator.js';

const logger = createModuleLogger('browser-analyzer');

export interface BrowserAnalysisResult {
  finalUrl: string;
  networkRequests: NetworkReq[];
  jsGlobals: Record<string, unknown>;
  cookies: CookieData[];
  localStorageKeys: string[];
  sessionStorageKeys: string[];
  consoleMessages: Array<{ type: string; text: string }>;
  screenshots: { desktop?: string; mobile?: string };
  cssClasses: string[];
  cssCustomProperties: string[];
  accessibility: A11yResult;
  pwa: PWAResult;
  jsCoverage?: Coverage;
  cssCoverage?: Coverage;
  longTasks: Array<{ duration: number; attribution?: string }>;
  webVitals: Record<string, number>;
  indexedDbDatabases: string[];
  hasWebSockets: boolean;
  hasWasm: boolean;
  hasWebWorkers: boolean;
  scriptUrls: string[];
  linkUrls: string[];
  metaTags: Array<{ name: string; content: string; property?: string }>;
  htmlContent: string;
  domSize: number;
  resourceBreakdown: ResourceBreakdownMap;
}

export interface NetworkReq {
  url: string; type: string; method: string; status: number;
  fromCache: boolean; transferSize: number; decodedSize: number;
  contentEncoding?: string; compressionRatio?: number; cacheControl?: string;
  domain: string; isThirdParty: boolean; isCdn: boolean;
  timing: { startTime: number; ttfb?: number; downloadTime?: number; totalDuration: number };
}
interface CookieData {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: string;
  expires?: number;
  // Enhanced audit fields
  size: number;
  isSession: boolean;
  isThirdParty: boolean;
  prefix: '' | '__Secure-' | '__Host-' | '__Http-' | '__Host-Http-';
  prefixValid: boolean;
  prefixIssues: string[];
  classification: 'essential' | 'functional' | 'tracking' | 'advertising' | 'unknown';
  securityScore: number;
  securityIssues: string[];
  technology?: string;
  category?: string;
  partitioned: boolean;
}
interface A11yResult { violations: AxeViolation[]; passes: number; incomplete: number; inapplicable: number }
interface PWAResult { hasServiceWorker: boolean; serviceWorker?: ServiceWorkerInfo; hasManifest: boolean; manifest?: WebAppManifest; isInstallable: boolean; installabilityChecks: Record<string, boolean> }
interface Coverage { totalBytes: number; usedBytes: number; unusedBytes: number }
interface RS { count: number; transferSize: number; decodedSize: number }
interface ResourceBreakdownMap { html: RS; javascript: RS; css: RS; images: RS; fonts: RS; video: RS; xhr: RS; other: RS; total: RS }

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-infobars',
        '--window-size=1440,900',
        '--start-maximized',
        '--lang=en-US,en',
      ],
    });
  }
  return browserInstance;
}

// Stealth init script — hides headless/automation signals from bot-protection systems
const STEALTH_INIT_SCRIPT = `
(function () {
  // Override webdriver
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

  // Override plugins to look like a real browser
  const makePlugin = (name, filename, mimeTypes) => {
    const plugin = Object.create(Plugin.prototype);
    Object.defineProperty(plugin, 'name', { get: () => name });
    Object.defineProperty(plugin, 'filename', { get: () => filename });
    Object.defineProperty(plugin, 'description', { get: () => '' });
    Object.defineProperty(plugin, 'length', { get: () => mimeTypes.length });
    mimeTypes.forEach((mt, i) => {
      const mime = Object.create(MimeType.prototype);
      Object.defineProperty(mime, 'type', { get: () => mt });
      plugin[i] = mime;
    });
    return plugin;
  };
  try {
    const pluginArray = Object.create(PluginArray.prototype);
    const plugins = [
      makePlugin('PDF Viewer', 'internal-pdf-viewer', ['application/pdf', 'text/pdf']),
      makePlugin('Chrome PDF Viewer', 'internal-pdf-viewer', ['application/pdf', 'text/pdf']),
      makePlugin('Chromium PDF Viewer', 'internal-pdf-viewer', ['application/pdf', 'text/pdf']),
    ];
    plugins.forEach((p, i) => { pluginArray[i] = p; });
    Object.defineProperty(pluginArray, 'length', { get: () => plugins.length });
    Object.defineProperty(navigator, 'plugins', { get: () => pluginArray });
  } catch {}

  // Override languages
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

  // Override hardware concurrency
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });

  // Override device memory
  Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });

  // Chrome object (missing in raw headless)
  if (!window.chrome) {
    window.chrome = {
      runtime: {},
      loadTimes: function() { return {}; },
      csi: function() { return {}; },
    };
  }

  // Permissions
  const originalQuery = window.navigator.permissions?.query?.bind(navigator.permissions);
  if (originalQuery) {
    window.navigator.permissions.query = (parameters) => {
      if (parameters.name === 'notifications') {
        return Promise.resolve({ state: Notification.permission, onchange: null });
      }
      return originalQuery(parameters);
    };
  }
})();
`;

export async function analyzeBrowser(
  url: string,
  options: {
    includeScreenshot?: boolean;
    includeAccessibility?: boolean;
    waitAfterLoad?: number;
    viewport?: { width: number; height: number };
    device?: DeviceProfile;
    includeJsProfile?: boolean;
  } = {},
): Promise<BrowserAnalysisResult> {
  const deviceProfile = options.device ?? 'desktop-fast';
  const contextOpts = buildContextOptions(deviceProfile) ?? {};

  // Override viewport if explicitly provided
  if (options.viewport) contextOpts.viewport = options.viewport;

  const { context, release, isBrowserbase } = await acquireContext(contextOpts);
  try {
    // When using Browserbase: skip local stealth injection — Browserbase handles
    // fingerprinting, TLS JA3/JA4 signatures, and residential proxy routing itself.
    // Injecting our own stealth script on top can actually interfere with theirs.
    if (!isBrowserbase) {
      await context.addInitScript(STEALTH_INIT_SCRIPT);
    }

    // Set realistic HTTP headers (applies to both local and Browserbase)
    await context.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'Upgrade-Insecure-Requests': '1',
    });

    const page = await context.newPage();

    // Apply CDP-level throttling (CPU + network) for real device emulation
    await applyDeviceEmulation(context, page, deviceProfile);

    const networkRequests: NetworkReq[] = [];
    const consoleMessages: Array<{ type: string; text: string }> = [];
    let hasWebSockets = false;
    const requestMap = new Map<string, { url: string; method: string; startTime: number; resourceType: string }>();

    // Intercept CSS response bodies to extract @font-face (bypasses CORS restriction)
    const fontFaceFromCss = new Map<string, { family: string; display: string; weight: string; style: string }>();

    function parseFontFacesFromCss(css: string): void {
      const blocks = css.matchAll(/@font-face\s*\{([^}]+)\}/gi);
      for (const match of blocks) {
        const block = match[1];
        const familyMatch = block.match(/font-family:\s*["']?([^"';\n]+)["']?/i);
        const displayMatch = block.match(/font-display:\s*(\w+)/i);
        const weightMatch = block.match(/font-weight:\s*([^;\n]+)/i);
        const styleMatch = block.match(/font-style:\s*([^;\n]+)/i);
        const srcMatch = [...block.matchAll(/url\(['"]?([^'")\s]+)['"]?\)/g)];

        if (familyMatch) {
          const family = familyMatch[1].trim();
          const info = {
            family,
            display: displayMatch?.[1] ?? 'auto',
            weight: weightMatch?.[1]?.trim() ?? '400',
            style: styleMatch?.[1]?.trim() ?? 'normal',
          };
          // Map each src URL filename to this font-face
          for (const srcM of srcMatch) {
            const filename = srcM[1].split('?')[0].split('/').pop() ?? '';
            if (filename) fontFaceFromCss.set(filename, info);
            fontFaceFromCss.set(srcM[1].split('?')[0], info);
          }
        }
      }
    }

    page.on('request', r => requestMap.set(r.url(), { url: r.url(), method: r.method(), startTime: Date.now(), resourceType: r.resourceType() }));
    page.on('response', async response => {
      const req = requestMap.get(response.url());
      if (!req) return;
      try {
        const headers = response.headers();
        let transferSize = 0; let decodedSize = 0;
        try {
          const body = await response.body();
          decodedSize = body.length;
          const enc = headers['content-encoding'] ?? '';
          transferSize = enc.includes('br') ? Math.floor(decodedSize * 0.75) : enc.includes('gzip') ? Math.floor(decodedSize * 0.8) : decodedSize;
          const ct = headers['content-type'] ?? '';
          if (ct.includes('css') || response.url().endsWith('.css')) {
            try { parseFontFacesFromCss(body.toString('utf8')); } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
        let domain = '';
        try { domain = new URL(response.url()).hostname; } catch { /* ignore */ }
        const isCached = !!(headers['age'] || headers['x-cache']?.includes('HIT'));
        networkRequests.push({
          url: response.url(), type: classifyResourceType(req.resourceType, headers['content-type'] ?? '', response.url()),
          method: req.method, status: response.status(), fromCache: isCached,
          transferSize, decodedSize, contentEncoding: headers['content-encoding'],
          compressionRatio: decodedSize > 0 ? transferSize / decodedSize : 1,
          cacheControl: headers['cache-control'], domain, isThirdParty: false,
          isCdn: !!(headers['cf-cache-status'] || headers['x-amz-cf-id'] || headers['x-fastly-request-id']),
          timing: { startTime: req.startTime, totalDuration: Date.now() - req.startTime },
        });
      } catch { /* ignore */ }
    });
    page.on('console', m => consoleMessages.push({ type: m.type(), text: m.text() }));
    page.on('websocket', () => { hasWebSockets = true; });

    // ── CDP session: disable cache + bypass SW + track Network events + JS profiling ──
    const cdpSession = await context.newCDPSession(page);
    const cdpImageBytes = new Map<string, number>();
    const cdpImageUrls  = new Map<string, string>();
    let profilerStarted = false;

    try {
      await cdpSession.send('Network.enable');
      await cdpSession.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdpSession.send('Network.setBypassServiceWorker', { bypass: true });

      cdpSession.on('Network.responseReceived', (event: {
        requestId: string; type: string;
        response: { url: string; mimeType: string; headers: Record<string, string> };
      }) => {
        if (event.type === 'Image' || event.response.mimeType?.startsWith('image/') ||
            /\.(jpg|jpeg|png|webp|avif|gif|svg|ico|bmp|jxl)(\?|$)/i.test(event.response.url)) {
          cdpImageUrls.set(event.requestId, event.response.url);
        }
      });

      cdpSession.on('Network.loadingFinished', (event: { requestId: string; encodedDataLength: number }) => {
        if (cdpImageUrls.has(event.requestId)) {
          cdpImageBytes.set(event.requestId, event.encodedDataLength);
        }
      });

      // Start V8 profiler BEFORE navigation to capture full page load JS execution
      if (options.includeJsProfile !== false) {
        try {
          await cdpSession.send('Profiler.enable');
          await cdpSession.send('Profiler.setSamplingInterval', { interval: 100 });
          await cdpSession.send('Profiler.start');
          profilerStarted = true;
        } catch { /* Profiler not available in this context */ }
      }
    } catch { /* CDP setup optional */ }

    await page.coverage.startJSCoverage();
    await page.coverage.startCSSCoverage();
    let navigationError: string | undefined;
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    } catch (navErr: unknown) {
      navigationError = navErr instanceof Error ? navErr.message : String(navErr);
      // Don't throw — continue and collect whatever data is available
      // (timeout errors are common and expected on slow/heavy sites)
    }
    await page.waitForTimeout(options.waitAfterLoad ?? 3000);

    const jsGlobals = await collectJsGlobals(page);
    const htmlContent = await page.content();
    const domSize: number = await page.evaluate(() => document.querySelectorAll('*').length);
    const metaTags: Array<{ name: string; content: string; property?: string }> = await page.evaluate(() =>
      Array.from(document.querySelectorAll('meta')).map(m => ({
        name: m.getAttribute('name') ?? '', content: m.getAttribute('content') ?? '',
        property: m.getAttribute('property') ?? undefined
      })).filter(m => m.content)
    );
    const scriptUrls: string[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll('script[src]')).map(s => s.getAttribute('src') ?? '').filter(Boolean)
    );
    const linkUrls: string[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll('link[href]')).map(l => l.getAttribute('href') ?? '').filter(Boolean)
    );
    const cssClasses: string[] = await page.evaluate(() => {
      const s = new Set<string>();
      document.querySelectorAll('[class]').forEach(el => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).forEach(c => s.add(c)));
      return [...s].slice(0, 2000);
    });
    const cssCustomProperties: string[] = await page.evaluate(() => {
      const props: string[] = [];
      try {
        for (let i = 0; i < document.styleSheets.length; i++) {
          try {
            const sheet = document.styleSheets[i];
            const rules = sheet.cssRules;
            for (let j = 0; j < rules.length; j++) {
              const rule = rules[j] as CSSStyleRule;
              if (rule.selectorText === ':root') {
                for (let k = 0; k < rule.style.length; k++) {
                  const p = rule.style[k];
                  if (p && p.startsWith('--')) props.push(p);
                }
              }
            }
          } catch { /* cross-origin */ }
        }
      } catch { /* ignore */ }
      return props;
    });

    const pwa = await analyzePWA(page);
    const screenshots: { desktop?: string; mobile?: string } = {};
    if (options.includeScreenshot !== false) {
      try { screenshots.desktop = (await page.screenshot({ type: 'jpeg', quality: 75 })).toString('base64'); } catch { /* ignore */ }
    }

    let accessibility: A11yResult = { violations: [], passes: 0, incomplete: 0, inapplicable: 0 };
    if (options.includeAccessibility !== false) {
      try { accessibility = await runAxeCore(page); } catch { /* ignore */ }
    }

    const localStorageKeys: string[] = await page.evaluate(() => Object.keys(localStorage)).catch(() => []);
    const sessionStorageKeys: string[] = await page.evaluate(() => Object.keys(sessionStorage)).catch(() => []);
    const indexedDbDatabases: string[] = await page.evaluate(async () => { try { const d = await indexedDB.databases(); return d.map(db => db.name ?? '').filter(Boolean); } catch { return []; } });
    const hasWasm: boolean = await page.evaluate(() => typeof WebAssembly !== 'undefined');
    const hasWebWorkers: boolean = await page.evaluate(() => typeof Worker !== 'undefined');
    const longTasks: Array<{ duration: number }> = await page.evaluate(() =>
      performance.getEntriesByType('longtask').map(e => ({ duration: e.duration }))
    );
    const webVitals: Record<string, number> = await page.evaluate(() => {
      const v: Record<string, number> = {};
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      if (nav) { v.ttfb = nav.responseStart - nav.requestStart; v.loadTime = nav.loadEventEnd - nav.startTime; }
      performance.getEntriesByType('paint').forEach(e => { if (e.name === 'first-contentful-paint') v.fcp = e.startTime; });
      return v;
    });

    let jsCoverage: Coverage | undefined;
    try {
      const jsCov = await page.coverage.stopJSCoverage();
      let total = 0; let used = 0;
      for (const entry of jsCov) {
        const src = entry.source ?? '';
        total += src.length;
        for (const fn of entry.functions) {
          for (const range of fn.ranges) {
            if (range.count > 0) used += range.endOffset - range.startOffset;
          }
        }
      }
      jsCoverage = { totalBytes: total, usedBytes: used, unusedBytes: total - used };
    } catch { await page.coverage.stopJSCoverage().catch(() => {}); }

    let cssCoverage: Coverage | undefined;
    try {
      const cssCov = await page.coverage.stopCSSCoverage();
      let total = 0; let used = 0;
      for (const entry of cssCov) {
        total += (entry.text ?? '').length;
        for (const r of entry.ranges) used += r.end - r.start;
      }
      cssCoverage = { totalBytes: total, usedBytes: used, unusedBytes: total - used };
    } catch { await page.coverage.stopCSSCoverage().catch(() => {}); }

    // Collect raw Set-Cookie headers for Max-Age and Partitioned detection
    const setCookieHeaders: string[] = [];
    for (const req of networkRequests) {
      // We stored response headers via the response interceptor below
    }
    const rawSetCookies = (page as unknown as { _rawSetCookies?: string[] })._rawSetCookies ?? [];

    const pageHostname = (() => { try { return new URL(page.url()).hostname; } catch { return ''; } })();

    const cookies: CookieData[] = (await context.cookies()).map(c => {
      const name = c.name;
      const value = c.value ?? '';
      const size = name.length + value.length;
      const isSession = !c.expires || c.expires <= 0 || c.expires === -1;
      const cookieDomain = c.domain.replace(/^\./, '');
      const isThirdParty = pageHostname ? (!pageHostname.endsWith(cookieDomain) && !cookieDomain.endsWith(pageHostname)) : false;

      // Cookie prefix detection
      let prefix: CookieData['prefix'] = '';
      if (name.startsWith('__Host-Http-')) prefix = '__Host-Http-';
      else if (name.startsWith('__Host-')) prefix = '__Host-';
      else if (name.startsWith('__Secure-')) prefix = '__Secure-';
      else if (name.startsWith('__Http-')) prefix = '__Http-';

      // Prefix validation per RFC 6265bis
      const prefixIssues: string[] = [];
      if (prefix === '__Secure-' || prefix === '__Http-') {
        if (!c.secure) prefixIssues.push(`${prefix} requires Secure flag`);
      }
      if (prefix === '__Host-' || prefix === '__Host-Http-') {
        if (!c.secure) prefixIssues.push(`${prefix} requires Secure flag`);
        if (c.domain && c.domain !== '') prefixIssues.push(`${prefix} must not have Domain attribute`);
        if (c.path !== '/') prefixIssues.push(`${prefix} requires Path=/`);
      }
      if (prefix === '__Http-' || prefix === '__Host-Http-') {
        if (!c.httpOnly) prefixIssues.push(`${prefix} requires HttpOnly flag`);
      }
      const prefixValid = prefixIssues.length === 0;

      // Classification by cookie name pattern
      const n = name.toLowerCase();
      let classification: CookieData['classification'] = 'unknown';
      if (/^(_ga|_gid|_gat|__utma|__utmb|__utmc|__utmz|_dc_gtm)/.test(n)) {
        classification = 'tracking';
      } else if (/^(_fbp|_fbc|fr|datr|_gcl_au|_gcl_aw|ttq_|_tt_|_ttp)/.test(n)) {
        classification = 'advertising';
      } else if (/^(_hjid|_hjsession|_hjabs|_hjTLD|hotjar)/.test(n)) {
        classification = 'tracking';
      } else if (/(session|phpsessid|jsessionid|sid|asp\.net_sessionid|connect\.sid|__session|_session)/i.test(n)) {
        classification = 'essential';
      } else if (/(csrf|xsrf|_token|nonce|authenticity)/i.test(n)) {
        classification = 'essential';
      } else if (/(auth|token|jwt|access_token|refresh_token|id_token|bearer)/i.test(n)) {
        classification = 'essential';
      } else if (/(optanon|cookiebot|consent|euconsent|gdpr|tcf|cmp)/i.test(n)) {
        classification = 'functional';
      } else if (/(lang|locale|timezone|currency|theme|dark_mode|preferences|settings)/i.test(n)) {
        classification = 'functional';
      } else if (/(cart|basket|wishlist|compare)/i.test(n)) {
        classification = 'functional';
      }

      // Security scoring (0-100)
      const securityIssues: string[] = [];
      let securityScore = 100;

      if (!c.secure) {
        securityScore -= 20;
        securityIssues.push('Missing Secure flag — cookie sent over plain HTTP');
      }
      if (!c.httpOnly && classification !== 'functional' && classification !== 'tracking') {
        securityScore -= 10;
        securityIssues.push('Missing HttpOnly — accessible via document.cookie (XSS risk)');
      }
      const sameSiteLower = (c.sameSite as string | undefined ?? '').toLowerCase();
      if (sameSiteLower === 'none' && !c.secure) {
        securityScore -= 30;
        securityIssues.push('SameSite=None without Secure — browser will reject this cookie');
      }
      if (!c.sameSite || (c.sameSite as string) === '') {
        securityScore -= 8;
        securityIssues.push('No SameSite attribute — defaults to Lax in modern browsers (CSRF risk on legacy)');
      }
      if (!prefixValid && prefix) {
        securityScore -= 20;
        prefixIssues.forEach(i => securityIssues.push(`Prefix violation: ${i}`));
      }
      if (classification === 'tracking' && !c.httpOnly) {
        securityScore -= 5;
        securityIssues.push('Tracking cookie accessible to JavaScript');
      }
      if (classification === 'tracking' && !isSession && c.expires && c.expires > 0) {
        const daysExpiry = (c.expires * 1000 - Date.now()) / (1000 * 60 * 60 * 24);
        if (daysExpiry > 395) {
          securityScore -= 10;
          securityIssues.push(`Long-lived tracking cookie — expires in ${Math.round(daysExpiry)} days (GDPR concern)`);
        }
      }
      if (isThirdParty && classification === 'tracking') {
        securityScore -= 15;
        securityIssues.push('Third-party tracking cookie — will be blocked in future browsers');
      }
      if (isThirdParty && sameSiteLower !== 'none') {
        securityScore -= 5;
        securityIssues.push('Third-party cookie without SameSite=None — may not send cross-site');
      }
      securityScore = Math.max(0, Math.min(100, securityScore));

      return {
        name,
        value: value.slice(0, 200), // truncate long values
        domain: c.domain,
        path: c.path,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
        expires: c.expires,
        size,
        isSession,
        isThirdParty,
        prefix,
        prefixValid,
        prefixIssues,
        classification,
        securityScore,
        securityIssues,
        partitioned: false, // Playwright doesn't expose Partitioned yet; detect via raw header
        technology: undefined,
        category: undefined,
      } satisfies CookieData;
    });
    const resourceBreakdown = buildResourceBreakdown(networkRequests);

    // Scroll page to trigger lazy-loaded images before capturing
    try {
      await page.evaluate(async () => {
        await new Promise<void>(resolve => {
          let totalHeight = 0;
          const distance = 300;
          const timer = setInterval(() => {
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= Math.min(document.body.scrollHeight, 10000)) {
              clearInterval(timer);
              window.scrollTo(0, 0);
              resolve();
            }
          }, 60);
        });
      });

      // Force ALL lazy images to load regardless of IntersectionObserver
      await page.evaluate(() => {
        document.querySelectorAll('img[loading="lazy"], img[data-src]').forEach(el => {
          const img = el as HTMLImageElement;
          img.setAttribute('loading', 'eager');
          // Swap data-src → src if still pending
          const dataSrc = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original');
          if (dataSrc && (!img.src || img.src === window.location.href)) {
            img.src = dataSrc;
          }
        });
      });

      // Wait for lazy images to load
      await page.waitForFunction(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        return imgs.length === 0 || imgs.filter(i => i.src).every(i => i.complete);
      }, { timeout: 6000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(800);
    } catch { /* non-critical */ }

    // ── PerformanceResourceTiming: catches ALL resources incl cached + SW ──────
    // This is the ground truth — even HTTP/2 pushed and cached resources appear here.
    const resourceTimings = await page.evaluate(() => {
      return performance.getEntriesByType('resource').map(e => {
        const r = e as PerformanceResourceTiming;
        return {
          name: r.name,
          initiatorType: r.initiatorType,   // 'img', 'css', 'link', 'xmlhttprequest'
          transferSize: r.transferSize,       // 0 = cached, >0 = network
          decodedBodySize: r.decodedBodySize, // real size even when cached
          encodedBodySize: r.encodedBodySize,
          duration: Math.round(r.duration),
        };
      });
    }).catch(() => [] as Array<{
      name: string; initiatorType: string;
      transferSize: number; decodedBodySize: number; encodedBodySize: number; duration: number;
    }>);

    // Collect DOM image data for image analysis
    const domImages = await page.evaluate(() => {
      const imgs: Array<{
        src: string; naturalWidth: number; naturalHeight: number;
        displayWidth: number; displayHeight: number; isAboveFold: boolean;
        isLCP: boolean; loading: string; fetchPriority: string; decoding: string;
        alt: string | null; width: number | null; height: number | null;
        srcset: string | null; sizes: string | null; isBackground: boolean;
      }> = [];

      // <img> elements — also handle data-src lazy loading
      document.querySelectorAll('img').forEach((img, idx) => {
        const src = img.currentSrc || img.src ||
          img.getAttribute('data-src') || img.getAttribute('data-lazy-src') ||
          img.getAttribute('data-original') || '';
        if (!src || src.startsWith('data:') || src === window.location.href) return;
        const rect = img.getBoundingClientRect();
        imgs.push({
          src,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          displayWidth: Math.round(rect.width) || Math.round(img.width) || 0,
          displayHeight: Math.round(rect.height) || Math.round(img.height) || 0,
          isAboveFold: rect.top < window.innerHeight,
          isLCP: idx === 0 && rect.width > 200,
          loading: img.loading || 'none',
          fetchPriority: (img as HTMLImageElement & { fetchpriority?: string }).fetchpriority || 'none',
          decoding: img.decoding || 'none',
          alt: img.hasAttribute('alt') ? img.alt : null,
          width: img.hasAttribute('width') ? img.width : null,
          height: img.hasAttribute('height') ? img.height : null,
          srcset: img.srcset || img.getAttribute('data-srcset') || null,
          sizes: img.sizes || null,
          isBackground: false,
        });
      });

      // CSS background images
      document.querySelectorAll('*').forEach(el => {
        const style = window.getComputedStyle(el);
        const bg = style.backgroundImage;
        if (bg && bg !== 'none' && bg.includes('url(')) {
          const match = bg.match(/url\(["']?([^"')]+)["']?\)/);
          if (match?.[1]) {
            const rect = el.getBoundingClientRect();
            imgs.push({
              src: match[1],
              naturalWidth: 0, naturalHeight: 0,
              displayWidth: Math.round(rect.width),
              displayHeight: Math.round(rect.height),
              isAboveFold: rect.top < window.innerHeight,
              isLCP: false, loading: 'none', fetchPriority: 'none', decoding: 'none',
              alt: null, width: null, height: null, srcset: null, sizes: null,
              isBackground: true,
            });
          }
        }
      });

      return imgs;
    }).catch(() => [] as typeof domImages);

    // Fallback: if DOM capture returned no images, build from network requests
    // (covers cases where headless detection prevents DOM image rendering)
    const effectiveDomImages = domImages.length > 0
      ? domImages
      : networkRequests
          .filter(r => r.type === 'image' || r.type === 'images' ||
            /\.(jpg|jpeg|png|webp|avif|gif|svg|ico|bmp)(\?|$)/i.test(r.url))
          .map(r => ({
            src: r.url,
            naturalWidth: 0, naturalHeight: 0,
            displayWidth: 0, displayHeight: 0,
            isAboveFold: false, isLCP: false,
            loading: 'none', fetchPriority: 'none', decoding: 'none',
            alt: null, width: null, height: null,
            srcset: null, sizes: null, isBackground: false,
          }));

    // Collect @font-face declarations from browser CSS API (most reliable)
    const fontFaceData = await page.evaluate(() => {
      const faces: Array<{ family: string; src: string; display: string; weight: string; style: string }> = [];
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules ?? [])) {
            if (rule.type === 5) { // CSSRule.FONT_FACE_RULE
              const r = rule as CSSFontFaceRule;
              faces.push({
                family: r.style.getPropertyValue('font-family').replace(/['"]/g, '').trim(),
                src: r.style.getPropertyValue('src'),
                display: r.style.getPropertyValue('font-display') || 'auto',
                weight: r.style.getPropertyValue('font-weight') || '400',
                style: r.style.getPropertyValue('font-style') || 'normal',
              });
            }
          }
        } catch { /* CORS-protected sheet */ }
      }
      return faces;
    }).catch(() => [] as Array<{ family: string; src: string; display: string; weight: string; style: string }>);

    // Stop JS profiler and process results
    let jsProfile = null;
    if (options.includeJsProfile !== false) {
      // profilerStarted is captured from closure above (declared in CDP setup try block)
      try {
        const profileResult = await cdpSession.send('Profiler.stop') as { profile: unknown };
        await cdpSession.send('Profiler.disable').catch(() => {});
        jsProfile = await profileJsExecutionFromCdp(
          profileResult.profile as Parameters<typeof profileJsExecutionFromCdp>[0]
        ).catch(() => null);
        logger.debug({ scripts: (jsProfile as {scriptProfiles?: unknown[]})?.scriptProfiles?.length }, 'JS profile complete');
      } catch (err) {
        logger.warn({ err }, 'JS profiler stop failed — returning null');
        jsProfile = null;
      }
    }

    // === Collect IAB TCF API data ===
    let tcfApiData: Record<string, unknown> | null = null;
    try {
      tcfApiData = await Promise.race([
        page.evaluate(() => {
          return new Promise<Record<string, unknown> | null>((resolve) => {
            const w = window as unknown as Record<string, unknown>;
            if (typeof w['__tcfapi'] === 'function') {
              // Try getTCData first (TCF v2.x)
              (w['__tcfapi'] as Function)('getTCData', 2, (tcData: Record<string, unknown>, success: boolean) => {
                if (success && tcData) {
                  resolve(tcData);
                } else {
                  // Fallback: ping
                  (w['__tcfapi'] as Function)('ping', 2, (pingData: Record<string, unknown>, pingSuccess: boolean) => {
                    resolve(pingSuccess ? pingData : null);
                  });
                }
              });
            } else if (typeof w['__cmp'] === 'function') {
              // TCF v1.1
              (w['__cmp'] as Function)('getConsentData', null, (consentData: Record<string, unknown>, success: boolean) => {
                resolve(success ? consentData : null);
              });
            } else {
              resolve(null);
            }
          });
        }),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
      ]);
    } catch { tcfApiData = null; }

    // === US Privacy (CCPA) string detection ===
    let uspData: string | null = null;
    try {
      uspData = await Promise.race([
        page.evaluate(() => {
          return new Promise<string | null>((resolve) => {
            const w = window as unknown as Record<string, unknown>;
            if (typeof w['__uspapi'] === 'function') {
              (w['__uspapi'] as Function)('getUSPData', 1, (data: { uspString?: string }, success: boolean) => {
                resolve(success && data?.uspString ? data.uspString : null);
              });
            } else resolve(null);
          });
        }),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 2000)),
      ]);
    } catch { uspData = null; }

    // === GPP (IAB Global Privacy Platform) detection ===
    let gppData: Record<string, unknown> | null = null;
    try {
      gppData = await Promise.race([
        page.evaluate(() => {
          return new Promise<Record<string, unknown> | null>((resolve) => {
            const w = window as unknown as Record<string, unknown>;
            if (typeof w['__gpp'] === 'function') {
              (w['__gpp'] as Function)('ping', (data: Record<string, unknown>, success: boolean) => {
                resolve(success ? data : null);
              });
            } else resolve(null);
          });
        }),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 2000)),
      ]);
    } catch { gppData = null; }

    return {
      finalUrl: page.url(), networkRequests, jsGlobals, cookies, localStorageKeys, sessionStorageKeys,
      consoleMessages, screenshots, cssClasses, cssCustomProperties, accessibility, pwa,
      jsCoverage, cssCoverage, longTasks, webVitals, indexedDbDatabases, hasWebSockets,
      hasWasm, hasWebWorkers, scriptUrls, linkUrls, metaTags, htmlContent, domSize, resourceBreakdown,
      domImages: effectiveDomImages, fontFaceData,
      fontFaceFromCss: Object.fromEntries(fontFaceFromCss),
      deviceProfile, jsProfile,
      // Image matching data sources
      resourceTimings,
      cdpImageData: Array.from(cdpImageUrls.entries()).map(([id, url]) => ({
        url,
        bytes: cdpImageBytes.get(id) ?? 0,
      })),
      // Privacy & consent platform data
      tcfApiData,
      uspData,
      gppData,
    };
  } finally {
    release();
  }
}

async function collectJsGlobals(page: import('playwright').Page): Promise<Record<string, unknown>> {
  const globalList = [
    'React','__NEXT_DATA__','next','Vue','__VUE__','__NUXT__','$nuxt','ng','angular','Ember','Backbone','Svelte','__svelte',
    'jQuery','Zepto','_','lodash','moment','dayjs','axios','__webpack_require__','webpackJsonp','__vite_is_modern_browser',
    'ga','gtag','dataLayer','google_tag_manager','fbq','FB','ttq','twq','pintrk','snaptr','googletag','adsbygoogle',
    'hj','_hjSettings','ym','mixpanel','amplitude','heap','posthog','analytics','FS','LogRocket',
    'Intercom','intercomSettings','zE','$zopim','drift','Crisp','$crisp','Tawk_API','tidioChatApi','HubSpotConversations',
    'LiveChatWidget','olark','Chatra','Sentry','__SENTRY__','Bugsnag','rollbar','Optimizely','VWO',
    'Shopify','WooCommerce','stripe','Stripe','PayPal','paypal','braintree','Klarna',
    'wp','wpApiSettings','drupalSettings','Drupal','Webflow','Ghost','HubSpot','_hsq','mapboxgl',
    'OneTrust','OptanonWrapper','CookieConsent','Cookiebot','__tcfapi','__cmp','didomiOnReady','_sp_','klaro','tarteaucitron',
    '__vite_plugin_checker_runtime__','navigation','scheduler','turnstile',
  ];
  try {
    return await page.evaluate((list: string[]) => {
      const found: Record<string, unknown> = {};
      for (const g of list) {
        try {
          const val = (window as unknown as Record<string, unknown>)[g];
          if (val !== undefined && val !== null) {
            if (g === 'React' && typeof val === 'object') found[g] = { present: true, version: (val as Record<string,unknown>).version };
            else if (g === 'jQuery' && typeof val === 'function') found[g] = { present: true, version: (val as {fn?: {jquery?: string}}).fn?.jquery };
            else found[g] = { present: true };
          }
        } catch { /* ignore */ }
      }
      return found;
    }, globalList);
  } catch { return {}; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runAxeCore(page: import('playwright').Page): Promise<A11yResult> {
  try {
    await page.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js' });
    await page.waitForTimeout(500);
    return await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      const axeResults = await w.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa'] } });
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        violations: axeResults.violations.map((v: any) => ({
          id: v.id, impact: v.impact ?? 'minor', description: v.description, help: v.help, helpUrl: v.helpUrl,
          wcagCriteria: v.tags.filter((t: string) => t.startsWith('wcag')),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          nodes: v.nodes.slice(0, 5).map((n: any) => ({ html: n.html.slice(0, 200), target: n.target, failureSummary: n.failureSummary })),
        })),
        passes: axeResults.passes.length, incomplete: axeResults.incomplete.length, inapplicable: axeResults.inapplicable.length,
      };
    });
  } catch { return { violations: [], passes: 0, incomplete: 0, inapplicable: 0 }; }
}

async function analyzePWA(page: import('playwright').Page): Promise<PWAResult> {
  const result: PWAResult = { hasServiceWorker: false, hasManifest: false, isInstallable: false, installabilityChecks: {} };
  try {
    const swInfo: { scope: string; scriptUrl: string } | null = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return null;
      try {
        const regs = await (navigator.serviceWorker as ServiceWorkerContainer).getRegistrations();
        if (regs.length > 0) { const r = regs[0]; return { scope: r.scope, scriptUrl: r.active?.scriptURL ?? '' }; }
      } catch { /* ignore */ }
      return null;
    });
    if (swInfo) {
      result.hasServiceWorker = true;
      result.serviceWorker = { registrationPath: swInfo.scriptUrl, scope: swInfo.scope, scriptUrl: swInfo.scriptUrl, usesWorkbox: false };
    }
    const manifestUrl: string | null = await page.evaluate(() => {
      const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
      return link?.href ?? null;
    });
    if (manifestUrl) {
      result.hasManifest = true;
      try {
        const manifestRes = await page.evaluate(async (u: string) => { const r = await fetch(u); return r.json() as Promise<Record<string, unknown>>; }, manifestUrl);
        const icons = (manifestRes.icons as Array<{ sizes?: string; purpose?: string; src: string; type?: string }>) ?? [];
        result.manifest = {
          name: manifestRes.name as string, shortName: manifestRes.short_name as string,
          description: manifestRes.description as string, themeColor: manifestRes.theme_color as string,
          backgroundColor: manifestRes.background_color as string, display: manifestRes.display as string,
          startUrl: manifestRes.start_url as string, icons: icons.map(i => ({ ...i, sizes: i.sizes ?? '' })),
          hasRequiredIcons: icons.some(i => i.sizes?.includes('192x192')) && icons.some(i => i.sizes?.includes('512x512')),
          hasMaskableIcon: icons.some(i => i.purpose?.includes('maskable')),
        };
      } catch { /* ignore */ }
    }
    result.installabilityChecks = {
      https: page.url().startsWith('https://'), hasManifest: result.hasManifest,
      hasServiceWorker: result.hasServiceWorker,
      hasRequiredIcons: result.manifest?.hasRequiredIcons ?? false,
      isStandaloneDisplay: result.manifest?.display === 'standalone',
    };
    result.isInstallable = Object.values(result.installabilityChecks).every(Boolean);
  } catch { /* ignore */ }
  return result;
}

function classifyResourceType(t: string, ct: string, url = ''): string {
  if (t === 'document') return 'html';
  if (t === 'script') return 'javascript';
  if (t === 'stylesheet') return 'css';
  if (t === 'image') return 'images';
  if (t === 'font') return 'fonts';
  if (t === 'media') return 'video';
  if (t === 'xhr' || t === 'fetch') return 'xhr';
  if (ct.includes('javascript')) return 'javascript';
  if (ct.includes('css')) return 'css';
  if (ct.includes('html')) return 'html';
  if (ct.includes('image/')) return 'images';
  if (ct.includes('font/') || ct.includes('woff')) return 'fonts';
  if (ct.includes('video/') || ct.includes('audio/')) return 'video';
  if (ct.includes('json') || ct.includes('xml')) return 'xhr';
  // URL-based fallback for fonts (nytimes and others serve as 'other' type)
  if (/\.(woff2?|ttf|otf|eot)(\?|$)/i.test(url)) return 'fonts';
  if (/\.(jpg|jpeg|png|webp|avif|gif|svg|ico|bmp)(\?|$)/i.test(url)) return 'images';
  return 'other';
}

function buildResourceBreakdown(requests: NetworkReq[]): ResourceBreakdownMap {
  const bd: ResourceBreakdownMap = {
    html: { count:0,transferSize:0,decodedSize:0 }, javascript: { count:0,transferSize:0,decodedSize:0 },
    css: { count:0,transferSize:0,decodedSize:0 }, images: { count:0,transferSize:0,decodedSize:0 },
    fonts: { count:0,transferSize:0,decodedSize:0 }, video: { count:0,transferSize:0,decodedSize:0 },
    xhr: { count:0,transferSize:0,decodedSize:0 }, other: { count:0,transferSize:0,decodedSize:0 },
    total: { count:0,transferSize:0,decodedSize:0 },
  };
  for (const req of requests) {
    const t = (bd[req.type as keyof ResourceBreakdownMap] ?? bd.other);
    t.count++; t.transferSize += req.transferSize; t.decodedSize += req.decodedSize;
    bd.total.count++; bd.total.transferSize += req.transferSize; bd.total.decodedSize += req.decodedSize;
  }
  return bd;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) { await browserInstance.close().catch(() => {}); browserInstance = null; }
}
