// Comprehensive technology detection patterns

export const HEADER_PATTERNS: Array<{
  header: string;
  pattern?: RegExp;
  value?: string;
  tech: string;
  category: string;
  confidence: number;
  versionExtract?: RegExp;
}> = [
  // Server
  { header: 'server', pattern: /Apache\/?(\d[\d.]*)?/i, tech: 'Apache HTTP Server', category: 'web-server', confidence: 95, versionExtract: /Apache\/(\d[\d.]+)/i },
  { header: 'server', pattern: /nginx\/?(\d[\d.]*)?/i, tech: 'Nginx', category: 'web-server', confidence: 95, versionExtract: /nginx\/(\d[\d.]+)/i },
  { header: 'server', pattern: /IIS\/?(\d[\d.]*)?/i, tech: 'Microsoft IIS', category: 'web-server', confidence: 95, versionExtract: /IIS\/(\d[\d.]+)/i },
  { header: 'server', pattern: /LiteSpeed/i, tech: 'LiteSpeed', category: 'web-server', confidence: 95 },
  { header: 'server', pattern: /cloudflare/i, tech: 'Cloudflare', category: 'cdn', confidence: 90 },
  { header: 'server', pattern: /openresty/i, tech: 'OpenResty', category: 'web-server', confidence: 90 },
  { header: 'server', pattern: /Caddy/i, tech: 'Caddy', category: 'web-server', confidence: 90 },
  { header: 'server', pattern: /cowboy/i, tech: 'Cowboy', category: 'web-server', confidence: 80 },
  { header: 'server', pattern: /gunicorn/i, tech: 'Gunicorn', category: 'web-server', confidence: 90 },
  { header: 'server', pattern: /unicorn/i, tech: 'Unicorn', category: 'web-server', confidence: 80 },
  { header: 'server', pattern: /Kestrel/i, tech: 'Microsoft ASP.NET Core', category: 'web-framework', confidence: 85 },

  // CDN & Hosting
  { header: 'x-vercel-id', pattern: /.+/, tech: 'Vercel', category: 'hosting', confidence: 100 },
  { header: 'x-netlify-id', pattern: /.+/, tech: 'Netlify', category: 'hosting', confidence: 100 },
  { header: 'x-nf-request-id', pattern: /.+/, tech: 'Netlify', category: 'hosting', confidence: 100 },
  { header: 'x-amz-cf-id', pattern: /.+/, tech: 'Amazon CloudFront', category: 'cdn', confidence: 100 },
  { header: 'x-amz-request-id', pattern: /.+/, tech: 'Amazon AWS', category: 'hosting', confidence: 85 },
  { header: 'cf-cache-status', pattern: /.+/, tech: 'Cloudflare', category: 'cdn', confidence: 100 },
  { header: 'cf-ray', pattern: /.+/, tech: 'Cloudflare', category: 'cdn', confidence: 100 },
  { header: 'x-fastly-request-id', pattern: /.+/, tech: 'Fastly', category: 'cdn', confidence: 100 },
  { header: 'fastly-io-warning', pattern: /.+/, tech: 'Fastly', category: 'cdn', confidence: 100 },
  { header: 'x-cdn', pattern: /Incapsula/i, tech: 'Imperva', category: 'security', confidence: 90 },
  { header: 'x-iinfo', pattern: /.+/, tech: 'Imperva', category: 'security', confidence: 90 },
  { header: 'x-azure-ref', pattern: /.+/, tech: 'Microsoft Azure', category: 'hosting', confidence: 90 },
  { header: 'x-goog-resource-type', pattern: /.+/, tech: 'Google Cloud', category: 'hosting', confidence: 85 },
  { header: 'x-github-request-id', pattern: /.+/, tech: 'GitHub Pages', category: 'hosting', confidence: 100 },
  { header: 'x-served-by', pattern: /cache/, tech: 'Varnish', category: 'cache', confidence: 75 },
  { header: 'via', pattern: /varnish/i, tech: 'Varnish', category: 'cache', confidence: 90 },
  { header: 'age', pattern: /\d+/, tech: 'HTTP Cache', category: 'cache', confidence: 50 },
  { header: 'x-cache', pattern: /HIT|MISS/, tech: 'HTTP Cache', category: 'cache', confidence: 40 },

  // CMS Frameworks
  { header: 'x-pingback', pattern: /xmlrpc.php/, tech: 'WordPress', category: 'cms', confidence: 90 },
  { header: 'x-powered-by', pattern: /PHP\/?(\d[\d.]*)?/i, tech: 'PHP', category: 'programming-language', confidence: 95, versionExtract: /PHP\/(\d[\d.]+)/i },
  { header: 'x-powered-by', pattern: /Express/i, tech: 'Express.js', category: 'web-framework', confidence: 90 },
  { header: 'x-powered-by', pattern: /ASP\.NET/i, tech: 'ASP.NET', category: 'web-framework', confidence: 95 },
  { header: 'x-powered-by', pattern: /Next\.js/i, tech: 'Next.js', category: 'js-framework', confidence: 100 },
  { header: 'x-powered-by', pattern: /Nuxt/i, tech: 'Nuxt.js', category: 'js-framework', confidence: 100 },
  { header: 'x-drupal-cache', pattern: /.+/, tech: 'Drupal', category: 'cms', confidence: 100 },
  { header: 'x-drupal-dynamic-cache', pattern: /.+/, tech: 'Drupal', category: 'cms', confidence: 100 },
  { header: 'x-generator', pattern: /Hugo/i, tech: 'Hugo', category: 'ssg', confidence: 90 },
  { header: 'x-generator', pattern: /Gatsby/i, tech: 'Gatsby', category: 'ssg', confidence: 90 },
  { header: 'x-joomla-version', pattern: /\d/, tech: 'Joomla', category: 'cms', confidence: 100 },

  // Security
  { header: 'x-waf-event-info', pattern: /.+/, tech: 'Kona Site Defender (Akamai)', category: 'waf', confidence: 95 },
  { header: 'x-fw-server', pattern: /.+/, tech: 'Freshworks', category: 'crm', confidence: 80 },
  { header: 'x-sucuri-id', pattern: /.+/, tech: 'Sucuri WAF', category: 'waf', confidence: 100 },
  { header: 'x-sucuri-cache', pattern: /.+/, tech: 'Sucuri WAF', category: 'waf', confidence: 100 },
];

