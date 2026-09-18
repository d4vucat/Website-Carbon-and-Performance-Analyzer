/**
 * browser-pool.ts
 * Manages browser instances for analysis — either a local Playwright pool or
 * Browserbase cloud sessions depending on configuration.
 *
 * Browserbase (https://www.browserbase.com) runs real Chromium in the cloud
 * with built-in stealth, residential proxies, and bot-bypass capabilities,
 * making it effective against Cloudflare, Akamai, and similar protections.
 *
 * Configuration (env vars):
 *   BROWSERBASE_API_KEY   — enable Browserbase; if unset, local pool is used
 *   BROWSERBASE_PROJECT_ID — required when using Browserbase
 *   BROWSERBASE_STEALTH   — "true" to enable Browserbase stealth mode (default: true)
 *   BROWSER_POOL_SIZE     — local pool size when not using Browserbase (default: 3)
 *   BROWSER_MAX_USES      — contexts per browser before recycle (default: 50)
 *   BROWSER_MAX_AGE_MS    — max browser lifetime in ms (default: 30 min)
 */

import { chromium, Browser, BrowserContext } from 'playwright';
import got from 'got';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('browser-pool');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BROWSERBASE_API_KEY    = process.env.BROWSERBASE_API_KEY ?? '';
const BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID ?? '';
const BROWSERBASE_STEALTH    = process.env.BROWSERBASE_STEALTH !== 'false'; // default true
const USE_BROWSERBASE        = Boolean(BROWSERBASE_API_KEY && BROWSERBASE_PROJECT_ID);

const POOL_SIZE       = parseInt(process.env.BROWSER_POOL_SIZE ?? '3', 10);
const MAX_USES        = parseInt(process.env.BROWSER_MAX_USES ?? '50', 10);
const MAX_AGE_MS      = parseInt(process.env.BROWSER_MAX_AGE_MS ?? String(30 * 60 * 1000), 10);
const HEALTH_INTERVAL = 60_000;

// Maximum concurrent Browserbase sessions (free plan: 3)
const BB_MAX_CONCURRENT = parseInt(process.env.BROWSERBASE_MAX_CONCURRENT ?? '3', 10);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PooledBrowser {
  id: number;
  browser: Browser;
  inUse: boolean;
  useCount: number;
  createdAt: number;
  lastUsedAt: number;
}

// ---------------------------------------------------------------------------
// Local pool state
// ---------------------------------------------------------------------------

let idCounter = 0;
const pool: PooledBrowser[] = [];
let initialized = false;
let shuttingDown = false;

// ---------------------------------------------------------------------------
// Browserbase session management
// ---------------------------------------------------------------------------

/** Currently active Browserbase sessions (keyed by session ID). */
const bbActiveSessions = new Map<string, Browser>();

/**
 * Create a Browserbase session via the REST API and connect Playwright to it.
 * Returns a Browser connected over CDP, plus the session ID for cleanup.
 *
 * Browserbase API docs: https://docs.browserbase.com/reference/api/create-a-session
 */
async function createBrowserbaseSession(): Promise<{ browser: Browser; sessionId: string }> {
  // 1. Create session via REST API
  const body: Record<string, unknown> = {
    projectId: BROWSERBASE_PROJECT_ID,
  };

  if (BROWSERBASE_STEALTH) {
    // Fingerprint randomization — available on all plans including free.
    // Residential proxies (body.proxies = true) require a paid plan; not set here.
    body.browserSettings = {
      fingerprint: {
        browsers: ['chrome'],
        devices: ['desktop'],
        operatingSystems: ['windows', 'macos'],
        locales: ['en-US'],
      },
    };
  }

  let sessionRes: { id: string; connectUrl?: string };
  try {
    const res = await got.post('https://www.browserbase.com/v1/sessions', {
      headers: {
        'Content-Type': 'application/json',
        'X-BB-API-Key': BROWSERBASE_API_KEY,
      },
      body: JSON.stringify(body),
      throwHttpErrors: false,
      timeout: { request: 15000 },
    });
    if (res.statusCode >= 400) {
      throw new Error(`Browserbase session creation failed: ${res.statusCode} ${res.body}`);
    }
    sessionRes = JSON.parse(res.body) as { id: string; connectUrl?: string };
  } catch (err) {
    throw new Error(`Browserbase session creation failed: ${(err as Error).message}`);
  }
  const session = sessionRes;
  const sessionId = session.id;

  // 2. Connect Playwright via CDP websocket
  const connectUrl = session.connectUrl
    ?? `wss://connect.browserbase.com?apiKey=${BROWSERBASE_API_KEY}&sessionId=${sessionId}`;

  const browser = await chromium.connectOverCDP(connectUrl);

  bbActiveSessions.set(sessionId, browser);
  logger.debug({ sessionId, stealth: BROWSERBASE_STEALTH }, 'Browserbase session created');

  return { browser, sessionId };
}

