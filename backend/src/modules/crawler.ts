/**
 * crawler.ts
 * Crawls multiple pages of a site, aggregates carbon and performance data,
 * and produces a site-wide analysis report.
 */

import { createModuleLogger } from '../utils/logger.js';
import { createJob, getJob, waitForJob } from '../jobs/job-manager.js';
import type { AnalysisResult } from '../types/index.js';

const logger = createModuleLogger('crawler');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CrawlOptions {
  maxPages?: number;           // default 10
  maxDepth?: number;           // default 2
  respectRobotsTxt?: boolean;  // default true
  concurrency?: number;        // default 2
  sameDomainOnly?: boolean;    // default true
  includeSubdomains?: boolean; // default false
  waitAfterLoad?: number;      // default 2000ms
}

export interface CrawledPage {
  url: string;
  depth: number;
  status: 'done' | 'error' | 'skipped';
  jobId?: string;
  error?: string;
  co2PerView?: number;
  transferBytes?: number;
  carbonGrade?: string;
  performanceScore?: number;
  linksFound?: number;
}

export interface CrawlReport {
  rootUrl: string;
  domain: string;
  pagesAnalyzed: number;
  pagesErrored: number;
  pages: CrawledPage[];
  summary: {
    avgCo2PerView: number;
    totalTransferBytes: number;
    avgPerformanceScore: number;
    worstPage: CrawledPage | null;
    bestPage: CrawledPage | null;
    carbonGradeDistribution: Record<string, number>;
    estimatedMonthlyCo2G: number;
  };
  startedAt: number;
  completedAt: number;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// URL filtering / normalization
// ---------------------------------------------------------------------------

function normalizeUrl(url: string, base: string): string | null {
  try {
    const u = new URL(url, base);
    // Strip fragments and tracking params
    u.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'fbclid', 'gclid'].forEach(p => u.searchParams.delete(p));
    return u.href;
  } catch { return null; }
}

function isSameDomain(url: string, rootHostname: string, includeSubdomains: boolean): boolean {
  try {
    const u = new URL(url);
    if (includeSubdomains) return u.hostname.endsWith(rootHostname);
    return u.hostname === rootHostname;
  } catch { return false; }
}

function isLikelyCrawlable(url: string): boolean {
  const lower = url.toLowerCase();
  // Skip common non-HTML resources
  if (/\.(pdf|zip|gz|tar|exe|dmg|pkg|apk|ipa|mp4|mp3|avi|mov|wav|flac|ogg|jpg|jpeg|png|gif|webp|avif|svg|ico|css|js|woff|woff2|ttf|otf|eot|xml|json|csv|xlsx|docx|pptx)(\?.*)?$/.test(lower)) return false;
  // Skip auth / admin / API endpoints
  if (/\/(admin|wp-admin|login|logout|signin|signout|register|api\/|graphql|__)/.test(lower)) return false;
  return true;
}

async function extractLinks(htmlContent: string, baseUrl: string): Promise<string[]> {
  const { load } = await import('cheerio');
  const $ = load(htmlContent);
  const links: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && !href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('javascript:')) {
      const normalized = normalizeUrl(href, baseUrl);
      if (normalized) links.push(normalized);
    }
  });
  return [...new Set(links)];
}

// ---------------------------------------------------------------------------
// Main crawl function
// ---------------------------------------------------------------------------