export const COOKIE_PATTERNS: Array<{
  namePattern: RegExp;
  tech: string;
  category: string;
  confidence: number;
  gdprCategory?: 'essential' | 'functional' | 'tracking' | 'advertising';
}> = [
  // PHP/Backend
  { namePattern: /^PHPSESSID$/, tech: 'PHP', category: 'programming-language', confidence: 90, gdprCategory: 'essential' },
  { namePattern: /^JSESSIONID$/, tech: 'Java Servlet', category: 'web-framework', confidence: 90, gdprCategory: 'essential' },
  { namePattern: /^ASP\.NET_SessionId$/i, tech: 'ASP.NET', category: 'web-framework', confidence: 95, gdprCategory: 'essential' },
  { namePattern: /^laravel_session$/, tech: 'Laravel', category: 'web-framework', confidence: 100, gdprCategory: 'essential' },
  { namePattern: /^XSRF-TOKEN$/, tech: 'Laravel', category: 'web-framework', confidence: 70, gdprCategory: 'essential' },
  { namePattern: /^connect\.sid$/, tech: 'Express.js', category: 'web-framework', confidence: 95, gdprCategory: 'essential' },
  { namePattern: /^csrftoken$/, tech: 'Django', category: 'web-framework', confidence: 95, gdprCategory: 'essential' },
  { namePattern: /^sessionid$/, tech: 'Django', category: 'web-framework', confidence: 75, gdprCategory: 'essential' },
  { namePattern: /^_session_id$/, tech: 'Ruby on Rails', category: 'web-framework', confidence: 75, gdprCategory: 'essential' },
  { namePattern: /^cfid$|^cftoken$/, tech: 'Adobe ColdFusion', category: 'web-framework', confidence: 95, gdprCategory: 'essential' },

  // CMS
  { namePattern: /^wp-settings-\d+$/, tech: 'WordPress', category: 'cms', confidence: 100, gdprCategory: 'essential' },
  { namePattern: /^wordpress_logged_in_.+/, tech: 'WordPress', category: 'cms', confidence: 100, gdprCategory: 'essential' },
  { namePattern: /^wordpress_test_cookie$/, tech: 'WordPress', category: 'cms', confidence: 100, gdprCategory: 'essential' },
  { namePattern: /^woocommerce_session_.+/, tech: 'WooCommerce', category: 'ecommerce', confidence: 100, gdprCategory: 'essential' },
  { namePattern: /^woocommerce_cart_hash$/, tech: 'WooCommerce', category: 'ecommerce', confidence: 100, gdprCategory: 'essential' },
  { namePattern: /^SESS[a-f0-9]+$/, tech: 'Drupal', category: 'cms', confidence: 90, gdprCategory: 'essential' },
  { namePattern: /^joomla_user_state$/, tech: 'Joomla', category: 'cms', confidence: 100, gdprCategory: 'essential' },
  { namePattern: /^fe_typo_user$/, tech: 'TYPO3', category: 'cms', confidence: 100, gdprCategory: 'essential' },

  // E-commerce
  { namePattern: /^_shopify_y$/, tech: 'Shopify', category: 'ecommerce', confidence: 100, gdprCategory: 'functional' },
  { namePattern: /^_shopify_s$/, tech: 'Shopify', category: 'ecommerce', confidence: 100, gdprCategory: 'essential' },
  { namePattern: /^cart$|^wc_cart_hash$/, tech: 'WooCommerce', category: 'ecommerce', confidence: 75, gdprCategory: 'essential' },
  { namePattern: /^squarespace-cart-info$/, tech: 'Squarespace', category: 'cms', confidence: 100, gdprCategory: 'essential' },
  { namePattern: /^shopware-session$/, tech: 'Shopware', category: 'ecommerce', confidence: 100, gdprCategory: 'essential' },

  // Analytics & Tracking
  { namePattern: /^_ga$/, tech: 'Google Analytics', category: 'analytics', confidence: 100, gdprCategory: 'tracking' },
  { namePattern: /^_ga_[A-Z0-9]+$/, tech: 'Google Analytics 4', category: 'analytics', confidence: 100, gdprCategory: 'tracking' },
  { namePattern: /^_gid$/, tech: 'Google Analytics', category: 'analytics', confidence: 100, gdprCategory: 'tracking' },
  { namePattern: /^_gcl_au$/, tech: 'Google Ads', category: 'advertising', confidence: 90, gdprCategory: 'advertising' },
  { namePattern: /^_fbp$/, tech: 'Facebook Pixel', category: 'advertising', confidence: 100, gdprCategory: 'advertising' },
  { namePattern: /^_fbc$/, tech: 'Facebook Pixel', category: 'advertising', confidence: 100, gdprCategory: 'advertising' },
  { namePattern: /^__utma$|^__utmb$|^__utmc$|^__utmz$/, tech: 'Google Analytics (Legacy)', category: 'analytics', confidence: 100, gdprCategory: 'tracking' },
  { namePattern: /^_hjid$/, tech: 'Hotjar', category: 'analytics', confidence: 100, gdprCategory: 'tracking' },
  { namePattern: /^_hjSessionUser_\d+$/, tech: 'Hotjar', category: 'analytics', confidence: 100, gdprCategory: 'tracking' },
  { namePattern: /^__hstc$|^hubspotutk$/, tech: 'HubSpot', category: 'crm', confidence: 100, gdprCategory: 'tracking' },
  { namePattern: /^intercom-.+/, tech: 'Intercom', category: 'chat', confidence: 95, gdprCategory: 'functional' },
  { namePattern: /^mp_[a-f0-9]+_mixpanel$/, tech: 'Mixpanel', category: 'analytics', confidence: 100, gdprCategory: 'tracking' },

  // CDN & Infrastructure
  { namePattern: /^__cf_bm$/, tech: 'Cloudflare Bot Management', category: 'security', confidence: 100, gdprCategory: 'essential' },
  { namePattern: /^__cfduid$/, tech: 'Cloudflare', category: 'cdn', confidence: 100, gdprCategory: 'essential' },
  { namePattern: /^_cfuvid$/, tech: 'Cloudflare', category: 'cdn', confidence: 100, gdprCategory: 'essential' },
];

