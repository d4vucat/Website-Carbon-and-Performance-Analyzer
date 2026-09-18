/**
 * competitor.ts
 * Runs parallel analysis of multiple URLs and produces
 * a side-by-side comparison report.
 */

import { createModuleLogger } from '../utils/logger.js';
import { createJob, getJob, waitForJob } from '../jobs/job-manager.js';
import { stmts } from '../utils/database.js';
import { v4 as uuid } from 'uuid';
import type { AnalysisResult } from '../types/index.js';

const logger = createModuleLogger('competitor');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompetitorSite {
  url: string;
  domain: string;
  jobId: string;
  status: 'pending' | 'running' | 'done' | 'error';
  error?: string;
  result?: AnalysisResult;
}

export interface CompetitorMetric {
  label: string;
  unit: string;
  winner: string | null;  // domain of winner
  values: Record<string, number | string | null>;
  higherIsBetter: boolean;
}

export interface CompetitorReport {
  sessionId: string;
  urls: string[];
  sites: CompetitorSite[];
  metrics: CompetitorMetric[];
  rankings: {
    carbon: string[];
    performance: string[];
    security: string[];
    overall: string[];
  };
  summary: string;
  createdAt: number;
  completedAt?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

function pickWinner(
  values: Record<string, number | null>,
  higherIsBetter: boolean,
): string | null {
  const entries = Object.entries(values).filter(([, v]) => v !== null) as [string, number][];
  if (!entries.length) return null;
  entries.sort((a, b) => higherIsBetter ? b[1] - a[1] : a[1] - b[1]);
  return entries[0][0];
}

function rankDomains(values: Record<string, number | null>, higherIsBetter: boolean): string[] {
  return Object.entries(values)
    .filter(([, v]) => v !== null)
    .sort((a, b) => higherIsBetter
      ? (b[1] as number) - (a[1] as number)
      : (a[1] as number) - (b[1] as number))
    .map(([d]) => d);
}

function buildMetrics(sites: CompetitorSite[]): CompetitorMetric[] {
  const done = sites.filter(s => s.status === 'done' && s.result);
  if (!done.length) return [];

  const metric = (
    label: string,
    unit: string,
    higherIsBetter: boolean,
    extractor: (r: AnalysisResult) => number | string | null,
  ): CompetitorMetric => {
    const values: Record<string, number | string | null> = {};
    // Include ALL sites (done and failed) so every domain gets a slot in the table.
    // Failed/pending sites get null — displayed as "—" in the UI.
    for (const site of sites) {
      values[site.domain] = (site.status === 'done' && site.result)
        ? extractor(site.result)
        : null;
    }
    const numericValues = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, typeof v === 'number' ? v : null])
    ) as Record<string, number | null>;
    return { label, unit, higherIsBetter, values, winner: pickWinner(numericValues, higherIsBetter) };
  };

  return [
    metric('CO₂ per page view', 'g', false, r => r.carbon?.models?.hybrid ?? null),
    metric('Transfer size', 'KB', false, r => r.carbon?.transferSizeBytes ? Math.round(r.carbon.transferSizeBytes / 1024) : null),
    metric('Performance score', '/100', true, r => r.scores?.performance?.score ?? null),
    metric('Security score', '/100', true, r => r.scores?.security?.score ?? null),
    metric('Accessibility score', '/100', true, r => r.scores?.accessibility?.score ?? null),
    metric('SEO score', '/100', true, r => r.scores?.seo?.score ?? null),
    metric('LCP', 'ms', false, r => (r.performance as { webVitals?: { lcp?: { value?: number } } })?.webVitals?.lcp?.value ?? null),
    metric('TTFB', 'ms', false, r => (r.performance as { webVitals?: { ttfb?: { value?: number } } })?.webVitals?.ttfb?.value ?? null),
    metric('Network requests', '#', false, r => (r.performance as { networkRequests?: unknown[] })?.networkRequests?.length ?? null),
    metric('Third-party requests', '#', false, r => r.thirdParties?.length ?? null),
    metric('Image bytes', 'KB', false, r => r.carbon?.resourceBreakdown?.images?.transferSize
      ? Math.round(r.carbon.resourceBreakdown.images.transferSize / 1024) : null),
    metric('JS bytes', 'KB', false, r => r.carbon?.resourceBreakdown?.javascript?.transferSize
      ? Math.round(r.carbon.resourceBreakdown.javascript.transferSize / 1024) : null),
    metric('Green hosting', '', true, r => r.carbon?.models?.greenHosting ? 1 : 0),
    metric('Carbon grade', '', false, r => r.scores?.carbon?.grade ?? null),
  ];
}

