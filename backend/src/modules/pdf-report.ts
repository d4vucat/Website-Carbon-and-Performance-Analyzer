/**
 * pdf-report.ts
 * Generates a beautifully styled PDF report from analysis results
 * using Playwright's page.pdf() API. Marketing-ready with score cards,
 * recommendations, and branding.
 */

import { createModuleLogger } from '../utils/logger.js';
import type { AnalysisResult } from '../types/index.js';

const logger = createModuleLogger('pdf-report');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function gradeColor(grade: string): string {
  if (grade.startsWith('A')) return '#10b981';
  if (grade === 'B') return '#3b82f6';
  if (grade === 'C') return '#f59e0b';
  if (grade === 'D') return '#f97316';
  return '#ef4444';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function scoreBar(score: number, color = '#10b981'): string {
  return `<div style="background:#1e293b;border-radius:4px;height:8px;width:100%;overflow:hidden;">
    <div style="background:${color};height:8px;width:${score}%;border-radius:4px;"></div>
  </div>`;
}

// ---------------------------------------------------------------------------
// HTML template
// ---------------------------------------------------------------------------

function buildHtml(result: AnalysisResult, jobId: string): string {
  const domain = (() => { try { return new URL(result.meta.finalUrl).hostname; } catch { return result.meta.url; } })();
  const date = new Date(result.meta.timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const { scores, carbon, performance } = result;

  const topRecs = (result.recommendations ?? []).filter(r => r.impact === 'high').slice(0, 6);

  const resourceRows = Object.entries(carbon.resourceBreakdown ?? {})
    .filter(([key]) => key !== 'total')
    .map(([key, val]) => {
      const v = val as { transferSize?: number; count?: number };
      return `<tr>
        <td style="padding:8px 12px;text-transform:capitalize;color:#94a3b8;">${key}</td>
        <td style="padding:8px 12px;text-align:right;color:#e2e8f0;">${v?.count ?? 0}</td>
        <td style="padding:8px 12px;text-align:right;color:#e2e8f0;">${formatBytes(v?.transferSize ?? 0)}</td>
      </tr>`;
    }).join('');

  const techList = (result.technologies?.detected ?? []).slice(0, 15)
    .map(t => `<span style="display:inline-block;padding:3px 8px;margin:3px;background:#1e293b;border:1px solid #334155;border-radius:12px;font-size:11px;color:#94a3b8;">${t.name}${t.version ? ` ${t.version}` : ''}</span>`)
    .join('');

  const recRows = topRecs.map(r => `
    <tr>
      <td style="padding:10px 12px;color:#94a3b8;">${r.category ?? 'general'}</td>
      <td style="padding:10px 12px;color:#e2e8f0;font-weight:500;">${r.title}</td>
      <td style="padding:10px 12px;color:#94a3b8;font-size:11px;">${r.description?.slice(0, 120) ?? ''}${(r.description?.length ?? 0) > 120 ? '…' : ''}</td>
    </tr>`).join('');

  const vitals = (performance as {webVitals?: Record<string, {value?: number; unit?: string; rating?: string; displayValue?: string}>})?.webVitals ?? {};
  const vitalRows = Object.entries(vitals).map(([key, v]) => {
    if (!v) return '';
    const color = v.rating === 'good' ? '#10b981' : v.rating === 'needs-improvement' ? '#f59e0b' : '#ef4444';
    return `<tr>
      <td style="padding:8px 12px;color:#94a3b8;text-transform:uppercase;font-size:11px;">${key}</td>
      <td style="padding:8px 12px;text-align:right;color:${color};font-weight:600;">${v.displayValue ?? `${Math.round(v.value ?? 0)} ${v.unit ?? ''}`}</td>
      <td style="padding:8px 12px;"><span style="padding:2px 8px;border-radius:9px;font-size:10px;background:${color}22;color:${color};">${v.rating ?? ''}</span></td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Carbon Analysis Report — ${domain}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; line-height: 1.5; font-size: 13px; }
  .page { max-width: 900px; margin: 0 auto; padding: 40px 48px; }
  h1 { font-size: 28px; font-weight: 700; color: #f8fafc; margin-bottom: 4px; }
  h2 { font-size: 16px; font-weight: 600; color: #f1f5f9; margin: 32px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #1e293b; }
  h3 { font-size: 13px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: .05em; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
  .logo { display: flex; align-items: center; gap: 10px; }
  .logo-icon { width: 36px; height: 36px; border-radius: 10px; background: #10b98122; border: 1px solid #10b98144; display: flex; align-items: center; justify-content: center; font-size: 20px; }
  .logo-text { font-size: 18px; font-weight: 700; color: #f8fafc; }
  .logo-sub { font-size: 11px; color: #64748b; }
  .meta { text-align: right; color: #64748b; font-size: 12px; line-height: 1.8; }
  .grade-cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin: 24px 0; }
  .grade-card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 16px; text-align: center; }
  .grade-value { font-size: 32px; font-weight: 800; line-height: 1; margin-bottom: 4px; }
  .grade-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
  .carbon-hero { background: linear-gradient(135deg, #0f2a1d, #0f172a); border: 1px solid #10b98130; border-radius: 16px; padding: 24px; margin: 24px 0; display: flex; gap: 32px; }
  .carbon-big { flex: 1; }
  .carbon-num { font-size: 48px; font-weight: 800; color: #10b981; line-height: 1; }
  .carbon-unit { font-size: 16px; color: #64748b; margin-top: 4px; }
  .carbon-sub { font-size: 12px; color: #64748b; margin-top: 8px; }
  .carbon-details { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; flex: 1; }
  .carbon-detail { background: #0f172a; border-radius: 8px; padding: 12px; }
  .carbon-detail-label { font-size: 10px; color: #64748b; text-transform: uppercase; }
  .carbon-detail-value { font-size: 18px; font-weight: 700; color: #e2e8f0; margin-top: 2px; }
  .green-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; }
  .green-yes { background: #10b98122; color: #10b981; border: 1px solid #10b98144; }
  .green-no  { background: #ef444422; color: #ef4444; border: 1px solid #ef444444; }
  table { width: 100%; border-collapse: collapse; }
  thead tr { background: #1e293b; }
  thead th { padding: 10px 12px; text-align: left; color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
  tbody tr:nth-child(even) { background: #0f172a44; }
  .section { margin-bottom: 32px; }
  .tech-grid { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
  .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #1e293b; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #475569; }
  .score-row { display: flex; align-items: center; gap: 12px; margin: 6px 0; }
  .score-name { width: 120px; color: #94a3b8; font-size: 12px; }
  .score-bar-wrap { flex: 1; }
  .score-val { width: 40px; text-align: right; font-weight: 600; font-size: 12px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="logo">
      <div class="logo-icon">🌿</div>
      <div>
        <div class="logo-text">Carbon<span style="color:#10b981;">Analyzer</span></div>
        <div class="logo-sub">Website Carbon &amp; Performance Report</div>
      </div>
    </div>
    <div class="meta">
      <div style="font-size:16px;font-weight:700;color:#f1f5f9;">${domain}</div>
      <div>${result.meta.finalUrl.slice(0, 60)}${result.meta.finalUrl.length > 60 ? '…' : ''}</div>
      <div>Analyzed: ${date}</div>
      <div>Report ID: ${jobId}</div>
    </div>
  </div>

  <!-- Grade Cards -->
  <div class="grade-cards">
    ${[
      { label: 'Carbon', grade: scores.carbon?.grade ?? 'F', color: gradeColor(scores.carbon?.grade ?? 'F') },
      { label: 'Performance', grade: scores.performance?.grade ?? 'F', color: gradeColor(scores.performance?.grade ?? 'F') },
      { label: 'Security', grade: scores.security?.grade ?? 'F', color: gradeColor(scores.security?.grade ?? 'F') },
      { label: 'Accessibility', grade: scores.accessibility?.grade ?? 'F', color: gradeColor(scores.accessibility?.grade ?? 'F') },
      { label: 'SEO', grade: scores.seo?.grade ?? 'F', color: gradeColor(scores.seo?.grade ?? 'F') },
    ].map(s => `<div class="grade-card">
      <div class="grade-value" style="color:${s.color};">${s.grade}</div>
      <div class="grade-label">${s.label}</div>
    </div>`).join('')}
  </div>

  <!-- Carbon Hero -->
  <div class="carbon-hero">
    <div class="carbon-big">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">CO₂ per page view</div>
      <div class="carbon-num">${(carbon.models?.hybrid ?? 0).toFixed(3)}<span style="font-size:20px;">g</span></div>
      <div class="carbon-unit">grams CO₂e</div>
      <div class="carbon-sub">≈ ${carbon.equivalents?.treeYearPercent?.toFixed(4) ?? '–'}% of a tree-year of carbon sequestration</div>
      <div style="margin-top:12px;">
        <span class="green-badge ${carbon.models?.greenHosting ? 'green-yes' : 'green-no'}">
          ${carbon.models?.greenHosting ? '🌱 Green Hosted' : '⚡ Not Green Hosted'}
        </span>
      </div>
    </div>
    <div class="carbon-details">
      <div class="carbon-detail">
        <div class="carbon-detail-label">Transfer Size</div>
        <div class="carbon-detail-value">${formatBytes(carbon.transferSizeBytes ?? 0)}</div>
      </div>
      <div class="carbon-detail">
        <div class="carbon-detail-label">Grid Intensity</div>
        <div class="carbon-detail-value">${(carbon.models?.gridIntensity ?? 0).toFixed(0)} gCO₂/kWh</div>
      </div>
      <div class="carbon-detail">
        <div class="carbon-detail-label">Annual CO₂ (10k visits)</div>
        <div class="carbon-detail-value">${((carbon.models?.hybrid ?? 0) * 10000 / 1000).toFixed(2)} kg</div>
      </div>
      <div class="carbon-detail">
        <div class="carbon-detail-label">Carbon Model</div>
        <div class="carbon-detail-value">Hybrid SWD v4</div>
      </div>
    </div>
  </div>

  <!-- Score Breakdown -->
  <h2>Score Breakdown</h2>
  <div class="section">
    ${[
      { name: 'Carbon', score: scores.carbon?.co2PerViewG !== undefined ? Math.max(0, 100 - Math.round((scores.carbon.co2PerViewG / 0.005) * 100)) : 50 },
      { name: 'Performance', score: scores.performance?.score ?? 0 },
      { name: 'Security', score: scores.security?.score ?? 0 },
      { name: 'Accessibility', score: scores.accessibility?.score ?? 0 },
      { name: 'SEO', score: scores.seo?.score ?? 0 },
    ].map(s => {
      const color = s.score >= 80 ? '#10b981' : s.score >= 60 ? '#3b82f6' : s.score >= 40 ? '#f59e0b' : '#ef4444';
      return `<div class="score-row">
        <div class="score-name">${s.name}</div>
        <div class="score-bar-wrap">${scoreBar(s.score, color)}</div>
        <div class="score-val" style="color:${color};">${s.score}</div>
      </div>`;
    }).join('')}
  </div>

  <!-- Resource Breakdown -->
  <h2>Resource Breakdown</h2>
  <table>
    <thead><tr>
      <th>Resource Type</th><th style="text-align:right;">Requests</th><th style="text-align:right;">Size</th>
    </tr></thead>
    <tbody>${resourceRows}</tbody>
  </table>

  <!-- Core Web Vitals -->
  ${vitals && Object.keys(vitals).length ? `
  <h2>Core Web Vitals</h2>
  <table>
    <thead><tr><th>Metric</th><th style="text-align:right;">Value</th><th>Rating</th></tr></thead>
    <tbody>${vitalRows}</tbody>
  </table>` : ''}

  <!-- Technologies -->
  ${techList ? `
  <h2>Detected Technologies</h2>
  <div class="tech-grid">${techList}</div>` : ''}

  <!-- Top Recommendations -->
  ${topRecs.length ? `
  <h2>High-Priority Recommendations</h2>
  <table>
    <thead><tr><th>Category</th><th>Issue</th><th>Description</th></tr></thead>
    <tbody>${recRows}</tbody>
  </table>` : ''}

  <!-- Footer -->
  <div class="footer">
    <div>Generated by CarbonAnalyzer · carbonanalyzer.dev</div>
    <div>Report ID: ${jobId} · ${date}</div>
  </div>

</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// PDF Generation
// ---------------------------------------------------------------------------

export async function generatePdfReport(result: AnalysisResult, jobId: string): Promise<Buffer> {
  const { chromium } = await import('playwright');

  const html = buildHtml(result, jobId);

  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: 'networkidle' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
      displayHeaderFooter: false,
    });

    logger.info({ jobId, bytes: pdfBuffer.length }, 'PDF report generated');
    return Buffer.from(pdfBuffer);
  } finally {
    await browser?.close();
  }
}
