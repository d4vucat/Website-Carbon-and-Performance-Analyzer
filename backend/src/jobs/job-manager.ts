/**
 * job-manager.ts
 * Persistent job queue backed by SQLite.
 * - Jobs survive server restarts (queued/running → re-queued on startup)
 * - Uses browser pool for efficient Playwright reuse
 * - Concurrency controlled via p-queue with backpressure
 * - SSE subscribers notified of progress in real-time
 */

import { v4 as uuidv4 } from 'uuid';
import PQueue from 'p-queue';
import { createModuleLogger } from '../utils/logger.js';
import { stmts, db } from '../utils/database.js';
import { runAnalysis } from '../modules/orchestrator.js';
import type { Job, AnalyzeOptions, AnalysisResult } from '../types/index.js';

const logger = createModuleLogger('job-manager');

const CONCURRENCY = parseInt(process.env.QUEUE_CONCURRENCY ?? '3', 10);
const queue = new PQueue({ concurrency: CONCURRENCY });

// ── SSE subscriber registry ───────────────────────────────────────────────

const sseSubscribers = new Map<string, Array<(event: string, data: unknown) => void>>();

export function subscribe(jobId: string, callback: (event: string, data: unknown) => void): () => void {
  const subs = sseSubscribers.get(jobId) ?? [];
  subs.push(callback);
  sseSubscribers.set(jobId, subs);
  return () => {
    const current = sseSubscribers.get(jobId) ?? [];
    sseSubscribers.set(jobId, current.filter(s => s !== callback));
  };
}

function emit(jobId: string, event: string, data: unknown): void {
  for (const sub of sseSubscribers.get(jobId) ?? []) {
    try { sub(event, data); } catch { /* ignore */ }
  }
}

// ── Job creation ──────────────────────────────────────────────────────────

export function createJob(url: string, options: AnalyzeOptions = {}): Job {
  const id = uuidv4();
  const now = Date.now();

  const job: Job = { id, url, status: 'queued', phase: 0, progress: 0, createdAt: now, options };

  stmts.insertJob.run({ id, url, status: 'queued', phase: 0, progress: 0, created_at: now, options: JSON.stringify(options) });

  enqueue(job);
  return job;
}

function enqueue(job: Job): void {
  queue.add(async () => processJob(job)).catch(err => {
    logger.error({ jobId: job.id, err }, 'Queue task threw unexpectedly');
  });
}

// ── Persistence: re-queue jobs that were interrupted on last shutdown ─────

export function restoreInterruptedJobs(): void {
  const interrupted = db.prepare(`
    SELECT * FROM jobs
    WHERE status IN ('queued', 'running')
    AND created_at > ?
    ORDER BY created_at ASC
  `).all(Date.now() - 60 * 60 * 1000) as Array<{  // only within last hour
    id: string; url: string; status: string; phase: number; progress: number;
    created_at: number; started_at?: number; completed_at?: number;
    error?: string; result?: string; options: string;
  }>;

  if (interrupted.length === 0) return;

  logger.info({ count: interrupted.length }, 'Restoring interrupted jobs from DB');

  for (const row of interrupted) {
    // Reset to queued
    db.prepare(`UPDATE jobs SET status='queued', phase=0, progress=0, started_at=NULL WHERE id=?`).run(row.id);

    const job: Job = {
      id: row.id,
      url: row.url,
      status: 'queued',
      phase: 0,
      progress: 0,
      createdAt: row.created_at,
      options: JSON.parse(row.options) as AnalyzeOptions,
    };

    enqueue(job);
  }
}

// ── Job processor ─────────────────────────────────────────────────────────

async function processJob(job: Job): Promise<void> {
  const startedAt = Date.now();
  logger.info({ jobId: job.id, url: job.url }, 'Processing job');

  // Mark running
  stmts.updateJob.run({
    id: job.id, status: 'running', phase: 1, progress: 5,
    started_at: startedAt, completed_at: null, error: null, result: null,
  });
  emit(job.id, 'start', { jobId: job.id, url: job.url });

  try {
    const result: AnalysisResult = await runAnalysis(job, (phase, progress) => {
      stmts.updateJob.run({
        id: job.id, status: 'running', phase, progress,
        started_at: startedAt, completed_at: null, error: null, result: null,
      });
      emit(job.id, 'progress', { jobId: job.id, phase, progress });
    });

    const completedAt = Date.now();
    const resultJson = JSON.stringify(result);

    stmts.updateJob.run({
      id: job.id, status: 'done', phase: 7, progress: 100,
      started_at: startedAt, completed_at: completedAt, error: null, result: resultJson,
    });

    emit(job.id, 'done', { jobId: job.id, result });
    logger.info({ jobId: job.id, durationMs: completedAt - startedAt }, 'Job complete');
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ jobId: job.id, err }, 'Job failed');

    stmts.updateJob.run({
      id: job.id, status: 'error', phase: 0, progress: 0,
      started_at: startedAt, completed_at: Date.now(), error: errMsg, result: null,
    });

    emit(job.id, 'error', { jobId: job.id, error: errMsg });
  }
}

// ── Job retrieval ─────────────────────────────────────────────────────────

export function getJob(jobId: string): Job | null {
  const row = stmts.getJob.get(jobId) as {
    id: string; url: string; status: string; phase: number; progress: number;
    created_at: number; started_at?: number; completed_at?: number;
    error?: string; result?: string; options: string;
  } | undefined;

  if (!row) return null;

  return {
    id: row.id, url: row.url,
    status: row.status as Job['status'],
    phase: row.phase as Job['phase'],
    progress: row.progress,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    error: row.error,
    result: row.result ? JSON.parse(row.result) as AnalysisResult : undefined,
    options: JSON.parse(row.options) as AnalyzeOptions,
  };
}

export function getQueueStats(): {
  size: number;
  pending: number;
  concurrency: number;
  isPaused: boolean;
} {
  return {
    size: queue.size,
    pending: queue.pending,
    concurrency: queue.concurrency,
    isPaused: queue.isPaused,
  };
}

export function pauseQueue(): void  { queue.pause(); }
export function resumeQueue(): void { queue.start(); }

/** Waits for a job to complete (or error) within timeoutMs.
 *
 *  Uses SSE events as the primary signal, with a polling fallback every 5 s so
 *  we never get stuck if an event is missed (e.g. subscriber registered after
 *  the event fired).  Default timeout raised to 180 s to accommodate slow sites
 *  like claude.ai / chatgpt.com that need full Playwright render time.
 */
export async function waitForJob(jobId: string, timeoutMs = 240_000): Promise<Job | null> {
  return new Promise((resolve) => {
    const job = getJob(jobId);
    if (!job) { resolve(null); return; }
    if (job.status === 'done' || job.status === 'error') { resolve(job); return; }

    let settled = false;
    const settle = (j: Job | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(poll);
      unsub();
      resolve(j);
    };

    // Hard deadline
    const timer = setTimeout(() => settle(getJob(jobId)), timeoutMs);

    // Poll DB every 5 s as safety net in case SSE event was missed
    const poll = setInterval(() => {
      const j = getJob(jobId);
      if (j && (j.status === 'done' || j.status === 'error')) settle(j);
    }, 5_000);

    // Primary signal: SSE event
    const unsub = subscribe(jobId, (event) => {
      if (event === 'done' || event === 'error') settle(getJob(jobId));
    });
  });
}