export const JS_GLOBAL_PATTERNS: Array<{
  global: string;
  tech: string;
  category: string;
  confidence: number;
  versionExtract?: string;
  gdprCategory?: 'essential' | 'functional' | 'tracking' | 'advertising';
}> = [
  // Frameworks
  { global: 'React', tech: 'React', category: 'js-framework', confidence: 95, versionExtract: 'React.version' },
  { global: '__NEXT_DATA__', tech: 'Next.js', category: 'js-framework', confidence: 100 },
  { global: 'next', tech: 'Next.js', category: 'js-framework', confidence: 85 },
  { global: 'Vue', tech: 'Vue.js', category: 'js-framework', confidence: 95, versionExtract: 'Vue.version' },
  { global: '__VUE__', tech: 'Vue.js 3', category: 'js-framework', confidence: 95 },
  { global: '__NUXT__', tech: 'Nuxt.js', category: 'js-framework', confidence: 100 },
  { global: '$nuxt', tech: 'Nuxt.js', category: 'js-framework', confidence: 100 },
  { global: 'ng', tech: 'Angular', category: 'js-framework', confidence: 90 },
  { global: 'angular', tech: 'AngularJS', category: 'js-framework', confidence: 95, versionExtract: 'angular.version.full' },
  { global: 'Ember', tech: 'Ember.js', category: 'js-framework', confidence: 95, versionExtract: 'Ember.VERSION' },
  { global: 'Backbone', tech: 'Backbone.js', category: 'js-framework', confidence: 95, versionExtract: 'Backbone.VERSION' },
  { global: 'Svelte', tech: 'Svelte', category: 'js-framework', confidence: 90 },
  { global: '__svelte', tech: 'Svelte', category: 'js-framework', confidence: 95 },

  // jQuery & Utilities
  { global: 'jQuery', tech: 'jQuery', category: 'js-library', confidence: 100, versionExtract: 'jQuery.fn.jquery' },
  { global: 'Zepto', tech: 'Zepto.js', category: 'js-library', confidence: 95 },
  { global: '_', tech: 'Lodash/Underscore', category: 'js-library', confidence: 60 },
  { global: 'lodash', tech: 'Lodash', category: 'js-library', confidence: 95, versionExtract: 'lodash.VERSION' },
  { global: 'moment', tech: 'Moment.js', category: 'js-library', confidence: 95, versionExtract: 'moment.version' },
  { global: 'dayjs', tech: 'Day.js', category: 'js-library', confidence: 95 },
  { global: 'axios', tech: 'Axios', category: 'js-library', confidence: 90 },

  // Build tools
  { global: '__webpack_require__', tech: 'Webpack', category: 'bundler', confidence: 90 },
  { global: 'webpackJsonp', tech: 'Webpack', category: 'bundler', confidence: 85 },
  { global: '__vite_is_modern_browser', tech: 'Vite', category: 'bundler', confidence: 95 },
  { global: '__vitePreloadError', tech: 'Vite', category: 'bundler', confidence: 90 },

  // Analytics
  { global: 'ga', tech: 'Google Analytics', category: 'analytics', confidence: 80, gdprCategory: 'tracking' },
  { global: 'gtag', tech: 'Google Analytics 4', category: 'analytics', confidence: 90, gdprCategory: 'tracking' },
  { global: 'dataLayer', tech: 'Google Tag Manager', category: 'tag-manager', confidence: 85, gdprCategory: 'tracking' },
  { global: 'google_tag_manager', tech: 'Google Tag Manager', category: 'tag-manager', confidence: 95, gdprCategory: 'tracking' },
  { global: 'fbq', tech: 'Facebook Pixel', category: 'advertising', confidence: 95, gdprCategory: 'advertising' },
  { global: 'FB', tech: 'Facebook SDK', category: 'social', confidence: 80, gdprCategory: 'tracking' },
  { global: 'ttq', tech: 'TikTok Pixel', category: 'advertising', confidence: 95, gdprCategory: 'advertising' },
  { global: 'twq', tech: 'Twitter Pixel', category: 'advertising', confidence: 95, gdprCategory: 'advertising' },
  { global: 'pintrk', tech: 'Pinterest Tag', category: 'advertising', confidence: 95, gdprCategory: 'advertising' },
  { global: 'snaptr', tech: 'Snapchat Pixel', category: 'advertising', confidence: 95, gdprCategory: 'advertising' },
  { global: 'obApi', tech: 'Outbrain Pixel', category: 'advertising', confidence: 95, gdprCategory: 'advertising' },
  { global: 'googletag', tech: 'Google Ad Manager', category: 'advertising', confidence: 90, gdprCategory: 'advertising' },
  { global: 'adsbygoogle', tech: 'Google AdSense', category: 'advertising', confidence: 95, gdprCategory: 'advertising' },
  { global: 'hj', tech: 'Hotjar', category: 'analytics', confidence: 95, gdprCategory: 'tracking' },
  { global: '_hjSettings', tech: 'Hotjar', category: 'analytics', confidence: 100, gdprCategory: 'tracking' },
  { global: 'ym', tech: 'Yandex.Metrica', category: 'analytics', confidence: 90, gdprCategory: 'tracking' },
  { global: 'mixpanel', tech: 'Mixpanel', category: 'analytics', confidence: 95, gdprCategory: 'tracking' },
  { global: 'amplitude', tech: 'Amplitude', category: 'analytics', confidence: 95, gdprCategory: 'tracking' },
  { global: 'heap', tech: 'Heap Analytics', category: 'analytics', confidence: 95, gdprCategory: 'tracking' },
  { global: 'posthog', tech: 'PostHog', category: 'analytics', confidence: 95, gdprCategory: 'tracking' },
  { global: 'analytics', tech: 'Segment', category: 'analytics', confidence: 60, gdprCategory: 'tracking' },

  // Chat widgets
  { global: 'Intercom', tech: 'Intercom', category: 'chat', confidence: 95, gdprCategory: 'functional' },
  { global: 'intercomSettings', tech: 'Intercom', category: 'chat', confidence: 100, gdprCategory: 'functional' },
  { global: 'zE', tech: 'Zendesk', category: 'chat', confidence: 95, gdprCategory: 'functional' },
  { global: '$zopim', tech: 'Zendesk (legacy)', category: 'chat', confidence: 95, gdprCategory: 'functional' },
  { global: 'drift', tech: 'Drift', category: 'chat', confidence: 95, gdprCategory: 'functional' },
  { global: 'Crisp', tech: 'Crisp', category: 'chat', confidence: 95, gdprCategory: 'functional' },
  { global: '$crisp', tech: 'Crisp', category: 'chat', confidence: 100, gdprCategory: 'functional' },
  { global: 'Tawk_API', tech: 'Tawk.to', category: 'chat', confidence: 100, gdprCategory: 'functional' },
  { global: 'tidioChatApi', tech: 'Tidio', category: 'chat', confidence: 100, gdprCategory: 'functional' },
  { global: 'HubSpotConversations', tech: 'HubSpot Chat', category: 'chat', confidence: 100, gdprCategory: 'functional' },
  { global: 'LiveChatWidget', tech: 'LiveChat', category: 'chat', confidence: 100, gdprCategory: 'functional' },
  { global: 'olark', tech: 'Olark', category: 'chat', confidence: 95, gdprCategory: 'functional' },
  { global: 'Chatra', tech: 'Chatra', category: 'chat', confidence: 95, gdprCategory: 'functional' },

  // Error Tracking
  { global: 'Sentry', tech: 'Sentry', category: 'apm', confidence: 90, gdprCategory: 'essential' },
  { global: '__SENTRY__', tech: 'Sentry', category: 'apm', confidence: 100, gdprCategory: 'essential' },
  { global: 'Bugsnag', tech: 'Bugsnag', category: 'apm', confidence: 95, gdprCategory: 'essential' },
  { global: 'rollbar', tech: 'Rollbar', category: 'apm', confidence: 95, gdprCategory: 'essential' },
  { global: 'FS', tech: 'FullStory', category: 'analytics', confidence: 80, gdprCategory: 'tracking' },
  { global: 'LogRocket', tech: 'LogRocket', category: 'analytics', confidence: 95, gdprCategory: 'tracking' },

  // A/B Testing
  { global: 'Optimizely', tech: 'Optimizely', category: 'ab-testing', confidence: 95, gdprCategory: 'functional' },
  { global: 'optimizely', tech: 'Optimizely', category: 'ab-testing', confidence: 90, gdprCategory: 'functional' },
  { global: 'VWO', tech: 'Visual Website Optimizer', category: 'ab-testing', confidence: 95, gdprCategory: 'functional' },

  // E-commerce
  { global: 'Shopify', tech: 'Shopify', category: 'ecommerce', confidence: 100 },
  { global: 'WooCommerce', tech: 'WooCommerce', category: 'ecommerce', confidence: 100 },
  { global: 'prestashop', tech: 'PrestaShop', category: 'ecommerce', confidence: 100 },
  { global: 'stripe', tech: 'Stripe.js', category: 'payment', confidence: 90 },
  { global: 'Stripe', tech: 'Stripe', category: 'payment', confidence: 95 },
  { global: 'PayPal', tech: 'PayPal SDK', category: 'payment', confidence: 90 },
  { global: 'paypal', tech: 'PayPal', category: 'payment', confidence: 85 },
  { global: 'braintree', tech: 'Braintree', category: 'payment', confidence: 95 },
  { global: 'Klarna', tech: 'Klarna', category: 'payment', confidence: 95 },

  // CMS
  { global: 'wp', tech: 'WordPress', category: 'cms', confidence: 80 },
  { global: 'wpApiSettings', tech: 'WordPress REST API', category: 'cms', confidence: 100 },
  { global: 'drupalSettings', tech: 'Drupal', category: 'cms', confidence: 100 },
  { global: 'Drupal', tech: 'Drupal', category: 'cms', confidence: 100 },
  { global: 'Webflow', tech: 'Webflow', category: 'cms', confidence: 100 },
  { global: 'contentful', tech: 'Contentful', category: 'cms', confidence: 85 },
  { global: 'Ghost', tech: 'Ghost CMS', category: 'cms', confidence: 85 },

  // CRM
  { global: 'HubSpot', tech: 'HubSpot', category: 'crm', confidence: 90, gdprCategory: 'tracking' },
  { global: '_hsq', tech: 'HubSpot', category: 'crm', confidence: 100, gdprCategory: 'tracking' },

  // Maps
  { global: 'google', tech: 'Google Maps', category: 'maps', confidence: 70 },
  { global: 'mapboxgl', tech: 'Mapbox GL JS', category: 'maps', confidence: 95 },
  { global: 'L', tech: 'Leaflet', category: 'maps', confidence: 70 },

  // Search
  { global: 'instantsearch', tech: 'Algolia InstantSearch', category: 'search', confidence: 95 },
  { global: 'algoliasearch', tech: 'Algolia', category: 'search', confidence: 95 },
  { global: 'doofinder', tech: 'Doofinder', category: 'search', confidence: 95 },
];

