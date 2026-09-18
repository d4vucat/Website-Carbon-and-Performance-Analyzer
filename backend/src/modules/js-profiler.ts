/**
 * js-profiler.ts
 * JavaScript execution profiling via Playwright's CDP (Chrome DevTools Protocol).
 * Captures V8 CPU profile, identifies long tasks, script execution hotspots,
 * third-party JS cost, and main-thread blocking time.
 */

import type { Page } from 'playwright';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('js-profiler');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScriptProfile {
  url: string;
  selfTime: number;      // ms — time spent in this script's own functions
  totalTime: number;     // ms — including callees
  callCount: number;
  isThirdParty: boolean;
  category: 'analytics' | 'ads' | 'framework' | 'polyfill' | 'utility' | 'app' | 'unknown';
  topFunctions: FunctionProfile[];
}

export interface FunctionProfile {
  name: string;
  selfTime: number;
  callCount: number;
  url: string;
  lineNumber: number;
}

export interface LongTask {
  startTime: number;
  duration: number;      // ms
  attribution: string;   // script URL or 'unknown'
}

export interface JsExecutionReport {
  totalJsTime: number;       // ms — all JS execution
  mainThreadBlockingTime: number; // ms — sum of tasks > 50ms beyond 50ms
  longTaskCount: number;
  longTaskTotalMs: number;
  thirdPartyJsTime: number;  // ms
  firstPartyJsTime: number;  // ms
  scriptProfiles: ScriptProfile[];
  longTasks: LongTask[];
  topBottlenecks: FunctionProfile[];
  score: number;             // 0–100 (100 = fast)
  grade: string;
}

// ---------------------------------------------------------------------------
// URL classification
// ---------------------------------------------------------------------------

const THIRD_PARTY_PATTERNS = [
  /google-analytics|googletagmanager|gtag/i,
  /facebook\.net|fbq/i,
  /doubleclick|googlesyndication/i,
  /hotjar\.com/i,
  /segment\.com|segment\.io/i,
  /mixpanel\.com/i,
  /intercom\.io/i,
  /zendesk\.com/i,
  /cloudflare/i,
  /cdn\.jsdelivr\.net/i,
  /unpkg\.com/i,
  /cdnjs\.cloudflare/i,
];

const CATEGORY_PATTERNS: Array<[ScriptProfile['category'], RegExp]> = [
  ['analytics', /analytics|gtag|ga\.|hotjar|mixpanel|segment|amplitude/i],
  ['ads', /googlesyndication|doubleclick|adsbygoogle|adsystem|prebid/i],
  ['framework', /react|vue|angular|svelte|next|nuxt|gatsby|remix/i],
  ['polyfill', /polyfill|core-js|babel-runtime/i],
  ['utility', /lodash|underscore|moment|dayjs|axios|fetch/i],
];

// Scripts injected by the analyzer itself — exclude from profiling results
const INJECTED_SCRIPT_PATTERNS = [
  /axe[\.\-]min\.js/i,           // axe-core accessibility scanner
  /axe\.js/i,
  /playwright/i,                  // Playwright internals
  /__playwright/i,
  /\/__pw_/i,
  /chrome-extension:\/\//i,       // Browser extensions
  /^extensions::/i,
  /^v8-/,                         // V8 internals
  /^native\s/i,                   // Native code
];

function isInjectedScript(url: string): boolean {
  return INJECTED_SCRIPT_PATTERNS.some(p => p.test(url));
}

function classifyUrl(url: string): { isThirdParty: boolean; category: ScriptProfile['category'] } {
  const isThirdParty = THIRD_PARTY_PATTERNS.some(p => p.test(url));
  for (const [category, pattern] of CATEGORY_PATTERNS) {
    if (pattern.test(url)) return { isThirdParty, category };
  }
  return { isThirdParty, category: isThirdParty ? 'unknown' : 'app' };
}

// ---------------------------------------------------------------------------
// CDP profile parsing
// ---------------------------------------------------------------------------

interface CdpProfileNode {
  id: number;
  callFrame: { functionName: string; scriptId: string; url: string; lineNumber: number; columnNumber: number };
  hitCount: number;
  children?: number[];
  positionTicks?: Array<{ line: number; ticks: number }>;
}

interface CdpProfile {
  nodes: CdpProfileNode[];
  startTime: number;
  endTime: number;
  samples?: number[];
  timeDeltas?: number[];
}

function parseV8Profile(profile: CdpProfile, sampleIntervalMs = 0.1): ScriptProfile[] {
  const nodeMap = new Map<number, CdpProfileNode>(profile.nodes.map(n => [n.id, n]));
  const scriptTimes = new Map<string, { selfTime: number; totalTime: number; callCount: number; functions: Map<string, FunctionProfile> }>();

  const samples = profile.samples ?? [];
  const timeDeltas = profile.timeDeltas ?? [];

  // Calculate self-time per node using sample counts and time deltas
  const nodeSelfTime = new Map<number, number>();
  for (let i = 0; i < samples.length; i++) {
    const nodeId = samples[i];
    const dt = (timeDeltas[i] ?? sampleIntervalMs * 1000) / 1000; // μs → ms
    nodeSelfTime.set(nodeId, (nodeSelfTime.get(nodeId) ?? 0) + dt);
  }

  // Roll up per URL
  for (const [nodeId, selfMs] of nodeSelfTime) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    const url = node.callFrame.url || 'unknown';
    if (!url || url === 'unknown' || url.startsWith('v8-')) continue;

    const entry = scriptTimes.get(url) ?? { selfTime: 0, totalTime: 0, callCount: 0, functions: new Map() };
    entry.selfTime += selfMs;
    entry.callCount += node.hitCount || 1;

    const funcName = node.callFrame.functionName || '(anonymous)';
    const funcKey = `${funcName}:${node.callFrame.lineNumber}`;
    const func = entry.functions.get(funcKey) ?? { name: funcName, selfTime: 0, callCount: 0, url, lineNumber: node.callFrame.lineNumber };
    func.selfTime += selfMs;
    func.callCount += node.hitCount || 1;
    entry.functions.set(funcKey, func);

    scriptTimes.set(url, entry);
  }

  return Array.from(scriptTimes.entries())
    .filter(([url]) => !isInjectedScript(url))  // exclude analyzer's own injected scripts
    .map(([url, data]) => {
      const { isThirdParty, category } = classifyUrl(url);
      return {
        url,
        selfTime: Number(data.selfTime.toFixed(2)),
        totalTime: Number(data.selfTime.toFixed(2)),
        callCount: data.callCount,
        isThirdParty,
        category,
        topFunctions: Array.from(data.functions.values())
          .sort((a, b) => b.selfTime - a.selfTime)
          .slice(0, 5),
      };
    })
    .sort((a, b) => b.selfTime - a.selfTime);
}

