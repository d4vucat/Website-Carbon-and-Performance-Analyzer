import type { TechnologyMatch, ThirdPartyProvider } from '../types/index.js';
import {
  HEADER_PATTERNS,
  COOKIE_PATTERNS,
  JS_GLOBAL_PATTERNS,
  THIRD_PARTY_DOMAINS,
} from '../data/detection-patterns.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('tech-detector');

export interface TechDetectionInput {
  headers: Record<string, string>;
  cookies: Array<{ name: string; value: string; domain: string }>;
  jsGlobals: Record<string, unknown>;
  htmlContent: string;
  scriptUrls: string[];
  linkUrls: string[];
  cssClasses: string[];
  cssCustomProperties: string[];
  metaTags: Array<{ name: string; content: string; property?: string }>;
  networkDomains: string[];
  dnsNs?: string[];
  dnsCname?: string;
  serverIp?: string;
  tlsIssuer?: string;
  url: string;
}

interface RawTechDetection {
  name: string;
  slug: string;
  category: string;
  confidence: number;
  detectedVia: string[];
  version?: string;
  website?: string;
  isTracking?: boolean;
  gdprCategory?: 'essential' | 'functional' | 'tracking' | 'advertising';
}

export class TechDetector {
  detect(input: TechDetectionInput): TechnologyMatch[] {
    const detections = new Map<string, RawTechDetection>();

    const merge = (name: string, update: Partial<RawTechDetection>) => {
      const existing = detections.get(name);
      if (existing) {
        existing.confidence = Math.min(100, Math.max(existing.confidence, update.confidence ?? 0));
        if (update.detectedVia) {
          existing.detectedVia.push(...update.detectedVia.filter(v => !existing.detectedVia.includes(v)));
        }
        if (update.version && !existing.version) {
          existing.version = update.version;
        }
      } else {
        detections.set(name, {
          slug: slugify(name),
          detectedVia: [],
          ...update,
          name: name,
          category: update.category ?? 'other',
          confidence: update.confidence ?? 50,
        });
      }
    };

    // === Phase 1: HTTP Header Analysis ===
    for (const pattern of HEADER_PATTERNS) {
      const headerValue = input.headers[pattern.header.toLowerCase()];
      if (!headerValue) continue;

      let matches = false;
      let version: string | undefined;

      if (pattern.pattern) {
        const match = headerValue.match(pattern.pattern);
        if (match) {
          matches = true;
          if (pattern.versionExtract) {
            const vMatch = headerValue.match(pattern.versionExtract);
            version = vMatch?.[1];
          }
        }
      } else if (pattern.value) {
        matches = headerValue.toLowerCase().includes(pattern.value.toLowerCase());
      }

      if (matches) {
        merge(pattern.tech, {
          category: pattern.category,
          confidence: pattern.confidence,
          detectedVia: ['http-headers'],
          version,
        });
      }
    }

    // === Phase 2: Cookie Analysis ===
    for (const cookie of input.cookies) {
      for (const pattern of COOKIE_PATTERNS) {
        if (pattern.namePattern.test(cookie.name)) {
          merge(pattern.tech, {
            category: pattern.category,
            confidence: pattern.confidence,
            detectedVia: ['cookies'],
            gdprCategory: pattern.gdprCategory,
          });
          break;
        }
      }
    }

    // === Phase 3: JavaScript Global Analysis ===
    for (const pattern of JS_GLOBAL_PATTERNS) {
      const globalPresent = input.jsGlobals[pattern.global];
      if (globalPresent !== undefined && globalPresent !== null) {
        let version: string | undefined;
        if (pattern.versionExtract) {
          try {
            const parts = pattern.versionExtract.split('.');
            let val: unknown = input.jsGlobals;
            for (const part of parts) {
              if (val && typeof val === 'object') {
                val = (val as Record<string, unknown>)[part];
              } else {
                val = undefined;
                break;
              }
            }
            if (val && typeof val === 'string') {
              version = val;
            }
          } catch {
            // ignore
          }
        }

        merge(pattern.tech, {
          category: pattern.category,
          confidence: pattern.confidence,
          detectedVia: ['js-globals'],
          version,
          gdprCategory: pattern.gdprCategory,
          isTracking: ['tracking', 'advertising'].includes(pattern.gdprCategory ?? ''),
        });
      }
    }

    // === Phase 4: DOM / HTML Pattern Analysis ===
    this.detectFromDom(input.htmlContent, merge);

    // === Phase 5: Script URL Pattern Analysis ===
    this.detectFromScriptUrls(input.scriptUrls, merge);

    // === Phase 6: Meta Tag Analysis ===
    this.detectFromMetaTags(input.metaTags, merge);

    // === Phase 7: CSS Class Pattern Analysis ===
    this.detectFromCssClasses(input.cssClasses, merge);

    // === Phase 8: CSS Custom Property Analysis ===
    this.detectFromCssCustomProperties(input.cssCustomProperties, merge);

    // === Phase 9: DNS/SSL Analysis ===
    this.detectFromDns(input, merge);

    // === Phase 10: Network Domain Analysis ===
    this.detectFromNetworkDomains(input.networkDomains, merge);

    // Final confidence boost for multi-signal detections
    const results: TechnologyMatch[] = [];
    for (const [, detection] of detections) {
      const signalCount = detection.detectedVia.length;
      const boostedConfidence = Math.min(100, detection.confidence + (signalCount - 1) * 5);

      if (boostedConfidence >= 40) {
        results.push({
          name: detection.name,
          slug: detection.slug,
          version: detection.version,
          confidence: boostedConfidence,
          category: detection.category,
          detectedVia: detection.detectedVia,
          isTracking: detection.isTracking,
          gdprCategory: detection.gdprCategory,
        });
      }
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  private detectFromDom(html: string, merge: (name: string, update: Partial<RawTechDetection>) => void): void {
    const patterns: Array<{ pattern: RegExp; tech: string; category: string; confidence: number; versionExtract?: RegExp }> = [
      // WordPress
      { pattern: /wp-content\/themes|wp-content\/plugins|wp-includes/i, tech: 'WordPress', category: 'cms', confidence: 95 },
      { pattern: /\/wp-json\//i, tech: 'WordPress REST API', category: 'cms', confidence: 90 },
      // Drupal
      { pattern: /Drupal\.settings|drupalSettings/i, tech: 'Drupal', category: 'cms', confidence: 90 },
      { pattern: /sites\/default\/files/i, tech: 'Drupal', category: 'cms', confidence: 80 },
      // Joomla
      { pattern: /\/media\/jui\/|\/templates\/|\/components\/com_/i, tech: 'Joomla', category: 'cms', confidence: 80 },
      // Shopify
      { pattern: /cdn\.shopify\.com|shopify\.com\/s\//i, tech: 'Shopify', category: 'ecommerce', confidence: 95 },
      // Wix
      { pattern: /static\.wixstatic\.com|wix\.com\/site-assets/i, tech: 'Wix', category: 'cms', confidence: 95 },
      // Squarespace
      { pattern: /squarespace\.com|static1\.squarespace\.com/i, tech: 'Squarespace', category: 'cms', confidence: 95 },
      // Webflow
      { pattern: /webflow\.com\/|data-wf-/i, tech: 'Webflow', category: 'cms', confidence: 90 },
      // Next.js
      { pattern: /__NEXT_DATA__|_next\/static/i, tech: 'Next.js', category: 'js-framework', confidence: 100 },
      // Gatsby
      { pattern: /gatsby-|\/page-data\//i, tech: 'Gatsby', category: 'ssg', confidence: 90 },
      // Hugo
      { pattern: /generator.*Hugo/i, tech: 'Hugo', category: 'ssg', confidence: 90 },
      // Nuxt
      { pattern: /__NUXT__|_nuxt\//i, tech: 'Nuxt.js', category: 'js-framework', confidence: 95 },
      // Angular
      { pattern: /ng-version|_nghost|_ngcontent/i, tech: 'Angular', category: 'js-framework', confidence: 90 },
      // Vue
      { pattern: /data-v-[a-f0-9]{7,8}|__vue_/i, tech: 'Vue.js', category: 'js-framework', confidence: 85 },
      // React SSR
      { pattern: /data-reactroot|data-reactid/i, tech: 'React', category: 'js-framework', confidence: 85 },
      // Svelte
      { pattern: /class="svelte-/i, tech: 'Svelte', category: 'js-framework', confidence: 85 },
      // Bootstrap
      { pattern: /class="[^"]*(?:container|btn-primary|navbar-expand|col-md-)/i, tech: 'Bootstrap', category: 'ui-framework', confidence: 70 },
      // Tailwind
      { pattern: /class="[^"]*(?:text-sm|bg-gray|flex-col|rounded-lg|px-4|py-2)[^"]*"/i, tech: 'Tailwind CSS', category: 'ui-framework', confidence: 60 },
      // HTMX
      { pattern: /hx-get|hx-post|hx-trigger/i, tech: 'HTMX', category: 'js-library', confidence: 95 },
      // Alpine.js
      { pattern: /x-data=|x-bind:|x-on:/i, tech: 'Alpine.js', category: 'js-framework', confidence: 90 },
      // Vite
      { pattern: /\/@vite\/|type="module".*vite/i, tech: 'Vite', category: 'bundler', confidence: 80 },
      // reCAPTCHA
      { pattern: /google\.com\/recaptcha|grecaptcha/i, tech: 'Google reCAPTCHA', category: 'security', confidence: 95 },
      // hCaptcha
      { pattern: /hcaptcha\.com/i, tech: 'hCaptcha', category: 'security', confidence: 95 },
      // Cloudflare Turnstile
      { pattern: /challenges\.cloudflare\.com/i, tech: 'Cloudflare Turnstile', category: 'security', confidence: 95 },
    ];

    for (const { pattern, tech, category, confidence, versionExtract } of patterns) {
      if (pattern.test(html)) {
        let version: string | undefined;
        if (versionExtract) {
          const match = html.match(versionExtract);
          version = match?.[1];
        }
        merge(tech, { category, confidence, detectedVia: ['html-dom'], version });
      }
    }

    // Generator meta tag
    const generatorMatch = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i);
    if (generatorMatch) {
      const generator = generatorMatch[1];
      const genPatterns: Array<[RegExp, string, string]> = [
        [/WordPress\s*([\d.]+)?/i, 'WordPress', 'cms'],
        [/Joomla\s*([\d.]+)?/i, 'Joomla', 'cms'],
        [/Drupal\s*([\d.]+)?/i, 'Drupal', 'cms'],
        [/Ghost\s*([\d.]+)?/i, 'Ghost CMS', 'cms'],
        [/Hugo\s*([\d.]+)?/i, 'Hugo', 'ssg'],
        [/Jekyll\s*([\d.]+)?/i, 'Jekyll', 'ssg'],
        [/Gatsby\s*([\d.]+)?/i, 'Gatsby', 'ssg'],
        [/Webflow\s*([\d.]+)?/i, 'Webflow', 'cms'],
        [/Squarespace\s*([\d.]+)?/i, 'Squarespace', 'cms'],
        [/Wix\.com/i, 'Wix', 'cms'],
        [/Shopify\s*([\d.]+)?/i, 'Shopify', 'ecommerce'],
      ];

      for (const [pattern, tech, category] of genPatterns) {
        const match = generator.match(pattern);
        if (match) {
          merge(tech, { category, confidence: 95, detectedVia: ['meta-generator'], version: match[1] });
        }
      }
    }
  }

  private detectFromScriptUrls(scriptUrls: string[], merge: (name: string, update: Partial<RawTechDetection>) => void): void {
    const patterns: Array<{ pattern: RegExp; tech: string; category: string; confidence: number }> = [
      { pattern: /google-analytics\.com\/analytics\.js/, tech: 'Google Analytics (Universal)', category: 'analytics', confidence: 100 },
      { pattern: /googletagmanager\.com\/gtag\/js/, tech: 'Google Analytics 4', category: 'analytics', confidence: 100 },
      { pattern: /googletagmanager\.com\/gtm\.js/, tech: 'Google Tag Manager', category: 'tag-manager', confidence: 100 },
      { pattern: /hotjar\.com\/c\/hotjar/, tech: 'Hotjar', category: 'analytics', confidence: 100 },
      { pattern: /static\.hotjar\.com/, tech: 'Hotjar', category: 'analytics', confidence: 95 },
      { pattern: /connect\.facebook\.net.*fbevents/, tech: 'Facebook Pixel', category: 'advertising', confidence: 100 },
      { pattern: /analytics\.tiktok\.com/, tech: 'TikTok Pixel', category: 'advertising', confidence: 100 },
      { pattern: /static\.ads-twitter\.com/, tech: 'Twitter Ads', category: 'advertising', confidence: 100 },
      { pattern: /js\.intercomcdn\.com/, tech: 'Intercom', category: 'chat', confidence: 100 },
      { pattern: /static\.zdassets\.com/, tech: 'Zendesk', category: 'chat', confidence: 100 },
      { pattern: /js\.stripe\.com/, tech: 'Stripe', category: 'payment', confidence: 100 },
      { pattern: /js\.paypalobjects\.com/, tech: 'PayPal', category: 'payment', confidence: 100 },
      { pattern: /fonts\.googleapis\.com/, tech: 'Google Fonts', category: 'fonts', confidence: 100 },
      { pattern: /use\.typekit\.net/, tech: 'Adobe Fonts', category: 'fonts', confidence: 100 },
      { pattern: /kit\.fontawesome\.com/, tech: 'Font Awesome', category: 'fonts', confidence: 100 },
      { pattern: /unpkg\.com\/react(?:@[\d.]+)?\/umd\/react\.(?:production|development)/, tech: 'React', category: 'js-framework', confidence: 90 },
      { pattern: /cdn\.jsdelivr\.net.*\/bootstrap/, tech: 'Bootstrap', category: 'ui-framework', confidence: 95 },
      { pattern: /cdn\.jsdelivr\.net.*\/(lodash|vue|react|angular)/, tech: 'CDN Hosted Library', category: 'js-library', confidence: 70 },
      { pattern: /browser\.sentry-cdn\.com/, tech: 'Sentry', category: 'apm', confidence: 100 },
      { pattern: /cdn\.rollbar\.com/, tech: 'Rollbar', category: 'apm', confidence: 100 },
      { pattern: /api\.mapbox\.com/, tech: 'Mapbox', category: 'maps', confidence: 100 },
      { pattern: /maps\.googleapis\.com/, tech: 'Google Maps', category: 'maps', confidence: 100 },
      { pattern: /cdn\.shopify\.com\/s\/files/, tech: 'Shopify', category: 'ecommerce', confidence: 95 },
      { pattern: /embed\.tawk\.to/, tech: 'Tawk.to', category: 'chat', confidence: 100 },
      { pattern: /code\.tidio\.co/, tech: 'Tidio', category: 'chat', confidence: 100 },
      { pattern: /cdn\.crisp\.chat|client\.crisp\.chat/, tech: 'Crisp', category: 'chat', confidence: 100 },
      { pattern: /js\.hubspot\.com|hbspt/, tech: 'HubSpot', category: 'crm', confidence: 90 },
      { pattern: /munchkin\.marketo\.net/, tech: 'Marketo', category: 'crm', confidence: 100 },
      { pattern: /static\.klaviyo\.com/, tech: 'Klaviyo', category: 'crm', confidence: 100 },
      { pattern: /cdn\.auth0\.com/, tech: 'Auth0', category: 'auth', confidence: 100 },
      { pattern: /js-agent\.newrelic\.com/, tech: 'New Relic', category: 'apm', confidence: 100 },
      { pattern: /plausible\.io\/js/, tech: 'Plausible Analytics', category: 'analytics', confidence: 100 },
      { pattern: /cdn\.segment\.com/, tech: 'Segment', category: 'analytics', confidence: 100 },
      { pattern: /cdn\.amplitude\.com/, tech: 'Amplitude', category: 'analytics', confidence: 95 },
      { pattern: /posthog\.com\/static/, tech: 'PostHog', category: 'analytics', confidence: 95 },
    ];

    for (const url of scriptUrls) {
      for (const { pattern, tech, category, confidence } of patterns) {
        if (pattern.test(url)) {
          merge(tech, { category, confidence, detectedVia: ['script-urls'] });
        }
      }
    }
  }

  private detectFromMetaTags(
    metaTags: Array<{ name: string; content: string; property?: string }>,
    merge: (name: string, update: Partial<RawTechDetection>) => void,
  ): void {
    for (const meta of metaTags) {
      const nameOrProp = (meta.name || meta.property || '').toLowerCase();
      const content = meta.content.toLowerCase();

      // Verification tokens reveal service usage
      if (nameOrProp === 'google-site-verification') {
        merge('Google Search Console', { category: 'analytics', confidence: 100, detectedVia: ['meta-tags'] });
      }
      if (nameOrProp === 'facebook-domain-verification') {
        merge('Facebook', { category: 'social', confidence: 100, detectedVia: ['meta-tags'] });
      }
      if (nameOrProp === 'p:domain_verify') {
        merge('Pinterest', { category: 'social', confidence: 100, detectedVia: ['meta-tags'] });
      }
      if (nameOrProp === 'msvalidate.01') {
        merge('Bing Webmaster Tools', { category: 'analytics', confidence: 100, detectedVia: ['meta-tags'] });
      }
      if (nameOrProp === 'yandex-verification') {
        merge('Yandex Webmaster', { category: 'analytics', confidence: 100, detectedVia: ['meta-tags'] });
      }
    }
  }

  private detectFromCssClasses(classes: string[], merge: (name: string, update: Partial<RawTechDetection>) => void): void {
    const classString = classes.join(' ');

    const patterns: Array<{ pattern: RegExp; tech: string; category: string; confidence: number }> = [
      { pattern: /\bbtn-primary\b|\bnavbar-expand\b|\bcol-(?:md|lg|sm)-\d+\b/, tech: 'Bootstrap', category: 'ui-framework', confidence: 80 },
      { pattern: /\bMuiButton-root\b|\bMuiTypography\b/, tech: 'Material UI (MUI)', category: 'ui-framework', confidence: 95 },
      { pattern: /\bant-btn\b|\bant-table\b|\bant-form\b/, tech: 'Ant Design', category: 'ui-framework', confidence: 95 },
      { pattern: /\bchakra-\w+/, tech: 'Chakra UI', category: 'ui-framework', confidence: 90 },
      { pattern: /\buk-button\b|\buk-grid\b|\buk-container\b/, tech: 'UIKit', category: 'ui-framework', confidence: 90 },
      { pattern: /\bsc-[a-zA-Z0-9]+\b/, tech: 'Styled Components', category: 'css-framework', confidence: 70 },
      { pattern: /\bcss-[a-zA-Z0-9]+\b/, tech: 'CSS-in-JS (Emotion/MUI)', category: 'css-framework', confidence: 60 },
      { pattern: /\bsvelte-[a-zA-Z0-9]+\b/, tech: 'Svelte', category: 'js-framework', confidence: 85 },
    ];

    for (const { pattern, tech, category, confidence } of patterns) {
      if (pattern.test(classString)) {
        merge(tech, { category, confidence, detectedVia: ['css-classes'] });
      }
    }

    // Tailwind detection (many specific utility classes)
    const tailwindClasses = ['text-sm', 'text-lg', 'text-xl', 'bg-white', 'bg-gray-100',
      'flex', 'grid', 'rounded', 'shadow', 'p-4', 'px-4', 'py-2', 'm-4', 'mx-auto',
      'w-full', 'h-full', 'font-bold', 'font-medium', 'text-center', 'items-center'];
    const tailwindMatches = tailwindClasses.filter(cls => classString.includes(cls)).length;
    if (tailwindMatches >= 5) {
      merge('Tailwind CSS', { category: 'ui-framework', confidence: Math.min(90, 50 + tailwindMatches * 5), detectedVia: ['css-classes'] });
    }
  }

  private detectFromCssCustomProperties(props: string[], merge: (name: string, update: Partial<RawTechDetection>) => void): void {
    const propString = props.join(' ');
    
    const patterns: Array<{ pattern: RegExp; tech: string; category: string; confidence: number }> = [
      { pattern: /--tw-/, tech: 'Tailwind CSS', category: 'ui-framework', confidence: 95 },
      { pattern: /--bs-/, tech: 'Bootstrap 5', category: 'ui-framework', confidence: 95 },
      { pattern: /--mdc-/, tech: 'Material Design Components', category: 'ui-framework', confidence: 90 },
      { pattern: /--mat-/, tech: 'Angular Material', category: 'ui-framework', confidence: 90 },
      { pattern: /--ant-/, tech: 'Ant Design', category: 'ui-framework', confidence: 90 },
      { pattern: /--chakra-/, tech: 'Chakra UI', category: 'ui-framework', confidence: 95 },
      { pattern: /--pf-/, tech: 'PatternFly', category: 'ui-framework', confidence: 90 },
      { pattern: /--carbon-/, tech: 'IBM Carbon Design', category: 'ui-framework', confidence: 90 },
    ];

    for (const { pattern, tech, category, confidence } of patterns) {
      if (pattern.test(propString)) {
        merge(tech, { category, confidence, detectedVia: ['css-custom-properties'] });
      }
    }
  }

  private detectFromDns(input: TechDetectionInput, merge: (name: string, update: Partial<RawTechDetection>) => void): void {
    // Nameserver-based detection
    const nsPatterns: Array<{ pattern: RegExp; tech: string; category: string; confidence: number }> = [
      { pattern: /cloudflare\.com/i, tech: 'Cloudflare DNS', category: 'cdn', confidence: 95 },
      { pattern: /awsdns/i, tech: 'Amazon Route 53', category: 'hosting', confidence: 95 },
      { pattern: /azure-dns\.com/i, tech: 'Azure DNS', category: 'hosting', confidence: 95 },
      { pattern: /google\.com/i, tech: 'Google Cloud DNS', category: 'hosting', confidence: 80 },
      { pattern: /registrar-servers\.com/i, tech: 'Namecheap', category: 'hosting', confidence: 90 },
      { pattern: /godaddy\.com/i, tech: 'GoDaddy', category: 'hosting', confidence: 90 },
      { pattern: /hover\.com/i, tech: 'Hover', category: 'hosting', confidence: 90 },
      { pattern: /fastly\.net/i, tech: 'Fastly', category: 'cdn', confidence: 85 },
      { pattern: /nsone\.net/i, tech: 'NS1 DNS', category: 'hosting', confidence: 85 },
      { pattern: /dnsimple\.com/i, tech: 'DNSimple', category: 'hosting', confidence: 90 },
    ];

    for (const ns of input.dnsNs ?? []) {
      for (const { pattern, tech, category, confidence } of nsPatterns) {
        if (pattern.test(ns)) {
          merge(tech, { category, confidence, detectedVia: ['dns-ns'] });
          break;
        }
      }
    }

    // CNAME-based detection
    if (input.dnsCname) {
      const cnamePatterns: Array<{ pattern: RegExp; tech: string; category: string; confidence: number }> = [
        { pattern: /\.vercel\.app$/, tech: 'Vercel', category: 'hosting', confidence: 95 },
        { pattern: /\.netlify\.app$/, tech: 'Netlify', category: 'hosting', confidence: 95 },
        { pattern: /\.github\.io$/, tech: 'GitHub Pages', category: 'hosting', confidence: 95 },
        { pattern: /\.cloudfront\.net$/, tech: 'Amazon CloudFront', category: 'cdn', confidence: 95 },
        { pattern: /\.azurewebsites\.net$/, tech: 'Microsoft Azure', category: 'hosting', confidence: 95 },
        { pattern: /\.fastly\.net$|fastly\.com/, tech: 'Fastly', category: 'cdn', confidence: 90 },
        { pattern: /\.pages\.dev$/, tech: 'Cloudflare Pages', category: 'hosting', confidence: 95 },
        { pattern: /\.workers\.dev$/, tech: 'Cloudflare Workers', category: 'hosting', confidence: 95 },
        { pattern: /shopify\.com$/, tech: 'Shopify', category: 'ecommerce', confidence: 90 },
        { pattern: /squarespace\.com$/, tech: 'Squarespace', category: 'cms', confidence: 90 },
        { pattern: /webflow\.io$|webflow\.com$/, tech: 'Webflow', category: 'cms', confidence: 90 },
        { pattern: /wixsite\.com$|wix\.com$/, tech: 'Wix', category: 'cms', confidence: 90 },
      ];

      for (const { pattern, tech, category, confidence } of cnamePatterns) {
        if (pattern.test(input.dnsCname)) {
          merge(tech, { category, confidence, detectedVia: ['dns-cname'] });
        }
      }
    }

    // TLS CA-based detection
    if (input.tlsIssuer) {
      const caPatterns: Array<{ pattern: RegExp; tech: string; category: string; confidence: number }> = [
        { pattern: /Cloudflare/i, tech: 'Cloudflare', category: 'cdn', confidence: 80 },
        { pattern: /Amazon/i, tech: 'Amazon AWS', category: 'hosting', confidence: 60 },
        { pattern: /Let's Encrypt/i, tech: "Let's Encrypt", category: 'security', confidence: 90 },
        { pattern: /DigiCert/i, tech: 'DigiCert', category: 'security', confidence: 70 },
        { pattern: /Sectigo/i, tech: 'Sectigo', category: 'security', confidence: 70 },
      ];

      for (const { pattern, tech, category, confidence } of caPatterns) {
        if (pattern.test(input.tlsIssuer)) {
          merge(tech, { category, confidence, detectedVia: ['tls-cert'] });
        }
      }
    }
  }

  private detectFromNetworkDomains(domains: string[], merge: (name: string, update: Partial<RawTechDetection>) => void): void {
    for (const domain of domains) {
      // Check against known third-party domains
      for (const [knownDomain, info] of Object.entries(THIRD_PARTY_DOMAINS)) {
        if (domain === knownDomain || domain.endsWith(`.${knownDomain}`)) {
          merge(info.name, {
            category: info.category,
            confidence: 90,
            detectedVia: ['network-requests'],
            gdprCategory: info.gdprCategory,
            isTracking: ['tracking', 'advertising'].includes(info.gdprCategory),
          });
          break;
        }
      }
    }
  }

  detectThirdParties(
    requests: Array<{
      url: string;
      transferSize: number;
      mainThreadTime?: number;
      blockingTime?: number;
    }>,
    firstPartyDomain: string,
    cookies: Array<{ name: string; domain: string }>,
  ): ThirdPartyProvider[] {
    const byDomain = new Map<string, {
      name: string;
      category: string;
      gdprCategory: 'essential' | 'functional' | 'tracking' | 'advertising';
      privacySafeAlternative?: string;
      requestCount: number;
      transferSize: number;
      mainThreadTime: number;
      blockingTime: number;
      domains: Set<string>;
    }>();

    for (const req of requests) {
      let domain: string;
      try {
        const url = new URL(req.url);
        domain = url.hostname;
      } catch {
        continue;
      }

      // Skip first-party
      if (domain === firstPartyDomain || domain.endsWith(`.${firstPartyDomain}`)) continue;

      // Find matching third-party info
      let matchedInfo = THIRD_PARTY_DOMAINS[domain];
      if (!matchedInfo) {
        // Try parent domain
        const parts = domain.split('.');
        if (parts.length > 2) {
          const parentDomain = parts.slice(-2).join('.');
          matchedInfo = THIRD_PARTY_DOMAINS[parentDomain];
        }
      }

      if (!matchedInfo) continue;

      const groupKey = matchedInfo.name;
      const existing = byDomain.get(groupKey);

      if (existing) {
        existing.requestCount++;
        existing.transferSize += req.transferSize;
        existing.mainThreadTime += req.mainThreadTime ?? 0;
        existing.blockingTime += req.blockingTime ?? 0;
        existing.domains.add(domain);
      } else {
        byDomain.set(groupKey, {
          name: matchedInfo.name,
          category: matchedInfo.category,
          gdprCategory: matchedInfo.gdprCategory,
          privacySafeAlternative: matchedInfo.privacySafeAlternative,
          requestCount: 1,
          transferSize: req.transferSize,
          mainThreadTime: req.mainThreadTime ?? 0,
          blockingTime: req.blockingTime ?? 0,
          domains: new Set([domain]),
        });
      }
    }

    // Calculate CO2 per third party
    const results: ThirdPartyProvider[] = [];
    for (const [, provider] of byDomain) {
      // Simple CO2 estimate: SWD model
      const transferGB = provider.transferSize / (1024 ** 3);
      const co2G = transferGB * 0.194 * 442; // world average grid intensity

      // Find cookies dropped by this provider
      const providerDomains = [...provider.domains];
      const droppedCookies = cookies
        .filter(c => providerDomains.some(d => c.domain === d || c.domain.endsWith(`.${d}`)))
        .map(c => c.name);

      results.push({
        name: provider.name,
        category: provider.category,
        domains: providerDomains,
        requestCount: provider.requestCount,
        transferSize: provider.transferSize,
        mainThreadTime: provider.mainThreadTime,
        blockingTime: provider.blockingTime,
        co2Grams: Math.round(co2G * 10000) / 10000,
        gdprCategory: provider.gdprCategory,
        cookiesDropped: [...new Set(droppedCookies)],
        privacySafeAlternative: provider.privacySafeAlternative,
      });
    }

    return results.sort((a, b) => b.transferSize - a.transferSize);
  }
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