export const THIRD_PARTY_DOMAINS: Record<string, {
  name: string;
  category: string;
  gdprCategory: 'essential' | 'functional' | 'tracking' | 'advertising';
  privacySafeAlternative?: string;
}> = {
  // Analytics
  'google-analytics.com': { name: 'Google Analytics', category: 'analytics', gdprCategory: 'tracking', privacySafeAlternative: 'Plausible, Fathom, Umami' },
  'analytics.google.com': { name: 'Google Analytics 4', category: 'analytics', gdprCategory: 'tracking', privacySafeAlternative: 'Plausible, Fathom' },
  'googletagmanager.com': { name: 'Google Tag Manager', category: 'tag-manager', gdprCategory: 'tracking' },
  'hotjar.com': { name: 'Hotjar', category: 'analytics', gdprCategory: 'tracking', privacySafeAlternative: 'Clarity (basic), or self-hosted Matomo' },
  'mixpanel.com': { name: 'Mixpanel', category: 'analytics', gdprCategory: 'tracking', privacySafeAlternative: 'PostHog (self-hosted)' },
  'amplitude.com': { name: 'Amplitude', category: 'analytics', gdprCategory: 'tracking', privacySafeAlternative: 'PostHog (self-hosted)' },
  'segment.com': { name: 'Segment', category: 'analytics', gdprCategory: 'tracking' },
  'cdn.segment.com': { name: 'Segment CDN', category: 'analytics', gdprCategory: 'tracking' },
  'heapanalytics.com': { name: 'Heap Analytics', category: 'analytics', gdprCategory: 'tracking' },
  'fullstory.com': { name: 'FullStory', category: 'analytics', gdprCategory: 'tracking' },
  'logrocket.com': { name: 'LogRocket', category: 'analytics', gdprCategory: 'tracking' },
  'posthog.com': { name: 'PostHog (Cloud)', category: 'analytics', gdprCategory: 'tracking' },
  'clarity.ms': { name: 'Microsoft Clarity', category: 'analytics', gdprCategory: 'tracking' },
  'mouseflow.com': { name: 'Mouseflow', category: 'analytics', gdprCategory: 'tracking' },
  'smartlook.com': { name: 'Smartlook', category: 'analytics', gdprCategory: 'tracking' },
  'mc.yandex.ru': { name: 'Yandex.Metrica', category: 'analytics', gdprCategory: 'tracking' },
  'plausible.io': { name: 'Plausible Analytics', category: 'analytics', gdprCategory: 'essential' },
  'simpleanalytics.com': { name: 'Simple Analytics', category: 'analytics', gdprCategory: 'essential' },

  // Advertising
  'doubleclick.net': { name: 'Google DoubleClick', category: 'advertising', gdprCategory: 'advertising' },
  'googlesyndication.com': { name: 'Google AdSense', category: 'advertising', gdprCategory: 'advertising' },
  'facebook.net': { name: 'Facebook Pixel', category: 'advertising', gdprCategory: 'advertising' },
  'connect.facebook.net': { name: 'Facebook SDK', category: 'advertising', gdprCategory: 'advertising' },
  'analytics.tiktok.com': { name: 'TikTok Pixel', category: 'advertising', gdprCategory: 'advertising' },
  'static.ads-twitter.com': { name: 'Twitter Ads', category: 'advertising', gdprCategory: 'advertising' },
  'outbrain.com': { name: 'Outbrain', category: 'advertising', gdprCategory: 'advertising' },
  'taboola.com': { name: 'Taboola', category: 'advertising', gdprCategory: 'advertising' },
  'criteo.com': { name: 'Criteo', category: 'advertising', gdprCategory: 'advertising' },
  'amazon-adsystem.com': { name: 'Amazon Ads', category: 'advertising', gdprCategory: 'advertising' },
  'adsrvr.org': { name: 'The Trade Desk', category: 'advertising', gdprCategory: 'advertising' },
  'adroll.com': { name: 'AdRoll', category: 'advertising', gdprCategory: 'advertising' },
  'pubmatic.com': { name: 'PubMatic', category: 'advertising', gdprCategory: 'advertising' },
  'rubiconproject.com': { name: 'Rubicon Project', category: 'advertising', gdprCategory: 'advertising' },
  'openx.net': { name: 'OpenX', category: 'advertising', gdprCategory: 'advertising' },
  'appnexus.com': { name: 'Xandr (AppNexus)', category: 'advertising', gdprCategory: 'advertising' },

  // Fonts (High carbon impact!)
  'fonts.googleapis.com': { name: 'Google Fonts', category: 'fonts', gdprCategory: 'functional', privacySafeAlternative: 'Self-host fonts, use system fonts, or Fontsource' },
  'fonts.gstatic.com': { name: 'Google Fonts (Assets)', category: 'fonts', gdprCategory: 'functional', privacySafeAlternative: 'Self-host fonts' },
  'use.typekit.net': { name: 'Adobe Fonts (Typekit)', category: 'fonts', gdprCategory: 'functional', privacySafeAlternative: 'Self-host fonts' },
  'kit.fontawesome.com': { name: 'Font Awesome Kit', category: 'fonts', gdprCategory: 'essential', privacySafeAlternative: 'Self-host Font Awesome or use Heroicons/Lucide' },
  'use.fontawesome.com': { name: 'Font Awesome CDN', category: 'fonts', gdprCategory: 'essential' },

  // Video
  'youtube.com': { name: 'YouTube', category: 'video', gdprCategory: 'functional', privacySafeAlternative: 'youtube-nocookie.com or Vimeo' },
  'youtube-nocookie.com': { name: 'YouTube (Privacy Enhanced)', category: 'video', gdprCategory: 'functional' },
  'ytimg.com': { name: 'YouTube (Assets)', category: 'video', gdprCategory: 'functional' },
  'vimeo.com': { name: 'Vimeo', category: 'video', gdprCategory: 'functional' },
  'vimeocdn.com': { name: 'Vimeo CDN', category: 'video', gdprCategory: 'functional' },
  'fast.wistia.net': { name: 'Wistia', category: 'video', gdprCategory: 'functional' },

  // Maps
  'maps.googleapis.com': { name: 'Google Maps', category: 'maps', gdprCategory: 'functional', privacySafeAlternative: 'OpenStreetMap, Mapbox (or self-hosted)' },
  'maps.gstatic.com': { name: 'Google Maps (Assets)', category: 'maps', gdprCategory: 'functional' },
  'api.mapbox.com': { name: 'Mapbox', category: 'maps', gdprCategory: 'functional' },

  // Payment
  'js.stripe.com': { name: 'Stripe.js', category: 'payment', gdprCategory: 'essential' },
  'm.stripe.com': { name: 'Stripe', category: 'payment', gdprCategory: 'essential' },
  'js.paypalobjects.com': { name: 'PayPal SDK', category: 'payment', gdprCategory: 'essential' },
  'braintreegateway.com': { name: 'Braintree', category: 'payment', gdprCategory: 'essential' },
  'pay.google.com': { name: 'Google Pay', category: 'payment', gdprCategory: 'essential' },

  // Chat
  'js.intercomcdn.com': { name: 'Intercom', category: 'chat', gdprCategory: 'functional' },
  'widget.intercom.io': { name: 'Intercom Widget', category: 'chat', gdprCategory: 'functional' },
  'static.zdassets.com': { name: 'Zendesk Widget', category: 'chat', gdprCategory: 'functional' },
  'chat.drift.com': { name: 'Drift', category: 'chat', gdprCategory: 'functional' },
  'embed.tawk.to': { name: 'Tawk.to', category: 'chat', gdprCategory: 'functional' },
  'code.tidio.co': { name: 'Tidio', category: 'chat', gdprCategory: 'functional' },
  'client.crisp.chat': { name: 'Crisp', category: 'chat', gdprCategory: 'functional' },
  'wchat.freshchat.com': { name: 'Freshchat', category: 'chat', gdprCategory: 'functional' },
  'fw-cdn.com': { name: 'Freshworks', category: 'chat', gdprCategory: 'functional' },

  // Auth
  'cdn.auth0.com': { name: 'Auth0', category: 'auth', gdprCategory: 'essential' },
  'cdn.okta.com': { name: 'Okta', category: 'auth', gdprCategory: 'essential' },

  // Error Tracking
  'browser.sentry-cdn.com': { name: 'Sentry', category: 'apm', gdprCategory: 'essential' },
  'cdn.rollbar.com': { name: 'Rollbar', category: 'apm', gdprCategory: 'essential' },
  'js-agent.newrelic.com': { name: 'New Relic', category: 'apm', gdprCategory: 'essential' },

  // CRM
  'js.hsforms.net': { name: 'HubSpot Forms', category: 'crm', gdprCategory: 'functional' },
  'track.hubspot.com': { name: 'HubSpot Tracking', category: 'crm', gdprCategory: 'tracking' },
  'munchkin.marketo.net': { name: 'Marketo Munchkin', category: 'crm', gdprCategory: 'tracking' },
  'chimpstatic.com': { name: 'Mailchimp', category: 'crm', gdprCategory: 'functional' },
  'static.klaviyo.com': { name: 'Klaviyo', category: 'crm', gdprCategory: 'functional' },
};

