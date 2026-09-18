import type { SecurityHeaderAnalysis, HeaderResult } from '../types/index.js';

export function analyzeSecurityHeaders(headers: Record<string, string>): SecurityHeaderAnalysis {
  const hsts = analyzeHsts(headers['strict-transport-security']);
  const csp = analyzeCsp(headers['content-security-policy'] ?? headers['content-security-policy-report-only']);
  const xFrameOptions = analyzeXFrameOptions(headers['x-frame-options']);
  const xContentTypeOptions = analyzeXContentTypeOptions(headers['x-content-type-options']);
  const referrerPolicy = analyzeReferrerPolicy(headers['referrer-policy']);
  const permissionsPolicy = analyzePermissionsPolicy(headers['permissions-policy'] ?? headers['feature-policy']);
  const coep = analyzeSimpleHeader(headers['cross-origin-embedder-policy'], 'COEP', ['require-corp', 'credentialless']);
  const coop = analyzeSimpleHeader(headers['cross-origin-opener-policy'], 'COOP', ['same-origin', 'same-origin-allow-popups']);
  const corp = analyzeSimpleHeader(headers['cross-origin-resource-policy'], 'CORP', ['same-origin', 'same-site', 'cross-origin']);
  const xxssProtection = analyzeXxssProtection(headers['x-xss-protection']);

  const totalScore =
    hsts.score + csp.score + xFrameOptions.score + xContentTypeOptions.score +
    referrerPolicy.score + permissionsPolicy.score + coep.score + coop.score +
    corp.score;

  const maxScore = 105; // Sum of all max scores
  const normalizedScore = Math.round((totalScore / maxScore) * 100);

  return {
    hsts,
    csp,
    xFrameOptions,
    xContentTypeOptions,
    referrerPolicy,
    permissionsPolicy,
    coep,
    coop,
    corp,
    xxssProtection,
    score: normalizedScore,
    grade: getSecurityGrade(normalizedScore),
  };
}

function analyzeHsts(value: string | undefined): HeaderResult {
  if (!value) {
    return {
      present: false,
      score: 0,
      grade: 'F',
      issues: ['HSTS header is missing. All traffic should be served over HTTPS.'],
      recommendations: ['Add: Strict-Transport-Security: max-age=31536000; includeSubDomains; preload'],
    };
  }

  let score = 5; // Base for presence
  const issues: string[] = [];
  const recommendations: string[] = [];

  const maxAgeMatch = value.match(/max-age=(\d+)/i);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1]) : 0;

  if (maxAge >= 31536000) {
    score += 10; // 1 year or more
  } else if (maxAge >= 86400) {
    score += 5; // At least 1 day
    issues.push(`max-age is ${maxAge}s (${Math.floor(maxAge / 86400)} days). Recommended: ≥31536000 (1 year).`);
  } else {
    issues.push(`max-age is very short: ${maxAge}s. Should be at least 31536000 (1 year).`);
  }

  if (value.toLowerCase().includes('includesubdomains')) {
    score += 5;
  } else {
    issues.push('includeSubDomains is missing. Subdomains are not protected.');
    recommendations.push('Add includeSubDomains to protect all subdomains.');
  }

  if (value.toLowerCase().includes('preload')) {
    score += 5;
  } else {
    recommendations.push('Add preload directive and submit to HSTS preload list at hstspreload.org.');
  }

  return { present: true, value, score, grade: scoreToGrade(score, 25), issues, recommendations };
}

function analyzeCsp(value: string | undefined): HeaderResult & { directives?: Record<string, string[]> } {
  if (!value) {
    return {
      present: false,
      score: 0,
      grade: 'F',
      issues: ['Content-Security-Policy header is missing. Site is vulnerable to XSS attacks.'],
      recommendations: ['Implement a CSP. Start with: Content-Security-Policy: default-src \'self\''],
    };
  }

  let score = 5;
  const issues: string[] = [];
  const recommendations: string[] = [];
  const directives: Record<string, string[]> = {};

  // Parse directives
  const parts = value.split(';').map(p => p.trim()).filter(Boolean);
  for (const part of parts) {
    const [directive, ...sources] = part.split(/\s+/);
    if (directive) {
      directives[directive.toLowerCase()] = sources;
    }
  }

  const scriptSrc = directives['script-src'] ?? directives['default-src'] ?? [];
  const scriptSrcStr = scriptSrc.join(' ');

  // Check for dangerous directives
  if (scriptSrcStr.includes("'unsafe-inline'")) {
    score -= 10;
    issues.push("unsafe-inline in script-src allows inline scripts (XSS risk).");
  } else {
    score += 5;
  }

  if (scriptSrcStr.includes("'unsafe-eval'")) {
    score -= 10;
    issues.push("unsafe-eval in script-src allows eval() (XSS risk).");
  } else {
    score += 5;
  }

  if (scriptSrc.includes('*')) {
    score -= 5;
    issues.push("Wildcard (*) in script-src allows scripts from any domain.");
  }

  if (scriptSrcStr.includes("'nonce-") || scriptSrcStr.includes("'sha256-") || scriptSrcStr.includes("'sha384-")) {
    score += 10;
  }

  if (directives['default-src']?.includes("'none'")) {
    score += 5;
  }

  if (directives['upgrade-insecure-requests'] !== undefined) {
    score += 3;
  }

  if (directives['report-uri'] || directives['report-to']) {
    score += 2;
  }

  score = Math.max(0, Math.min(30, score));

  return {
    present: true,
    value: value.slice(0, 500),
    score,
    grade: scoreToGrade(score, 30),
    issues,
    recommendations,
    directives,
  };
}