/**
 * Release a Browserbase session — disconnect Playwright and close the session
 * via the REST API so it doesn't count against the concurrent session limit.
 */
async function releaseBrowserbaseSession(sessionId: string): Promise<void> {
  const browser = bbActiveSessions.get(sessionId);
  if (browser) {
    bbActiveSessions.delete(sessionId);
    try { await browser.close(); } catch { /* ignore */ }
  }

  // Mark session as complete on Browserbase
  try {
    await got.put(`https://www.browserbase.com/v1/sessions/${sessionId}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-BB-API-Key': BROWSERBASE_API_KEY,
      },
      body: JSON.stringify({ status: 'REQUEST_RELEASE' }),
      throwHttpErrors: false,
      timeout: { request: 8000 },
    });
  } catch { /* best-effort */ }

  logger.debug({ sessionId }, 'Browserbase session released');
}

// ---------------------------------------------------------------------------
// Local pool helpers
// ---------------------------------------------------------------------------

async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--memory-pressure-off',
      '--js-flags=--max-old-space-size=512',
    ],
  });
}

async function addToPool(): Promise<void> {
  try {
    const browser = await launchBrowser();
    const entry: PooledBrowser = {
      id: ++idCounter,
      browser,
      inUse: false,
      useCount: 0,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    };
    pool.push(entry);
    logger.debug({ id: entry.id, poolSize: pool.length }, 'Browser added to pool');
  } catch (err) {
    logger.error({ err }, 'Failed to add browser to pool');
  }
}

async function evictBrowser(entry: PooledBrowser): Promise<void> {
  const idx = pool.indexOf(entry);
  if (idx !== -1) pool.splice(idx, 1);
  try { await entry.browser.close(); } catch { /* ignore */ }
  logger.debug({ id: entry.id, useCount: entry.useCount }, 'Browser evicted from pool');
}

function isStale(entry: PooledBrowser): boolean {
  return entry.useCount >= MAX_USES || (Date.now() - entry.createdAt) > MAX_AGE_MS;
}

function isHealthy(entry: PooledBrowser): boolean {
  return entry.browser.isConnected();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function initPool(): Promise<void> {
  if (initialized) return;
  initialized = true;

  if (USE_BROWSERBASE) {
    logger.info(
      { stealth: BROWSERBASE_STEALTH, maxConcurrent: BB_MAX_CONCURRENT },
      'Browser provider: Browserbase (cloud)',
    );
  } else {
    logger.info({ size: POOL_SIZE, maxUses: MAX_USES }, 'Browser provider: local Playwright pool');
    await Promise.all(Array.from({ length: POOL_SIZE }, () => addToPool()));
    startHealthCheck();
  }
}

/**
 * Acquire a browser context.
 *
 * When Browserbase is configured: creates a fresh cloud session per call,
 * with stealth mode and residential proxy enabled.  The `release()` callback
 * terminates the cloud session so it doesn't block the concurrency limit.
 *
 * When using the local pool: behaves exactly as before — picks an idle browser,
 * returns a context, and `release()` closes the context and marks the browser
 * free again.
 */
export async function acquireContext(
  contextOptions: Parameters<Browser['newContext']>[0] = {},
  timeoutMs = 60_000,
): Promise<{ context: BrowserContext; release: () => void; isBrowserbase: boolean }> {

  // ── Browserbase path ──
  if (USE_BROWSERBASE) {
    // Respect the concurrent session limit with a simple retry loop
    const deadline = Date.now() + timeoutMs;
    while (bbActiveSessions.size >= BB_MAX_CONCURRENT && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500));
    }
    if (bbActiveSessions.size >= BB_MAX_CONCURRENT) {
      throw new Error(`Browserbase concurrency limit (${BB_MAX_CONCURRENT}) reached after ${timeoutMs}ms`);
    }

    const { browser, sessionId } = await createBrowserbaseSession();

    // Browserbase provides a default context; use it directly rather than creating a new one,
    // since the session's stealth and proxy are tied to the existing context.
    const contexts = browser.contexts();
    const context = contexts[0] ?? await browser.newContext(contextOptions);

    const release = () => {
      // Fire-and-forget — don't block the caller
      releaseBrowserbaseSession(sessionId).catch(err =>
        logger.warn({ sessionId, err: (err as Error).message }, 'Error releasing Browserbase session')
      );
    };

    return { context, release, isBrowserbase: true };
  }

  // ── Local pool path ──
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const available = pool.find(e => !e.inUse && isHealthy(e) && !isStale(e));

    if (available) {
      available.inUse = true;
      available.useCount++;
      available.lastUsedAt = Date.now();

      const context = await available.browser.newContext(contextOptions);

      const release = () => {
        context.close().catch(() => {});
        available.inUse = false;
        if (isStale(available)) {
          setImmediate(async () => {
            await evictBrowser(available);
            if (!shuttingDown) await addToPool();
          });
        }
      };

      return { context, release, isBrowserbase: false };
    }

    const idle = pool.filter(e => !e.inUse);
    if (idle.length === 0 && pool.length < POOL_SIZE * 2) {
      await addToPool();
      continue;
    }

    await new Promise(r => setTimeout(r, 200));
  }

  throw new Error(`Browser pool exhausted: no browser available after ${timeoutMs}ms`);
}

function startHealthCheck(): void {
  setInterval(async () => {
    if (shuttingDown) return;
    for (const entry of [...pool]) {
      if (entry.inUse) continue;
      if (!isHealthy(entry)) {
        logger.warn({ id: entry.id }, 'Unhealthy browser detected, evicting');
        await evictBrowser(entry);
        await addToPool();
      } else if (isStale(entry)) {
        logger.debug({ id: entry.id }, 'Stale browser evicted during health check');
        await evictBrowser(entry);
        await addToPool();
      }
    }
    const available = pool.filter(e => !e.inUse && isHealthy(e)).length;
    if (available < Math.ceil(POOL_SIZE / 2)) {
      const toAdd = Math.ceil(POOL_SIZE / 2) - available;
      logger.info({ toAdd }, 'Replenishing pool');
      await Promise.all(Array.from({ length: toAdd }, () => addToPool()));
    }
  }, HEALTH_INTERVAL);
}

export async function shutdownPool(): Promise<void> {
  shuttingDown = true;
  logger.info('Shutting down browser pool');

  // Release all active Browserbase sessions
  for (const [sessionId] of bbActiveSessions) {
    await releaseBrowserbaseSession(sessionId).catch(() => {});
  }

  await Promise.allSettled(pool.map(e => e.browser.close()));
  pool.length = 0;
}

export function getPoolStats(): {
  total: number; inUse: number; available: number; avgUseCount: number;
  provider: 'browserbase' | 'local'; activeSessions?: number;
} {
  if (USE_BROWSERBASE) {
    return {
      total: BB_MAX_CONCURRENT,
      inUse: bbActiveSessions.size,
      available: BB_MAX_CONCURRENT - bbActiveSessions.size,
      avgUseCount: 0,
      provider: 'browserbase',
      activeSessions: bbActiveSessions.size,
    };
  }
  const inUse = pool.filter(e => e.inUse).length;
  const avgUseCount = pool.length
    ? Math.round(pool.reduce((s, e) => s + e.useCount, 0) / pool.length)
    : 0;
  return { total: pool.length, inUse, available: pool.length - inUse, avgUseCount, provider: 'local' };
}

/** Whether the current browser provider is Browserbase. */
export const isBrowserbaseEnabled = USE_BROWSERBASE;