export async function crawlSite(rootUrl: string, options: CrawlOptions = {}): Promise<CrawlReport> {
  const {
    maxPages = 10,
    maxDepth = 2,
    concurrency = 2,
    sameDomainOnly = true,
    includeSubdomains = false,
    waitAfterLoad = 2000,
  } = options;

  const startedAt = Date.now();
  const rootHostname = new URL(rootUrl).hostname;
  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: rootUrl, depth: 0 }];
  const crawledPages: CrawledPage[] = [];

  logger.info({ rootUrl, maxPages, maxDepth }, 'Starting site crawl');

  const { default: pLimit } = await import('p-limit');
  const limit = pLimit(concurrency);

  while (queue.length > 0 && crawledPages.length < maxPages) {
    const batch = queue.splice(0, concurrency).filter(item => !visited.has(item.url));

    if (!batch.length) continue;

    await Promise.all(batch.map(item => limit(async () => {
      if (visited.has(item.url) || crawledPages.length >= maxPages) return;
      visited.add(item.url);

      if (sameDomainOnly && !isSameDomain(item.url, rootHostname, includeSubdomains)) {
        crawledPages.push({ url: item.url, depth: item.depth, status: 'skipped' });
        return;
      }

      if (!isLikelyCrawlable(item.url)) {
        crawledPages.push({ url: item.url, depth: item.depth, status: 'skipped' });
        return;
      }

      logger.debug({ url: item.url, depth: item.depth }, 'Crawling page');

      try {
        const job = createJob(item.url, { waitAfterLoad, includeScreenshot: false });
        const completedJob = await waitForJob(job.id, 90_000);

        if (!completedJob || completedJob.status !== 'done' || !completedJob.result) {
          crawledPages.push({ url: item.url, depth: item.depth, status: 'error', jobId: job.id, error: completedJob?.error ?? 'Analysis failed' });
          return;
        }

        const r = completedJob.result as AnalysisResult;
        const page: CrawledPage = {
          url: item.url,
          depth: item.depth,
          status: 'done',
          jobId: job.id,
          co2PerView: r.carbon?.models?.hybrid,
          transferBytes: r.carbon?.transferSizeBytes,
          carbonGrade: r.scores?.carbon?.grade,
          performanceScore: r.scores?.performance?.score,
        };

        // Extract links from this page for deeper crawling
        if (item.depth < maxDepth) {
          const htmlContent = (r as unknown as { htmlContent?: string }).htmlContent ?? '';
          const links = await extractLinks(htmlContent, item.url);
          page.linksFound = links.length;

          for (const link of links) {
            if (!visited.has(link) && crawledPages.length + queue.length < maxPages * 2) {
              queue.push({ url: link, depth: item.depth + 1 });
            }
          }
        }

        crawledPages.push(page);
      } catch (err) {
        crawledPages.push({ url: item.url, depth: item.depth, status: 'error', error: String(err) });
      }
    })));
  }

  // Build summary
  const done = crawledPages.filter(p => p.status === 'done');
  const avgCo2 = done.length ? done.reduce((s, p) => s + (p.co2PerView ?? 0), 0) / done.length : 0;
  const totalBytes = done.reduce((s, p) => s + (p.transferBytes ?? 0), 0);
  const avgPerf = done.length ? done.reduce((s, p) => s + (p.performanceScore ?? 0), 0) / done.length : 0;
  const sorted = [...done].sort((a, b) => (a.co2PerView ?? 0) - (b.co2PerView ?? 0));

  const gradeDistribution: Record<string, number> = {};
  for (const p of done) {
    const g = p.carbonGrade ?? 'F';
    gradeDistribution[g] = (gradeDistribution[g] ?? 0) + 1;
  }

  const completedAt = Date.now();

  return {
    rootUrl,
    domain: rootHostname,
    pagesAnalyzed: done.length,
    pagesErrored: crawledPages.filter(p => p.status === 'error').length,
    pages: crawledPages,
    summary: {
      avgCo2PerView: Number(avgCo2.toFixed(5)),
      totalTransferBytes: totalBytes,
      avgPerformanceScore: Math.round(avgPerf),
      worstPage: sorted[sorted.length - 1] ?? null,
      bestPage: sorted[0] ?? null,
      carbonGradeDistribution: gradeDistribution,
      // Estimate: 10k monthly visits per page
      estimatedMonthlyCo2G: Number((avgCo2 * 10_000 * done.length).toFixed(2)),
    },
    startedAt,
    completedAt,
    durationMs: completedAt - startedAt,
  };
}