export const CARBON_INTENSITY_BY_COUNTRY: Record<string, number> = {
  'IS': 25,   // Iceland
  'NO': 28,   // Norway
  'PY': 30,   // Paraguay
  'SE': 41,   // Sweden
  'FR': 56,   // France
  'CH': 45,   // Switzerland
  'AT': 148,  // Austria
  'CA': 120,  // Canada
  'NZ': 115,  // New Zealand
  'DE': 385,  // Germany
  'GB': 233,  // United Kingdom
  'EU': 276,  // European Union average
  'JP': 471,  // Japan
  'KR': 415,  // South Korea
  'US': 386,  // United States
  'CN': 555,  // China
  'IN': 700,  // India
  'AU': 510,  // Australia
  'NL': 295,  // Netherlands
  'BE': 172,  // Belgium
  'ES': 208,  // Spain
  'IT': 340,  // Italy
  'PL': 635,  // Poland
  'CZ': 497,  // Czech Republic
  'FI': 67,   // Finland
  'DK': 166,  // Denmark
  'IE': 290,  // Ireland
  'PT': 131,  // Portugal
  'RU': 331,  // Russia
  'BR': 127,  // Brazil
  'MX': 449,  // Mexico
  'ZA': 700,  // South Africa
  'SG': 409,  // Singapore
  'TH': 449,  // Thailand
  'VN': 350,  // Vietnam
  'ID': 713,  // Indonesia
  'PH': 533,  // Philippines
  'MY': 585,  // Malaysia
  '__default': 442, // World average
};