function analyzeXFrameOptions(value: string | undefined): HeaderResult {
  if (!value) {
    return {
      present: false,
      score: 0,
      grade: 'F',
      issues: ['X-Frame-Options is missing. Site may be vulnerable to clickjacking.'],
      recommendations: ['Add: X-Frame-Options: DENY (or SAMEORIGIN if needed)'],
    };
  }

  const normalized = value.toUpperCase().trim();
  let score = 5;
  const issues: string[] = [];
  const recommendations: string[] = [];

  if (normalized === 'DENY') {
    score = 10;
  } else if (normalized === 'SAMEORIGIN') {
    score = 8;
  } else if (normalized.startsWith('ALLOW-FROM')) {
    score = 5;
    issues.push('ALLOW-FROM is deprecated and not supported in modern browsers. Use CSP frame-ancestors instead.');
  }

  return { present: true, value, score, grade: scoreToGrade(score, 10), issues, recommendations };
}

function analyzeXContentTypeOptions(value: string | undefined): HeaderResult {
  if (!value) {
    return {
      present: false,
      score: 0,
      grade: 'F',
      issues: ['X-Content-Type-Options is missing. Browser may MIME-sniff responses.'],
      recommendations: ['Add: X-Content-Type-Options: nosniff'],
    };
  }

  const isCorrect = value.toLowerCase().trim() === 'nosniff';
  return {
    present: true,
    value,
    score: isCorrect ? 5 : 2,
    grade: isCorrect ? 'A' : 'C',
    issues: isCorrect ? [] : [`Unexpected value: "${value}". Should be "nosniff".`],
    recommendations: [],
  };
}

function analyzeReferrerPolicy(value: string | undefined): HeaderResult {
  if (!value) {
    return {
      present: false,
      score: 0,
      grade: 'F',
      issues: ['Referrer-Policy is missing. Browser default may leak full URLs to third parties.'],
      recommendations: ['Add: Referrer-Policy: strict-origin-when-cross-origin'],
    };
  }

  const policyScores: Record<string, number> = {
    'no-referrer': 10,
    'no-referrer-when-downgrade': 5,
    'strict-origin': 8,
    'strict-origin-when-cross-origin': 9,
    'same-origin': 7,
    'origin': 4,
    'origin-when-cross-origin': 5,
    'unsafe-url': 0,
  };

  const score = policyScores[value.toLowerCase().trim()] ?? 3;
  const issues = value.toLowerCase() === 'unsafe-url'
    ? ['unsafe-url sends full URL to all destinations including cross-origin. This is a major privacy risk.']
    : [];

  return { present: true, value, score, grade: scoreToGrade(score, 10), issues, recommendations: [] };
}

function analyzePermissionsPolicy(value: string | undefined): HeaderResult {
  if (!value) {
    return {
      present: false,
      score: 0,
      grade: 'F',
      issues: ['Permissions-Policy (Feature-Policy) is missing. Browser features are not restricted.'],
      recommendations: ['Add: Permissions-Policy: camera=(), microphone=(), geolocation=()'],
    };
  }

  // Check for sensitive feature restrictions
  const sensitiveFeatures = ['camera', 'microphone', 'geolocation', 'payment', 'display-capture'];
  const restrictedCount = sensitiveFeatures.filter(f => value.includes(f)).length;
  const score = Math.min(10, 3 + restrictedCount * 2);

  return {
    present: true,
    value: value.slice(0, 300),
    score,
    grade: scoreToGrade(score, 10),
    issues: restrictedCount < 3 ? ['Consider restricting more sensitive browser features.'] : [],
    recommendations: [],
  };
}

function analyzeSimpleHeader(value: string | undefined, headerName: string, goodValues: string[]): HeaderResult {
  if (!value) {
    return {
      present: false,
      score: 0,
      grade: 'F',
      issues: [`${headerName} header is missing.`],
      recommendations: [`Add: ${headerName}: ${goodValues[0]}`],
    };
  }

  const isGood = goodValues.some(v => value.toLowerCase().includes(v.toLowerCase()));
  return {
    present: true,
    value,
    score: isGood ? 5 : 2,
    grade: isGood ? 'A' : 'C',
    issues: isGood ? [] : [`Value "${value}" may not provide optimal protection.`],
    recommendations: [],
  };
}

function analyzeXxssProtection(value: string | undefined): HeaderResult {
  // X-XSS-Protection is deprecated. Best practice is "0" (disable it) and use CSP instead
  if (!value) {
    return {
      present: false,
      score: 3,
      grade: 'B',
      issues: [],
      recommendations: ['X-XSS-Protection: 0 (modern approach — rely on CSP instead)'],
    };
  }

  const isZero = value.trim() === '0';
  const isLegacyBlock = value.includes('mode=block');

  return {
    present: true,
    value,
    score: isZero ? 3 : 1,
    grade: isZero ? 'A' : 'B',
    issues: isLegacyBlock ? ['mode=block can cause page breakage in some browsers. Use CSP instead.'] : [],
    recommendations: isZero ? [] : ['Set X-XSS-Protection: 0 and rely on Content-Security-Policy.'],
  };
}

function scoreToGrade(score: number, max: number): string {
  const pct = (score / max) * 100;
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B';
  if (pct >= 60) return 'C';
  if (pct >= 40) return 'D';
  if (pct >= 20) return 'E';
  return 'F';
}

function getSecurityGrade(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  if (score >= 20) return 'E';
  return 'F';
}