// ---------------------------------------------------------------------------
// Main exports
// ---------------------------------------------------------------------------

/** Process a V8 CPU profile already collected via CDP Profiler.stop() */
export async function profileJsExecutionFromCdp(profile: CdpProfile): Promise<JsExecutionReport> {
  try {
    const scriptProfiles = parseV8Profile(profile);

    const samples = profile.samples ?? [];
    const timeDeltas = profile.timeDeltas ?? [];

    const totalJsTime = scriptProfiles.reduce((s, p) => s + p.selfTime, 0);
    const thirdPartyJsTime = scriptProfiles.filter(p => p.isThirdParty).reduce((s, p) => s + p.selfTime, 0);

    // Detect long tasks: a single sample timeDeltas gap > 50ms = main thread was blocked
    const longTasks: LongTask[] = [];
    let elapsed = (profile.startTime ?? 0) / 1000;

    for (let i = 0; i < samples.length; i++) {
      const dtMs = (timeDeltas[i] ?? 100) / 1000; // μs → ms
      elapsed += dtMs;
      // A gap > 50ms in the sample stream = browser was blocked (long task)
      if (dtMs > 50) {
        const node = profile.nodes.find(n => n.id === samples[i]);
        const attrib = node?.callFrame.url || 'unknown';
        // Exclude our own injected scroll/analysis code
        if (!isInjectedScript(attrib)) {
          longTasks.push({
            startTime: Number((elapsed - dtMs).toFixed(1)),
            duration: Number(dtMs.toFixed(1)),
            attribution: attrib,
          });
        }
      }
    }

    const longTaskTotalMs = longTasks.reduce((s, t) => s + t.duration, 0);
    // Filter long tasks attributed to injected scripts (axe-core etc)
    const realLongTasks = longTasks.filter(t => !isInjectedScript(t.attribution));
    const mainThreadBlockingTime = realLongTasks.reduce((s, t) => s + Math.max(0, t.duration - 50), 0);
    const topBottlenecks = scriptProfiles.flatMap(s => s.topFunctions).sort((a, b) => b.selfTime - a.selfTime).slice(0, 10);

    // Score based on site's own JS (exclude injected tool scripts)
    const score = Math.max(0, Math.min(100, Math.round(
      100 - (totalJsTime / 50) - (mainThreadBlockingTime / 10) - (realLongTasks.length * 2)
    )));
    const grades = ['F','F','D','D','C','C','B','B','A','A','A+'];
    const grade = grades[Math.floor(score / 10)] ?? 'F';

    return {
      totalJsTime: Number(totalJsTime.toFixed(1)),
      mainThreadBlockingTime: Number(mainThreadBlockingTime.toFixed(1)),
      longTaskCount: realLongTasks.length,
      longTaskTotalMs: Number(longTaskTotalMs.toFixed(1)),
      thirdPartyJsTime: Number(thirdPartyJsTime.toFixed(1)),
      firstPartyJsTime: Number((totalJsTime - thirdPartyJsTime).toFixed(1)),
      scriptProfiles: scriptProfiles.slice(0, 30),
      longTasks: longTasks.slice(0, 20),
      topBottlenecks,
      score,
      grade,
    };
  } catch (err) {
    logger.warn({ err }, 'Failed to process CDP profile');
    return emptyReport();
  }
}

/** Legacy: collect profile within an already-loaded page (creates new CDP session) */
export async function profileJsExecution(page: Page): Promise<JsExecutionReport> {
  try {
    const cdpSession = await page.context().newCDPSession(page);
    await cdpSession.send('Profiler.enable');
    await cdpSession.send('Profiler.setSamplingInterval', { interval: 100 });
    await cdpSession.send('Profiler.start');
    await new Promise(r => setTimeout(r, 2000));
    const profileResult = await cdpSession.send('Profiler.stop') as { profile: CdpProfile };
    await cdpSession.detach();
    return profileJsExecutionFromCdp(profileResult.profile);
  } catch (err) {
    logger.warn({ err }, 'JS profiling failed');
    return emptyReport();
  }
}

function emptyReport(): JsExecutionReport {
  return {
    totalJsTime: 0, mainThreadBlockingTime: 0, longTaskCount: 0, longTaskTotalMs: 0,
    thirdPartyJsTime: 0, firstPartyJsTime: 0, scriptProfiles: [], longTasks: [],
    topBottlenecks: [], score: 100, grade: 'A+',
  };
}
