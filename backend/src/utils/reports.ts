import type { AnalysisResult } from '../types/index.js';

export function generateCsvReport(result: AnalysisResult): string {
  const rows: string[][] = [];

  rows.push(['Website Carbon & Performance Analysis Report']);
  rows.push(['Generated', new Date().toISOString()]);
  rows.push(['URL', result.meta.url]);
  rows.push(['Final URL', result.meta.finalUrl]);
  rows.push(['Analysis Duration (ms)', String(result.meta.durationMs)]);
  rows.push([]);

  // === SCORES ===
  rows.push(['=== SCORES ===']);
  rows.push(['Category', 'Score', 'Grade']);
  rows.push(['Carbon', String(result.scores.carbon.co2PerViewG) + 'g CO2/view', result.scores.carbon.grade]);
  rows.push(['Performance', String(result.scores.performance.score), result.scores.performance.grade]);
  rows.push(['Security', String(result.scores.security.score), result.scores.security.grade]);
  rows.push(['Accessibility', String(result.scores.accessibility.score), result.scores.accessibility.grade]);
  rows.push(['SEO', String(result.scores.seo.score), result.scores.seo.grade]);
  rows.push(['Composite', String(result.scores.composite.score), result.scores.composite.grade]);
  rows.push([]);

  // === CARBON ===
  rows.push(['=== CARBON ANALYSIS ===']);
  rows.push(['Metric', 'Value']);
  rows.push(['SWD Model CO2 (g/view)', String(result.carbon.models.swd)]);
  rows.push(['1byte Model CO2 (g/view)', String(result.carbon.models.onebyte)]);
  rows.push(['Hybrid Model CO2 (g/view)', String(result.carbon.models.hybrid)]);
  rows.push(['Grade', result.carbon.models.grade]);
  rows.push(['Green Hosting', result.carbon.models.greenHosting ? 'Yes' : 'No']);
  if (result.carbon.models.greenHostingProvider) {
    rows.push(['Green Hosting Provider', result.carbon.models.greenHostingProvider]);
  }
  rows.push(['Grid Intensity (gCO2/kWh)', String(result.carbon.models.gridIntensity)]);
  rows.push(['Server Country', result.carbon.models.serverLocation.country]);
  rows.push(['Transfer Size (bytes)', String(result.carbon.transferSizeBytes)]);
  rows.push(['Transfer Size (KB)', String(Math.round(result.carbon.transferSizeBytes / 1024))]);
  rows.push(['Decoded Size (KB)', String(Math.round(result.carbon.decodedSizeBytes / 1024))]);
  if (result.carbon.models.annualCo2Kg) {
    rows.push(['Annual CO2 Estimate (kg)', String(result.carbon.models.annualCo2Kg.toFixed(2))]);
  }
  rows.push([]);

  // === RESOURCE BREAKDOWN ===
  rows.push(['=== RESOURCE BREAKDOWN ===']);
  rows.push(['Type', 'Count', 'Transfer Size (KB)', 'Decoded Size (KB)', 'CO2 (g)']);
  const rb = result.carbon.resourceBreakdown;
  for (const type of ['html', 'javascript', 'css', 'images', 'fonts', 'video', 'xhr', 'other', 'total'] as const) {
    const stats = rb[type];
    rows.push([
      type,
      String(stats.count),
      String(Math.round(stats.transferSize / 1024)),
      String(Math.round(stats.decodedSize / 1024)),
      String(stats.co2Grams?.toFixed(4) ?? '0'),
    ]);
  }
  rows.push([]);

  // === CARBON EQUIVALENTS ===
  rows.push(['=== CARBON EQUIVALENTS (per page view) ===']);
  const eq = result.carbon.equivalents;
  rows.push(['Metric', 'Equivalent']);
  rows.push(['Kettle Boils', String(eq.kettleBoils.toFixed(4))]);
  rows.push(['Smartphone Charges', String(eq.smartphoneCharges.toFixed(4))]);
  rows.push(['LED Bulb Hours', String(eq.ledBulbHours.toFixed(4))]);
  rows.push(['Car Km', String(eq.carKm.toFixed(4))]);
  rows.push(['Flight Km', String(eq.flightKm.toFixed(4))]);
  rows.push([]);

  // === PERFORMANCE ===
  rows.push(['=== PERFORMANCE ===']);
  rows.push(['Metric', 'Value', 'Rating']);
  const wv = result.performance.webVitals;
  rows.push(['LCP', String(Math.round(wv.lcp.value)) + 'ms', wv.lcp.rating]);
  rows.push(['FCP', String(Math.round(wv.fcp.value)) + 'ms', wv.fcp.rating]);
  rows.push(['TTFB', String(Math.round(wv.ttfb.value)) + 'ms', wv.ttfb.rating]);
  rows.push(['TBT', String(Math.round(wv.tbt.value)) + 'ms', wv.tbt.rating]);
  rows.push(['CLS', String(wv.cls.value.toFixed(3)), wv.cls.rating]);
  rows.push(['INP', String(Math.round(wv.inp.value)) + 'ms', wv.inp.rating]);
  rows.push([]);

  // === TECHNOLOGIES ===
  rows.push(['=== DETECTED TECHNOLOGIES ===']);
  rows.push(['Name', 'Category', 'Version', 'Confidence', 'Detected Via', 'GDPR Category']);
  for (const tech of result.technologies.detected) {
    rows.push([
      tech.name,
      tech.category,
      tech.version ?? '',
      String(tech.confidence) + '%',
      tech.detectedVia.join(', '),
      tech.gdprCategory ?? '',
    ]);
  }
  rows.push([]);

  // === THIRD PARTIES ===
  rows.push(['=== THIRD-PARTY SERVICES ===']);
  rows.push(['Name', 'Category', 'Requests', 'Transfer (KB)', 'CO2 (g)', 'GDPR Category', 'Privacy Alternative']);
  for (const tp of result.thirdParties) {
    rows.push([
      tp.name,
      tp.category,
      String(tp.requestCount),
      String(Math.round(tp.transferSize / 1024)),
      String(tp.co2Grams.toFixed(4)),
      tp.gdprCategory,
      tp.privacySafeAlternative ?? '',
    ]);
  }
  rows.push([]);

  // === SECURITY HEADERS ===
  rows.push(['=== SECURITY HEADERS ===']);
  rows.push(['Header', 'Present', 'Score', 'Grade']);
  const sh = result.security.headers;
  rows.push(['HSTS', sh.hsts.present ? 'Yes' : 'No', String(sh.hsts.score), sh.hsts.grade]);
  rows.push(['CSP', sh.csp.present ? 'Yes' : 'No', String(sh.csp.score), sh.csp.grade]);
  rows.push(['X-Frame-Options', sh.xFrameOptions.present ? 'Yes' : 'No', String(sh.xFrameOptions.score), sh.xFrameOptions.grade]);
  rows.push(['X-Content-Type-Options', sh.xContentTypeOptions.present ? 'Yes' : 'No', String(sh.xContentTypeOptions.score), sh.xContentTypeOptions.grade]);
  rows.push(['Referrer-Policy', sh.referrerPolicy.present ? 'Yes' : 'No', String(sh.referrerPolicy.score), sh.referrerPolicy.grade]);
  rows.push(['Permissions-Policy', sh.permissionsPolicy.present ? 'Yes' : 'No', String(sh.permissionsPolicy.score), sh.permissionsPolicy.grade]);
  rows.push(['COEP', sh.coep.present ? 'Yes' : 'No', String(sh.coep.score), sh.coep.grade]);
  rows.push(['COOP', sh.coop.present ? 'Yes' : 'No', String(sh.coop.score), sh.coop.grade]);
  rows.push([]);

  // === RECOMMENDATIONS ===
  rows.push(['=== RECOMMENDATIONS ===']);
  rows.push(['Category', 'Impact', 'Title', 'Description']);
  for (const rec of result.recommendations) {
    rows.push([
      rec.category,
      rec.impact,
      rec.title,
      rec.description.replace(/,/g, ';'),
    ]);
  }

  // Convert to CSV string
  return rows.map(row =>
    row.map(cell => {
      if (typeof cell !== 'string') return cell;
      if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    }).join(',')
  ).join('\n');
}
