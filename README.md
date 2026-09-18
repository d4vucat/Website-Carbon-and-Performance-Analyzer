# Website Carbon & Performance Analyzer

A full-stack tool that deep-analyzes any public website using a real Chromium browser, measuring CO₂ emissions, Core Web Vitals, security posture, cookie compliance, IAB TCF consent, third-party tracking, accessibility, and more — all in a single request.

---

## Features

### Analysis Engine
- **Real Chromium (Playwright)** — stealth mode enabled; bypasses common bot-protection systems (nytimes.com, paywalled sites, Cloudflare-protected pages)
- **HTTP + DNS + TLS** — headers, redirect chains, HSTS, DNSSEC, CAA, WHOIS, IP geolocation, ASN
- **Wappalyzer technology detection** — 200+ technology categories, versions, confidence scores
- **BuiltWith integration** — historical technology stack data

### Carbon & Sustainability
- **SWD Model v4** (Sustainable Web Design) — CO₂ per page view
- **Green hosting check** — The Green Web Foundation + fallback HTTP heuristics
- **Resource-level carbon breakdown** — per JS, CSS, image, font
- **Grid carbon intensity** — live data via Electricity Maps API

### Performance
- **Lighthouse-equivalent scoring** — Performance, Accessibility, SEO scores via real browser
- **Core Web Vitals** — LCP, CLS, FID, INP, TTFB from CrUX API + live measurement
- **JS Coverage** — unused JavaScript bytes
- **CSS Coverage** — unused CSS bytes
- **JS Profiler** — per-script CPU execution time via Chrome DevTools Protocol
- **Long tasks** — TBT-contributing tasks > 50ms

### Cookie Audit (full RFC 6265)
- **All attributes** — Name, Value, Domain, Path, Expires, Secure, HttpOnly, SameSite, Partitioned
- **Cookie prefix validation** — `__Secure-`, `__Host-`, `__Http-`, `__Host-Http-` per RFC 6265bis
- **Per-cookie security scoring** — 0–100 score with specific issue descriptions
- **Classification** — Essential, Functional, Tracking, Advertising, Unknown (pattern matching)
- **First-party vs. third-party** — derived from page hostname vs. cookie domain
- **Session vs. persistent** — with formatted expiry dates
- **Audit summary** — aggregate stats: avg score, critical issues, SameSite breakdown

### IAB TCF & Privacy APIs
- **IAB TCF v2.x** — calls `window.__tcfapi('getTCData', 2, callback)` from inside the real page; captures TC string, CMP ID, all 11 purpose consents, legitimate interest flags, vendor count, publisher country
- **TCF v1.1 fallback** — `window.__cmp('getConsentData', ...)` for legacy CMPs
- **US Privacy (CCPA)** — `window.__uspapi` USP string with decoded interpretation
- **IAB GPP** — `window.__gpp` Global Privacy Platform detection
- **Special Feature opt-ins** — SF1 (precise geolocation), SF2 (device fingerprinting)
- **Analytics before consent** — detects if tracking scripts load before user grants consent

### Security
- **Security headers** — CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy, CORP/COEP/COOP
- **SSL Labs grade** — fetched from Qualys SSL Labs API
- **HSTS preload** — chromium preload list membership check
- **SRI** — Subresource Integrity detection on scripts/stylesheets
- **Bot protection** — Cloudflare, Akamai, Imperva, Fastly, reCAPTCHA, hCaptcha detection
- **OSV vulnerability scan** — open-source vulnerability database for detected libraries

### Accessibility
- **WCAG 2.1 AA** — automated axe-core rules via Playwright
- **ARIA roles, labels, alt text** — structural analysis
- **Contrast ratios, keyboard nav** — extended heuristics

### Network & Third Parties
- **Request waterfall** — all network requests with timing, size, type
- **Third-party categorization** — analytics, CDN, advertising, social, fonts, customer support
- **WebSocket detection**, **WASM detection**, **Web Worker detection**

### Compare Mode
- **Side-by-side analysis** — run up to 5 URLs simultaneously with full metrics comparison
- **Rankings** — Carbon, Performance, Security, Overall
- **CO₂ chart** — visual bar chart comparison
- **Carbon grade** — A+/A/B/C/D/E/F derived from CO₂ per page view

---

## Architecture

```
website-carbon-analyzer/
├── backend/                   TypeScript / Node.js
│   └── src/
│       ├── modules/
│       │   ├── browser-analyzer.ts   Playwright + stealth + cookie audit + TCF collection
│       │   ├── sustainability.ts     detectCMP, IAB TCF parsing, GDPR scoring, cookie audit
│       │   ├── orchestrator.ts       Job orchestration, result assembly
│       │   ├── competitor.ts         Parallel multi-URL analysis
│       │   ├── http-analyzer.ts      HTTP/DNS/TLS/WHOIS
│       │   ├── security-analyzer.ts  Security headers, CSP parsing
│       │   ├── carbon-calculator.ts  SWD model, grid intensity
│       │   ├── wappalyzer-detector   Technology detection
│       │   ├── image-analyzer.ts     Image optimization analysis
│       │   └── font-analyzer.ts      Font loading analysis
│       ├── routes/api.ts             REST API (Express)
│       ├── jobs/job-manager.ts       Async job queue
│       └── types/index.ts            Shared TypeScript types
└── frontend/                  React + Vite + Tailwind
    └── src/
        ├── app/App.tsx               Nav: Analyze | Compare | Monitor
        ├── components/
│       │   ├── HeroSection.tsx       URL input
│       │   ├── ResultsDashboard.tsx  Tab layout
│       │   ├── CompetitorMode.tsx    Side-by-side compare
│       │   └── tabs/
│       │       ├── CookieAuditTab.tsx   ← Cookie audit + IAB TCF
│       │       ├── ConsentTab.tsx       GDPR overview
│       │       ├── SecurityTab.tsx      Security headers
│       │       ├── PerformanceTab.tsx   Web Vitals
│       │       └── ...                 (14 other tabs)
        └── store/                    Zustand state management
```

