/**
 * carbon-tracker.ts
 * Records carbon metrics over time and provides trend analysis,
 * carbon budgets, and CI/CD integration via budget enforcement.
 */

import { db, stmts } from '../utils/database.js';
import { createModuleLogger } from '../utils/logger.js';
import { v4 as uuid } from 'uuid';

const logger = createModuleLogger('carbon-tracker');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CarbonSnapshot {
  id: number;
  domain: string;
  url: string;
  co2PerView: number;
  transferBytes: number;
  carbonGrade: string;
  greenHosting: boolean;
  performanceScore?: number;
  imageBytes?: number;
  jsBytes?: number;
  cssBytes?: number;
  recordedAt: number;
}

export interface CarbonTrend {
  domain: string;
  snapshots: CarbonSnapshot[];
  trend: 'improving' | 'degrading' | 'stable' | 'insufficient-data';
  changePercent: number;
  baseline?: CarbonSnapshot;
  latest?: CarbonSnapshot;
  weeklyAverage?: number;
  monthlyAverage?: number;
}

export interface CarbonBudget {
  domain: string;
  maxCo2PerView: number;       // grams CO2e per page view
  maxTransferBytes?: number;   // bytes
  status?: 'within-budget' | 'over-budget' | 'unknown';
  current?: number;
  overBy?: number;
}

export interface CarbonBudgetCheckResult {
  passed: boolean;
  domain: string;
  current: number;
  budget: number;
  overBy?: number;
  grade: string;
  exitCode: number; // 0 = pass, 1 = fail (for CI/CD)
  message: string;
  details: {
    transferBytes: number;
    greenHosting: boolean;
    performanceScore?: number;
  };
}

// ---------------------------------------------------------------------------
// Record tracking
// ---------------------------------------------------------------------------

export function recordCarbonSnapshot(params: {
  domain: string;
  url: string;
  co2PerView: number;
  transferBytes: number;
  carbonGrade: string;
  greenHosting: boolean;
  performanceScore?: number;
  imageBytes?: number;
  jsBytes?: number;
  cssBytes?: number;
}): void {
  try {
    stmts.insertCarbonHistory.run({
      domain: params.domain,
      url: params.url,
      co2_per_view: params.co2PerView,
      transfer_bytes: params.transferBytes,
      carbon_grade: params.carbonGrade,
      green_hosting: params.greenHosting ? 1 : 0,
      performance_score: params.performanceScore ?? null,
      image_bytes: params.imageBytes ?? null,
      js_bytes: params.jsBytes ?? null,
      css_bytes: params.cssBytes ?? null,
      recorded_at: Date.now(),
    });
    logger.debug({ domain: params.domain, co2: params.co2PerView }, 'Carbon snapshot recorded');
  } catch (err) {
    logger.error({ err, domain: params.domain }, 'Failed to record carbon snapshot');
  }
}

// ---------------------------------------------------------------------------
// Trend analysis
// ---------------------------------------------------------------------------

export function getCarbonTrend(domain: string): CarbonTrend {
  interface DbRow {
    id: number; domain: string; url: string; co2_per_view: number;
    transfer_bytes: number; carbon_grade: string; green_hosting: number;
    performance_score: number | null; image_bytes: number | null;
    js_bytes: number | null; css_bytes: number | null; recorded_at: number;
  }

  const rows = stmts.getCarbonHistory.all(domain) as DbRow[];

  const snapshots: CarbonSnapshot[] = rows.map(r => ({
    id: r.id,
    domain: r.domain,
    url: r.url,
    co2PerView: r.co2_per_view,
    transferBytes: r.transfer_bytes,
    carbonGrade: r.carbon_grade,
    greenHosting: r.green_hosting === 1,
    performanceScore: r.performance_score ?? undefined,
    imageBytes: r.image_bytes ?? undefined,
    jsBytes: r.js_bytes ?? undefined,
    cssBytes: r.css_bytes ?? undefined,
    recordedAt: r.recorded_at,
  }));

  if (snapshots.length < 2) {
    return { domain, snapshots, trend: 'insufficient-data', changePercent: 0 };
  }

  const baseline = snapshots[0];
  const latest = snapshots[snapshots.length - 1];
  const changePercent = baseline.co2PerView > 0
    ? Number((((latest.co2PerView - baseline.co2PerView) / baseline.co2PerView) * 100).toFixed(1))
    : 0;

  let trend: CarbonTrend['trend'] = 'stable';
  if (Math.abs(changePercent) < 5) trend = 'stable';
  else if (changePercent < 0) trend = 'improving';
  else trend = 'degrading';

  // Weekly average (last 7 days)
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekSnaps = snapshots.filter(s => s.recordedAt >= weekAgo);
  const weeklyAverage = weekSnaps.length
    ? weekSnaps.reduce((s, n) => s + n.co2PerView, 0) / weekSnaps.length
    : undefined;

  // Monthly average (last 30 days)
  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const monthSnaps = snapshots.filter(s => s.recordedAt >= monthAgo);
  const monthlyAverage = monthSnaps.length
    ? monthSnaps.reduce((s, n) => s + n.co2PerView, 0) / monthSnaps.length
    : undefined;

  return { domain, snapshots, trend, changePercent, baseline, latest, weeklyAverage, monthlyAverage };
}

