/**
 * api.ts — All API routes for the Carbon Analyzer.
 * New endpoints:
 *  POST /api/v1/analyze/:id/share      — Create shareable permalink
 *  GET  /api/v1/results/:reportId      — Fetch shared report
 *  GET  /api/v1/analyze/:id/report.pdf — PDF export via Playwright
 *  POST /api/v1/compare                — Competitor comparison
 *  GET  /api/v1/compare/:sessionId     — Competitor session status
 *  GET  /api/v1/carbon/history/:domain — Carbon trend
 *  POST /api/v1/carbon/budget          — Set carbon budget (CI/CD)
 *  GET  /api/v1/carbon/budget/:domain  — Get carbon budget
 *  POST /api/v1/carbon/budget/:domain/check — CI/CD budget check
 *  POST /api/v1/crawl                  — Multi-page crawl
 *  GET  /api/v1/crawl/:crawlId         — Crawl result
 *  GET  /api/v1/hosting/green/:domain  — Green Web Foundation check
 *  GET  /api/v1/tech/builtwith/:domain — BuiltWith tech stack
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createJob, getJob, getQueueStats, subscribe } from '../jobs/job-manager.js';
import { stmts, db } from '../utils/database.js';
import { createModuleLogger } from '../utils/logger.js';
import { generateCsvReport } from '../utils/reports.js';
import { generatePdfReport } from '../modules/pdf-report.js';
import { createCompetitorSession, getCompetitorSession } from '../modules/competitor.js';
import { getCarbonTrend, setCarbonBudget, getCarbonBudget, checkCarbonBudget } from '../modules/carbon-tracker.js';
import { checkGreenHosting } from '../modules/green-hosting-api.js';
import { fetchBuiltWith } from '../modules/builtwith.js';
import { crawlSite } from '../modules/crawler.js';
import { v4 as uuid } from 'uuid';

const logger = createModuleLogger('routes');

const AnalyzeBodySchema = z.object({
  url: z.string().url(),
  options: z.object({
    userAgent: z.string().optional(),
    viewport: z.object({ width: z.number(), height: z.number() }).optional(),
    device: z.enum(['desktop-fast', 'desktop-average', 'mobile-high-end', 'mobile-mid-range', 'mobile-low-end', 'tablet']).optional(),
    waitUntil: z.enum(['networkidle', 'domcontentloaded', 'load']).optional(),
    waitAfterLoad: z.number().min(0).max(15000).optional(),
    includeScreenshot: z.boolean().optional(),
    includeLighthouse: z.boolean().optional(),
    includeAccessibility: z.boolean().optional(),
    monthlyVisits: z.number().positive().optional(),
    newVisitorRatio: z.number().min(0).max(1).optional(),
    carbonModel: z.enum(['swd', 'onebyte', 'hybrid']).optional(),
  }).optional(),
});

export async function registerRoutes(app: FastifyInstance): Promise<void> {

  // ── Core analysis ─────────────────────────────────────────────────────────

  app.post('/api/v1/analyze', async (request, reply) => {
    const body = AnalyzeBodySchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Invalid request', details: body.error.issues });
    const { url, options } = body.data;
    try {
      const hostname = new URL(url).hostname;
      const rateCheck = stmts.checkRateLimit.get(hostname, Date.now() - 60000) as { total: number } | undefined;
      if ((rateCheck?.total ?? 0) >= 5) return reply.status(429).send({ error: 'Rate limit exceeded', message: 'Max 5 analyses per domain per minute' });
      stmts.incrementRateLimit.run({ domain: hostname, window_start: Math.floor(Date.now() / 60000) * 60000 });
    } catch { return reply.status(400).send({ error: 'Invalid URL' }); }
    const job = createJob(url, options ?? {});
    return reply.status(202).send({ jobId: job.id, url: job.url, status: job.status, estimatedTime: 45 });
  });

  app.get('/api/v1/analyze/:jobId/status', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = getJob(jobId);
    if (!job) return reply.status(404).send({ error: 'Job not found' });
    return { jobId: job.id, url: job.url, status: job.status, phase: job.phase, progress: job.progress, createdAt: job.createdAt, startedAt: job.startedAt, completedAt: job.completedAt, error: job.error };
  });

  app.get('/api/v1/analyze/:jobId/result', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = getJob(jobId);
    if (!job) return reply.status(404).send({ error: 'Job not found' });
    if (job.status !== 'done') return reply.status(202).send({ jobId: job.id, status: job.status, progress: job.progress, message: 'Analysis still in progress' });
    return job.result;
  });

  app.get('/api/v1/analyze/:jobId/stream', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = getJob(jobId);
    if (!job) return reply.status(404).send({ error: 'Job not found' });
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*', 'X-Accel-Buffering': 'no' });
    const send = (event: string, data: unknown) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (job.status === 'done') { send('done', { jobId, result: job.result }); reply.raw.end(); return; }
    if (job.status === 'error') { send('error', { jobId, error: job.error }); reply.raw.end(); return; }
    const unsub = subscribe(jobId, (event, data) => { send(event, data); if (event === 'done' || event === 'error') { reply.raw.end(); unsub(); } });
    const heartbeat = setInterval(() => reply.raw.write(': keepalive\n\n'), 15000);
    request.socket.on('close', () => { clearInterval(heartbeat); unsub(); });
    return reply;
  });

  // ── Exports ───────────────────────────────────────────────────────────────

  app.get('/api/v1/analyze/:jobId/report.json', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = getJob(jobId);
    if (!job?.result) return reply.status(404).send({ error: 'Result not found' });
    reply.header('Content-Disposition', `attachment; filename="carbon-report-${jobId}.json"`);
    reply.header('Content-Type', 'application/json');
    return job.result;
  });

  app.get('/api/v1/analyze/:jobId/report.csv', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = getJob(jobId);
    if (!job?.result) return reply.status(404).send({ error: 'Result not found' });
    reply.header('Content-Disposition', `attachment; filename="carbon-report-${jobId}.csv"`);
    reply.header('Content-Type', 'text/csv');
    return generateCsvReport(job.result);
  });

  app.get('/api/v1/analyze/:jobId/report.pdf', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = getJob(jobId);
    if (!job?.result) return reply.status(404).send({ error: 'Result not found' });
    try {
      const pdf = await generatePdfReport(job.result, jobId);
      reply.header('Content-Disposition', `attachment; filename="carbon-report-${jobId}.pdf"`);
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Length', pdf.length);
      return reply.send(pdf);
    } catch (err) {
      logger.error({ err, jobId }, 'PDF generation failed');
      return reply.status(500).send({ error: 'PDF generation failed' });
    }
  });

  // ── Shareable Permalink ───────────────────────────────────────────────────

  app.post('/api/v1/analyze/:jobId/share', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = getJob(jobId);
    if (!job?.result) return reply.status(404).send({ error: 'Result not found' });
    const existing = db.prepare('SELECT id FROM shared_reports WHERE job_id = ?').get(jobId) as { id: string } | undefined;
    if (existing) return { reportId: existing.id, url: `/results/${existing.id}` };
    const reportId = uuid().replace(/-/g, '').slice(0, 12);
    const expiresAt = Date.now() + 90 * 24 * 60 * 60 * 1000;
    stmts.insertSharedReport.run({ id: reportId, job_id: jobId, url: job.url, result: JSON.stringify(job.result), created_at: Date.now(), expires_at: expiresAt });
    return { reportId, url: `/results/${reportId}`, expiresAt: new Date(expiresAt).toISOString() };
  });

  app.get('/api/v1/results/:reportId', async (request, reply) => {
    const { reportId } = request.params as { reportId: string };
    const row = stmts.getSharedReport.get(reportId) as { result: string; url: string; view_count: number; created_at: number } | undefined;
    if (!row) return reply.status(404).send({ error: 'Report not found or expired' });
    stmts.incrementSharedReportViews.run(Date.now(), reportId);
    return { reportId, url: row.url, viewCount: row.view_count + 1, createdAt: row.created_at, result: JSON.parse(row.result) };
  });

  // ── Competitor Comparison ─────────────────────────────────────────────────

  app.post('/api/v1/compare', async (request, reply) => {
    const body = z.object({ urls: z.array(z.string().url()).min(2).max(4) }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Provide 2–4 valid URLs to compare' });
    const sessionId = await createCompetitorSession(body.data.urls);
    return reply.status(202).send({ sessionId, status: 'running', estimatedTime: 120 });
  });

  app.get('/api/v1/compare/:sessionId', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = getCompetitorSession(sessionId);
    if (!session) return reply.status(404).send({ error: 'Session not found' });
    return session;
  });

  // ── Carbon Monitoring & Budgets ───────────────────────────────────────────

  app.get('/api/v1/carbon/history/:domain', async (request, reply) => {
    const { domain } = request.params as { domain: string };
    return getCarbonTrend(domain);
  });

  app.post('/api/v1/carbon/budget', async (request, reply) => {
    const body = z.object({ domain: z.string(), maxCo2PerView: z.number().positive(), maxTransferBytes: z.number().positive().optional() }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Invalid budget' });
    const { domain, maxCo2PerView, maxTransferBytes } = body.data;
    setCarbonBudget(domain, maxCo2PerView, maxTransferBytes);
    return { domain, maxCo2PerView, maxTransferBytes, message: 'Carbon budget saved' };
  });

  app.get('/api/v1/carbon/budget/:domain', async (request, reply) => {
    const { domain } = request.params as { domain: string };
    const budget = getCarbonBudget(domain);
    if (!budget) return reply.status(404).send({ error: 'No budget configured' });
    return budget;
  });

  app.post('/api/v1/carbon/budget/:domain/check', async (request, reply) => {
    const { domain } = request.params as { domain: string };
    const body = z.object({ co2PerView: z.number(), transferBytes: z.number(), carbonGrade: z.string(), greenHosting: z.boolean().default(false), performanceScore: z.number().optional() }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Invalid check payload' });
    const result = checkCarbonBudget(domain, body.data);
    return reply.status(result.passed ? 200 : 422).send(result);
  });

  // ── Multi-page Crawl ──────────────────────────────────────────────────────

  app.post('/api/v1/crawl', async (request, reply) => {
    const body = z.object({
      url: z.string().url(),
      options: z.object({ maxPages: z.number().min(1).max(50).optional(), maxDepth: z.number().min(1).max(5).optional(), concurrency: z.number().min(1).max(5).optional(), sameDomainOnly: z.boolean().optional(), includeSubdomains: z.boolean().optional(), waitAfterLoad: z.number().optional() }).optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Invalid crawl request' });
    const crawlId = uuid().replace(/-/g, '').slice(0, 10);
    const cacheKey = `crawl:${crawlId}`;
    reply.status(202).send({ crawlId, status: 'running', message: 'Crawl started' });
    crawlSite(body.data.url, body.data.options ?? {})
      .then(report => db.prepare('INSERT OR REPLACE INTO analysis_cache (url_hash, url, result, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').run(cacheKey, body.data.url, JSON.stringify(report), Date.now(), Date.now() + 3600_000))
      .catch(err => logger.error({ crawlId, err }, 'Crawl failed'));
  });

  app.get('/api/v1/crawl/:crawlId', async (request, reply) => {
    const { crawlId } = request.params as { crawlId: string };
    const row = db.prepare('SELECT result FROM analysis_cache WHERE url_hash = ?').get(`crawl:${crawlId}`) as { result: string } | undefined;
    if (!row) return reply.status(404).send({ error: 'Crawl not found or still running' });
    return { status: 'done', report: JSON.parse(row.result) };
  });

  // ── Green Hosting & BuiltWith ─────────────────────────────────────────────

  app.get('/api/v1/hosting/green/:domain', async (request, reply) => {
    const { domain } = request.params as { domain: string };
    return checkGreenHosting(domain);
  });

  app.get('/api/v1/tech/builtwith/:domain', async (request, reply) => {
    const { domain } = request.params as { domain: string };
    return fetchBuiltWith(domain);
  });

  // ── Health & Leaderboard ──────────────────────────────────────────────────

  app.get('/api/v1/health', async () => {
    const { getPoolStats } = await import('../modules/browser-pool.js');
    return { status: 'ok', timestamp: new Date().toISOString(), queue: getQueueStats(), pool: getPoolStats(), version: '2.1.0' };
  });

  app.post('/api/v1/batch', async (request, reply) => {
    const body = z.object({ urls: z.array(z.string().url()).min(1).max(20), options: z.record(z.unknown()).optional() }).safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Invalid request' });
    const jobIds = body.data.urls.map(url => createJob(url, (body.data.options ?? {}) as import('../types/index.js').AnalyzeOptions).id);
    return reply.status(202).send({ batchId: `batch_${Date.now()}`, jobIds });
  });

  app.get('/api/v1/leaderboard', async (request) => {
    const { limit } = request.query as { limit?: string };
    return { entries: stmts.getLeaderboard.all(parseInt(limit ?? '20', 10)) };
  });

  logger.info('Routes registered: v2 (share, PDF, compare, crawl, budget, green-hosting, BuiltWith)');
}
