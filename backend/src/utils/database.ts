import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/analyzer.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    phase INTEGER NOT NULL DEFAULT 0,
    progress REAL NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER,
    error TEXT,
    result TEXT,
    options TEXT NOT NULL DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
  CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);

  CREATE TABLE IF NOT EXISTS analysis_cache (
    url_hash TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    result TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_cache_expires ON analysis_cache(expires_at);

  CREATE TABLE IF NOT EXISTS rate_limits (
    domain TEXT NOT NULL,
    window_start INTEGER NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (domain, window_start)
  );

  CREATE TABLE IF NOT EXISTS tech_fingerprint_cache (
    url_hash TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS leaderboard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    domain TEXT NOT NULL,
    carbon_grade TEXT,
    co2_per_view REAL,
    performance_score REAL,
    security_score REAL,
    composite_score REAL,
    opt_in INTEGER NOT NULL DEFAULT 0,
    analyzed_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_leaderboard_carbon ON leaderboard(co2_per_view);
  CREATE INDEX IF NOT EXISTS idx_leaderboard_perf ON leaderboard(performance_score);

  CREATE TABLE IF NOT EXISTS batch_jobs (
    id TEXT PRIMARY KEY,
    job_ids TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  );

  -- Shareable report permalinks
  CREATE TABLE IF NOT EXISTS shared_reports (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    url TEXT NOT NULL,
    result TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    view_count INTEGER NOT NULL DEFAULT 0,
    last_viewed INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_shared_job ON shared_reports(job_id);
  CREATE INDEX IF NOT EXISTS idx_shared_url ON shared_reports(url);

  -- Carbon monitoring over time
  CREATE TABLE IF NOT EXISTS carbon_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL,
    url TEXT NOT NULL,
    co2_per_view REAL NOT NULL,
    transfer_bytes INTEGER NOT NULL,
    carbon_grade TEXT NOT NULL,
    green_hosting INTEGER NOT NULL DEFAULT 0,
    performance_score REAL,
    image_bytes INTEGER,
    js_bytes INTEGER,
    css_bytes INTEGER,
    recorded_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_history_domain ON carbon_history(domain, recorded_at);

  -- Competitor comparison sessions
  CREATE TABLE IF NOT EXISTS competitor_sessions (
    id TEXT PRIMARY KEY,
    urls TEXT NOT NULL,
    job_ids TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    result TEXT,
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  );

  -- Image analysis cache (expensive to recompute)
  CREATE TABLE IF NOT EXISTS image_analysis_cache (
    url_hash TEXT PRIMARY KEY,
    image_url TEXT NOT NULL,
    result TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_img_cache_expires ON image_analysis_cache(expires_at);

  -- Carbon budget configurations
  CREATE TABLE IF NOT EXISTS carbon_budgets (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    max_co2_per_view REAL NOT NULL,
    max_transfer_bytes INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

export const stmts = {
  insertJob: db.prepare(`
    INSERT INTO jobs (id, url, status, phase, progress, created_at, options)
    VALUES (@id, @url, @status, @phase, @progress, @created_at, @options)
  `),

  updateJob: db.prepare(`
    UPDATE jobs SET status=@status, phase=@phase, progress=@progress,
    started_at=@started_at, completed_at=@completed_at, error=@error, result=@result
    WHERE id=@id
  `),

  getJob: db.prepare('SELECT * FROM jobs WHERE id = ?'),

  getCache: db.prepare(`
    SELECT result FROM analysis_cache
    WHERE url_hash = ? AND expires_at > ?
  `),

  setCache: db.prepare(`
    INSERT OR REPLACE INTO analysis_cache (url_hash, url, result, created_at, expires_at)
    VALUES (@url_hash, @url, @result, @created_at, @expires_at)
  `),

  checkRateLimit: db.prepare(`
    SELECT SUM(request_count) as total FROM rate_limits
    WHERE domain = ? AND window_start > ?
  `),

  incrementRateLimit: db.prepare(`
    INSERT INTO rate_limits (domain, window_start, request_count)
    VALUES (@domain, @window_start, 1)
    ON CONFLICT(domain, window_start) DO UPDATE SET request_count = request_count + 1
  `),

  insertLeaderboard: db.prepare(`
    INSERT INTO leaderboard (url, domain, carbon_grade, co2_per_view, performance_score, security_score, composite_score, opt_in, analyzed_at)
    VALUES (@url, @domain, @carbon_grade, @co2_per_view, @performance_score, @security_score, @composite_score, @opt_in, @analyzed_at)
  `),

  getLeaderboard: db.prepare(`
    SELECT * FROM leaderboard WHERE opt_in = 1 ORDER BY co2_per_view ASC LIMIT ?
  `),

  // Shared reports
  insertSharedReport: db.prepare(`
    INSERT INTO shared_reports (id, job_id, url, result, created_at, expires_at)
    VALUES (@id, @job_id, @url, @result, @created_at, @expires_at)
  `),

  getSharedReport: db.prepare(`
    SELECT * FROM shared_reports WHERE id = ?
  `),

  incrementSharedReportViews: db.prepare(`
    UPDATE shared_reports SET view_count = view_count + 1, last_viewed = ? WHERE id = ?
  `),

  // Carbon history
  insertCarbonHistory: db.prepare(`
    INSERT INTO carbon_history (domain, url, co2_per_view, transfer_bytes, carbon_grade, green_hosting, performance_score, image_bytes, js_bytes, css_bytes, recorded_at)
    VALUES (@domain, @url, @co2_per_view, @transfer_bytes, @carbon_grade, @green_hosting, @performance_score, @image_bytes, @js_bytes, @css_bytes, @recorded_at)
  `),

  getCarbonHistory: db.prepare(`
    SELECT * FROM carbon_history WHERE domain = ? ORDER BY recorded_at ASC LIMIT 365
  `),

  // Competitor sessions
  insertCompetitorSession: db.prepare(`
    INSERT INTO competitor_sessions (id, urls, job_ids, status, created_at)
    VALUES (@id, @urls, @job_ids, @status, @created_at)
  `),

  updateCompetitorSession: db.prepare(`
    UPDATE competitor_sessions SET status=@status, result=@result, completed_at=@completed_at WHERE id=@id
  `),

  getCompetitorSession: db.prepare(`SELECT * FROM competitor_sessions WHERE id = ?`),

  // Carbon budgets
  upsertCarbonBudget: db.prepare(`
    INSERT INTO carbon_budgets (id, domain, max_co2_per_view, max_transfer_bytes, created_at, updated_at)
    VALUES (@id, @domain, @max_co2_per_view, @max_transfer_bytes, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET max_co2_per_view=@max_co2_per_view, max_transfer_bytes=@max_transfer_bytes, updated_at=@updated_at
  `),

  getCarbonBudget: db.prepare(`SELECT * FROM carbon_budgets WHERE domain = ?`),
};

export function cleanupExpiredCache(): void {
  db.prepare('DELETE FROM analysis_cache WHERE expires_at <= ?').run(Date.now());
  db.prepare('DELETE FROM rate_limits WHERE window_start < ?').run(Date.now() - 3600000);
  db.prepare('DELETE FROM image_analysis_cache WHERE expires_at <= ?').run(Date.now());
  // Expire shared reports older than 90 days
  db.prepare('DELETE FROM shared_reports WHERE expires_at IS NOT NULL AND expires_at <= ?').run(Date.now());
}

setInterval(cleanupExpiredCache, 30 * 60 * 1000);