// ---------------------------------------------------------------------------
// Carbon budgets
// ---------------------------------------------------------------------------

export function setCarbonBudget(domain: string, maxCo2PerView: number, maxTransferBytes?: number): void {
  const id = `budget_${domain}`;
  const now = Date.now();
  stmts.upsertCarbonBudget.run({
    id,
    domain,
    max_co2_per_view: maxCo2PerView,
    max_transfer_bytes: maxTransferBytes ?? null,
    created_at: now,
    updated_at: now,
  });
}

export function getCarbonBudget(domain: string): CarbonBudget | null {
  interface BudgetRow {
    domain: string; max_co2_per_view: number; max_transfer_bytes: number | null;
  }
  const row = stmts.getCarbonBudget.get(domain) as BudgetRow | undefined;
  if (!row) return null;
  return {
    domain: row.domain,
    maxCo2PerView: row.max_co2_per_view,
    maxTransferBytes: row.max_transfer_bytes ?? undefined,
  };
}

/**
 * Checks if the current analysis result passes the carbon budget.
 * Returns an exit code compatible with CI/CD pipelines (0 = pass, 1 = fail).
 */
export function checkCarbonBudget(
  domain: string,
  analysisResult: {
    co2PerView: number;
    transferBytes: number;
    carbonGrade: string;
    greenHosting: boolean;
    performanceScore?: number;
  },
): CarbonBudgetCheckResult {
  const budget = getCarbonBudget(domain);

  if (!budget) {
    return {
      passed: true,
      domain,
      current: analysisResult.co2PerView,
      budget: Infinity,
      grade: analysisResult.carbonGrade,
      exitCode: 0,
      message: 'No carbon budget configured — pass by default.',
      details: {
        transferBytes: analysisResult.transferBytes,
        greenHosting: analysisResult.greenHosting,
        performanceScore: analysisResult.performanceScore,
      },
    };
  }

  const passed = analysisResult.co2PerView <= budget.maxCo2PerView;
  const overBy = passed ? undefined : Number((analysisResult.co2PerView - budget.maxCo2PerView).toFixed(4));

  return {
    passed,
    domain,
    current: analysisResult.co2PerView,
    budget: budget.maxCo2PerView,
    overBy,
    grade: analysisResult.carbonGrade,
    exitCode: passed ? 0 : 1,
    message: passed
      ? `✓ Carbon budget passed: ${analysisResult.co2PerView.toFixed(4)}g CO₂e ≤ ${budget.maxCo2PerView}g budget`
      : `✗ Carbon budget exceeded: ${analysisResult.co2PerView.toFixed(4)}g CO₂e > ${budget.maxCo2PerView}g budget (over by ${overBy?.toFixed(4)}g)`,
    details: {
      transferBytes: analysisResult.transferBytes,
      greenHosting: analysisResult.greenHosting,
      performanceScore: analysisResult.performanceScore,
    },
  };
}

// ---------------------------------------------------------------------------
// Comparison / diff
// ---------------------------------------------------------------------------

export interface CarbonDiff {
  domain: string;
  before: CarbonSnapshot;
  after: CarbonSnapshot;
  co2Change: number;
  co2ChangePct: number;
  transferChange: number;
  transferChangePct: number;
  gradeChange: string;
  improved: boolean;
}

export function compareCarbonSnapshots(before: CarbonSnapshot, after: CarbonSnapshot): CarbonDiff {
  const co2Change = Number((after.co2PerView - before.co2PerView).toFixed(5));
  const co2ChangePct = before.co2PerView > 0
    ? Number(((co2Change / before.co2PerView) * 100).toFixed(1))
    : 0;
  const transferChange = after.transferBytes - before.transferBytes;
  const transferChangePct = before.transferBytes > 0
    ? Number(((transferChange / before.transferBytes) * 100).toFixed(1))
    : 0;

  return {
    domain: before.domain,
    before,
    after,
    co2Change,
    co2ChangePct,
    transferChange,
    transferChangePct,
    gradeChange: `${before.carbonGrade} → ${after.carbonGrade}`,
    improved: co2Change < 0,
  };
}