function buildSummary(sites: CompetitorSite[], metrics: CompetitorMetric[]): string {
  const done = sites.filter(s => s.status === 'done');
  if (done.length < 2) return 'Insufficient data for comparison.';

  const carbonMetric = metrics.find(m => m.label === 'CO₂ per page view');
  if (!carbonMetric) return `Compared ${done.length} sites.`;

  const winner = carbonMetric.winner;
  const values = carbonMetric.values as Record<string, number>;
  const worst = Object.entries(values).sort((a, b) => b[1] - a[1])[0]?.[0];
  const bestVal = winner ? values[winner] : null;
  const worstVal = worst ? values[worst] : null;

  if (!winner || bestVal === null || worstVal === null) return `Compared ${done.length} sites.`;

  const ratio = worstVal > 0 ? (worstVal / bestVal).toFixed(1) : '?';
  return `${winner} has the lowest carbon footprint at ${bestVal.toFixed(4)}g CO₂e per view, ${ratio}× cleaner than ${worst} (${worstVal.toFixed(4)}g).`;
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

export async function createCompetitorSession(urls: string[]): Promise<string> {
  const sessionId = uuid();
  const now = Date.now();

  // Create a job for each URL
  const jobIds: string[] = [];
  for (const url of urls) {
    const job = createJob(url, { waitAfterLoad: 2000 });
    jobIds.push(job.id);
  }

  stmts.insertCompetitorSession.run({
    id: sessionId,
    urls: JSON.stringify(urls),
    job_ids: JSON.stringify(jobIds),
    status: 'running',
    created_at: now,
  });

  logger.info({ sessionId, urls: urls.length }, 'Competitor session created');

  // Wait for all jobs in background and save result
  Promise.all(
    jobIds.map(id => waitForJob(id, 240_000).catch(() => null))
  ).then(async () => {
    // Extra safety: give any still-running jobs up to 30 more seconds via DB poll.
    // This handles the edge case where waitForJob's SSE fires just before DB commit.
    const deadline = Date.now() + 30_000;
    const pendingIds = jobIds.filter(id => {
      const j = getJob(id);
      return j && j.status !== 'done' && j.status !== 'error';
    });
    if (pendingIds.length > 0) {
      await new Promise<void>(resolve => {
        const iv = setInterval(() => {
          const allSettled = pendingIds.every(id => {
            const j = getJob(id);
            return !j || j.status === 'done' || j.status === 'error';
          });
          if (allSettled || Date.now() >= deadline) { clearInterval(iv); resolve(); }
        }, 1_000);
      });
    }

    const sites: CompetitorSite[] = urls.map((url, i) => {
      const job = getJob(jobIds[i]);
      const domain = getDomain(url);
      if (!job) return { url, domain, jobId: jobIds[i], status: 'error' as const, error: 'Job not found' };
      return {
        url,
        domain,
        jobId: job.id,
        status: job.status === 'done' ? 'done' as const : 'error' as const,
        error: job.error,
        result: job.result ?? undefined,
      };
    });

    const metrics = buildMetrics(sites);
    const done = sites.filter(s => s.status === 'done');

    const carbonValues = metrics.find(m => m.label === 'CO₂ per page view')?.values as Record<string, number> ?? {};
    const perfValues   = metrics.find(m => m.label === 'Performance score')?.values as Record<string, number> ?? {};
    const secValues    = metrics.find(m => m.label === 'Security score')?.values as Record<string, number> ?? {};

    const report: CompetitorReport = {
      sessionId,
      urls,
      sites: sites.map(s => ({ ...s, result: undefined })), // don't embed full results
      metrics,
      rankings: {
        carbon: rankDomains(
          Object.fromEntries(Object.entries(carbonValues).map(([k, v]) => [k, v ?? null])),
          false
        ),
        performance: rankDomains(
          Object.fromEntries(Object.entries(perfValues).map(([k, v]) => [k, v ?? null])),
          true
        ),
        security: rankDomains(
          Object.fromEntries(Object.entries(secValues).map(([k, v]) => [k, v ?? null])),
          true
        ),
        overall: rankDomains(
          Object.fromEntries(done.map(s => [
            s.domain,
            ((perfValues[s.domain] ?? 0) + (secValues[s.domain] ?? 0)) / 2,
          ])),
          true
        ),
      },
      summary: buildSummary(sites, metrics),
      createdAt: now,
      completedAt: Date.now(),
    };

    // Save full results separately keyed by domain
    const resultsByDomain: Record<string, AnalysisResult> = {};
    for (const site of sites) {
      if (site.result) resultsByDomain[site.domain] = site.result;
    }

    stmts.updateCompetitorSession.run({
      id: sessionId,
      status: 'done',
      result: JSON.stringify({ report, resultsByDomain }),
      completed_at: Date.now(),
    });

    logger.info({ sessionId }, 'Competitor session complete');
  }).catch(err => {
    logger.error({ sessionId, err }, 'Competitor session failed');
    stmts.updateCompetitorSession.run({
      id: sessionId,
      status: 'error',
      result: null,
      completed_at: Date.now(),
    });
  });

  return sessionId;
}

export function getCompetitorSession(sessionId: string): {
  sessionId: string;
  status: string;
  urls: string[];
  jobIds: string[];
  report?: CompetitorReport;
  resultsByDomain?: Record<string, AnalysisResult>;
  sites?: CompetitorSite[];
  createdAt: number;
  completedAt?: number;
} | null {
  interface SessionRow {
    id: string; urls: string; job_ids: string; status: string;
    result: string | null; created_at: number; completed_at: number | null;
  }
  const row = stmts.getCompetitorSession.get(sessionId) as SessionRow | undefined;
  if (!row) return null;

  const urls = JSON.parse(row.urls) as string[];
  const jobIds = JSON.parse(row.job_ids) as string[];

  // Build live status from jobs if still running
  const liveSites: CompetitorSite[] = urls.map((url, i) => {
    const job = getJob(jobIds[i]);
    const domain = getDomain(url);
    if (!job) return { url, domain, jobId: jobIds[i], status: 'pending' as const };
    return {
      url, domain, jobId: job.id,
      status: job.status === 'done' ? 'done' as const
            : job.status === 'error' ? 'error' as const
            : 'running' as const,
      error: job.error,
    };
  });

  const parsed = row.result ? JSON.parse(row.result) as { report: CompetitorReport; resultsByDomain: Record<string, AnalysisResult> } : null;

  return {
    sessionId: row.id,
    status: row.status,
    urls,
    jobIds,
    report: parsed?.report,
    resultsByDomain: parsed?.resultsByDomain,
    sites: row.status === 'done' && parsed ? parsed.report.sites : liveSites,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
  };
}