---

## Setup

### Prerequisites
- Node.js 20+
- Chromium (auto-installed by Playwright)

### Install

```bash
# Root — install workspaces
npm install

# Install Playwright Chromium browser
cd backend && npx playwright install chromium
```

### Environment (optional)

```bash
# backend/.env
ELECTRICITY_MAPS_API_KEY=...   # live carbon intensity data
MAXMIND_DB_PATH=...            # GeoLite2 City DB for IP geolocation
PORT=3001
```

### Run (development)

```bash
# From repo root — starts both backend and frontend concurrently
npm run dev

# Frontend only
cd frontend && npm run dev      # http://localhost:5173

# Backend only
cd backend && npm run dev       # http://localhost:3001
```

### Build (production)

```bash
npm run build
# Frontend: frontend/dist/
# Backend: backend/dist/
```

---

## API

### Analyze a URL

```
POST /api/analyze
Content-Type: application/json

{ "url": "https://example.com" }
```

Returns `{ jobId: "..." }` immediately. Poll:

```
GET /api/jobs/:jobId
```

Response includes full `AnalysisResult` with:
- `carbon` — CO₂ estimates, transfer size, green hosting
- `performance` — scores, Web Vitals, coverage
- `cookies` — full RFC 6265 audit array (see below)
- `consent` — CMP detection, IAB TCF data, GDPR score, cookie audit summary
- `security` — headers, TLS, SRI
- `technologies` — Wappalyzer detections
- `thirdParties` — categorized external requests
- `dns`, `tls`, `whois` — infrastructure data

### Cookie object schema

```typescript
{
  name: string
  value: string        // truncated to 200 chars
  domain: string
  path: string
  httpOnly: boolean
  secure: boolean
  sameSite?: "Strict" | "Lax" | "None"
  expires?: number     // Unix timestamp, -1 = session
  // Audit fields
  size: number
  isSession: boolean
  isThirdParty: boolean
  prefix: "" | "__Secure-" | "__Host-" | "__Http-" | "__Host-Http-"
  prefixValid: boolean
  prefixIssues: string[]
  classification: "essential" | "functional" | "tracking" | "advertising" | "unknown"
  securityScore: number       // 0–100
  securityIssues: string[]
  partitioned: boolean
}
```

### IAB TCF data schema

```typescript
consent.iabTcfData: {
  version: "1.1" | "2.0" | "2.2" | null
  cmpId: number | null
  tcString: string | null          // first 200 chars
  purposes: Array<{
    id: number                     // 1–11 (IAB standard purposes)
    name: string
    description: string
    hasConsent: boolean | null     // null = API call failed / banner not shown
    hasLegitimateInterest: boolean | null
  }>
  specialFeatureOptins: Record<number, boolean>
  vendorConsents: number[]
  vendorCount: number
  publisherCC: string | null
  gdprApplies: boolean | null
  uspString: string | null         // CCPA US Privacy String
  gppDetected: boolean
  apiCallSuccess: boolean
}
```

### Compare URLs

```
POST /api/competitor/sessions
{ "urls": ["https://a.com", "https://b.com", "https://c.com"] }
```

Returns `{ sessionId }`. Poll:

```
GET /api/competitor/sessions/:sessionId
```

---

## Stealth Browser Mode

Bot-protected sites (e.g. nytimes.com, paywalled news) previously failed with empty results. The browser now:

1. Passes `--disable-blink-features=AutomationControlled` to Chromium
2. Injects an init script that overrides `navigator.webdriver → undefined`, adds realistic plugin array, sets language/memory/CPU core counts
3. Sets realistic HTTP headers: `Accept`, `Accept-Language`, `sec-ch-ua`, `sec-ch-ua-platform`

This makes the browser indistinguishable from a normal user session for the majority of bot-protection systems.

---

## IAB TCF Implementation Notes

The TCF API is called via `page.evaluate()` from inside the live Playwright page, **after** the page JavaScript has fully loaded. This captures the actual consent state rather than just detecting the API's presence.

**Call sequence:**
1. `__tcfapi('getTCData', 2, callback)` — primary call
2. Falls back to `__tcfapi('ping', 2, callback)` if getTCData fails
3. Falls back to `__cmp('getConsentData', null, callback)` for TCF v1.1
4. Falls back to `null` with a 3-second timeout

**Purpose mapping** follows the official IAB TCF Vendor List purposes 1–11 plus Special Features 1–2.

**CCPA:** `__uspapi('getUSPData', 1, callback)` captures the US Privacy String (e.g., `1YNY` = version 1, notice given, opted out, LSPA not covered).

**GPP:** `__gpp('ping', callback)` for the next-generation IAB Global Privacy Platform.

---

## Removed Features

- **Before/After Diff** (`DiffMode`) — removed
- **Device emulation selector** — removed from UI; backend defaults to desktop viewport

---

## License

MIT