export const GREEN_HOSTING_PROVIDERS: Record<string, {
  green: boolean | 'partial';
  method: string;
  percentage?: number;
  note?: string;
}> = {
  'google': { green: true, method: 'PPAs + offsets + on-site', percentage: 64 },
  'google-cloud': { green: true, method: 'PPAs + offsets', percentage: 64 },
  'aws': { green: 'partial', method: 'RECs (matched, not direct)', percentage: 100, note: 'Uses 100% renewable through RECs' },
  'amazon': { green: 'partial', method: 'RECs', percentage: 100 },
  'microsoft': { green: true, method: 'PPAs + RECs', percentage: 100 },
  'azure': { green: true, method: 'PPAs + RECs', percentage: 100 },
  'hetzner': { green: true, method: 'Direct renewable (hydro + wind)', percentage: 100 },
  'scaleway': { green: true, method: 'Hydro power (France)', percentage: 100 },
  'ovh': { green: 'partial', method: 'Partial renewable', percentage: 50 },
  'netlify': { green: true, method: 'Carbon neutral + renewable', percentage: 100 },
  'vercel': { green: true, method: 'Carbon neutral', percentage: 100 },
  'cloudflare': { green: true, method: 'Carbon neutral + RE committed', percentage: 100 },
  'digitalocean': { green: true, method: 'RECs', percentage: 100 },
  'linode': { green: 'partial', method: 'RECs in some regions', percentage: 50 },
  'fastly': { green: 'partial', method: 'RECs + offset', percentage: 100 },
  'akamai': { green: true, method: 'Carbon neutral operations', percentage: 100 },
};

export const SECURITY_HEADERS_REFERENCE = {
  'strict-transport-security': {
    name: 'HSTS',
    description: 'Forces HTTPS connections',
    idealValue: 'max-age=31536000; includeSubDomains; preload',
    maxScore: 25,
  },
  'content-security-policy': {
    name: 'CSP',
    description: 'Controls resources the page can load',
    maxScore: 30,
  },
  'x-frame-options': {
    name: 'X-Frame-Options',
    description: 'Prevents clickjacking attacks',
    idealValue: 'DENY',
    maxScore: 10,
  },
  'x-content-type-options': {
    name: 'X-Content-Type-Options',
    description: 'Prevents MIME type sniffing',
    idealValue: 'nosniff',
    maxScore: 5,
  },
  'referrer-policy': {
    name: 'Referrer-Policy',
    description: 'Controls referrer information',
    idealValue: 'strict-origin-when-cross-origin',
    maxScore: 10,
  },
  'permissions-policy': {
    name: 'Permissions-Policy',
    description: 'Controls browser feature access',
    maxScore: 10,
  },
  'cross-origin-embedder-policy': {
    name: 'COEP',
    description: 'Prevents cross-origin loading without explicit permission',
    maxScore: 5,
  },
  'cross-origin-opener-policy': {
    name: 'COOP',
    description: 'Isolates browsing context group',
    maxScore: 5,
  },
};

export const INDUSTRY_BENCHMARKS = {
  allIndustries: {
    avgCo2PerView: 0.76,
    avgPageSizeKb: 2200,
    avgThirdPartyCount: 18,
    avgLighthouseScore: 45,
  },
  ecommerce: {
    avgCo2PerView: 1.4,
    avgPageSizeKb: 3800,
    avgThirdPartyCount: 32,
  },
  news: {
    avgCo2PerView: 1.2,
    avgPageSizeKb: 3200,
    avgThirdPartyCount: 45,
  },
  saas: {
    avgCo2PerView: 0.5,
    avgPageSizeKb: 1800,
    avgThirdPartyCount: 12,
  },
  blog: {
    avgCo2PerView: 0.4,
    avgPageSizeKb: 1200,
    avgThirdPartyCount: 8,
  },
};
