/**
 * green-hosting-api.ts
 * Verifies green hosting status via the Green Web Foundation API.
 * Distinguishes between renewable energy certificates, on-site renewables, and coal regions.
 * https://developers.thegreenwebfoundation.org/
 */

import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('green-hosting-api');

const GWF_BASE = 'https://api.thegreenwebfoundation.org';
const CACHE = new Map<string, { result: GreenHostingResult; expires: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 h

export type HostingGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface GreenHostingResult {
  domain: string;
  isGreen: boolean;
  hostedBy: string | null;
  hostedByWebsite: string | null;
  supportingDocuments: SupportingDocument[];
  countryCode: string | null;
  /** Granular evidence type */
  evidenceType: EvidenceType;
  /** Human-readable grade A+ … F */
  grade: HostingGrade;
  /** Short reason string */
  reason: string;
  source: 'gwf-api' | 'fallback';
}

type EvidenceType =
  | 'on-site-renewables'       // Best: actually runs on solar/wind on premises
  | 'power-purchase-agreement' // Good: long-term PPA for renewables
  | 'renewable-energy-cert'    // OK: RECs/GOs purchased
  | 'carbon-offset'            // Meh: CO2 offsets, not actual renewables
  | 'not-green'                // Unverified / fossil fuels
  | 'unknown';

interface SupportingDocument {
  title: string;
  link: string;
  valid_from: string;
  valid_to: string;
}

interface GwfApiResponse {
  url: string;
  hosted_by: string;
  hosted_by_website: string;
  partner: string | null;
  green: boolean;
  hosted_by_id: number;
  modified: string;
  supporting_documents: SupportingDocument[];
  country_metadata: {
    region: string;
    name: string;
    countrycode: string;
    'google-id'?: string;
  } | null;
}

function classifyEvidence(docs: SupportingDocument[], green: boolean): EvidenceType {
  if (!green) return 'not-green';
  if (!docs || docs.length === 0) return 'renewable-energy-cert'; // GWF marks green but no docs = inferred

  const allTitles = docs.map(d => d.title.toLowerCase()).join(' ');

  if (allTitles.includes('on-site') || allTitles.includes('solar') || allTitles.includes('wind farm')) {
    return 'on-site-renewables';
  }
  if (allTitles.includes('ppa') || allTitles.includes('power purchase')) {
    return 'power-purchase-agreement';
  }
  if (allTitles.includes('offset') || allTitles.includes('carbon neutral')) {
    return 'carbon-offset';
  }
  if (allTitles.includes('rec') || allTitles.includes('renewable energy certificate') || allTitles.includes('go ') || allTitles.includes('guarantee of origin')) {
    return 'renewable-energy-cert';
  }
  return 'renewable-energy-cert';
}

function gradeFromEvidence(evidence: EvidenceType, green: boolean): HostingGrade {
  if (!green) return 'F';
  switch (evidence) {
    case 'on-site-renewables':       return 'A+';
    case 'power-purchase-agreement': return 'A';
    case 'renewable-energy-cert':    return 'B';
    case 'carbon-offset':            return 'C';
    default:                         return 'D';
  }
}

function reasonFromEvidence(evidence: EvidenceType, hostedBy: string | null): string {
  const provider = hostedBy ?? 'This host';
  switch (evidence) {
    case 'on-site-renewables':
      return `${provider} generates electricity on-site from renewable sources (solar/wind).`;
    case 'power-purchase-agreement':
      return `${provider} is backed by a long-term Power Purchase Agreement for renewable energy.`;
    case 'renewable-energy-cert':
      return `${provider} purchases Renewable Energy Certificates (RECs/GOs) — energy may not be directly renewable.`;
    case 'carbon-offset':
      return `${provider} uses carbon offsets. The servers may still run on fossil fuels.`;
    case 'not-green':
      return `${provider} has no verified renewable energy commitment in the Green Web Foundation database.`;
    default:
      return 'Green status could not be determined.';
  }
}

export async function checkGreenHosting(domain: string): Promise<GreenHostingResult> {
  // Normalize
  const hostname = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();

  // Cache hit
  const cached = CACHE.get(hostname);
  if (cached && cached.expires > Date.now()) return cached.result;

  try {
    const { default: got } = await import('got');

    const res = await got(`${GWF_BASE}/api/v3/greencheck/${hostname}`, {
      headers: { 'User-Agent': 'carbon-analyzer/1.0' },
      timeout: { request: 3_000 },
      throwHttpErrors: false,
    });

    if (res.statusCode !== 200) {
      return fallback(hostname);
    }

    const data = JSON.parse(res.body) as GwfApiResponse;
    const evidenceType = classifyEvidence(data.supporting_documents ?? [], data.green);
    const grade = gradeFromEvidence(evidenceType, data.green);

    const result: GreenHostingResult = {
      domain: hostname,
      isGreen: data.green,
      hostedBy: data.hosted_by ?? null,
      hostedByWebsite: data.hosted_by_website ?? null,
      supportingDocuments: data.supporting_documents ?? [],
      countryCode: data.country_metadata?.countrycode ?? null,
      evidenceType,
      grade,
      reason: reasonFromEvidence(evidenceType, data.hosted_by),
      source: 'gwf-api',
    };

    CACHE.set(hostname, { result, expires: Date.now() + CACHE_TTL });
    return result;
  } catch (err) {
    logger.warn({ hostname, err }, 'GWF API call failed, using fallback');
    return fallback(hostname);
  }
}

function fallback(domain: string): GreenHostingResult {
  return {
    domain,
    isGreen: false,
    hostedBy: null,
    hostedByWebsite: null,
    supportingDocuments: [],
    countryCode: null,
    evidenceType: 'unknown',
    grade: 'F',
    reason: 'Green hosting status could not be verified (API unavailable).',
    source: 'fallback',
  };
}

/** Check multiple domains in parallel with concurrency limit. */
export async function checkGreenHostingBulk(domains: string[], concurrency = 3): Promise<Map<string, GreenHostingResult>> {
  const { default: pLimit } = await import('p-limit');
  const limit = pLimit(concurrency);
  const results = await Promise.all(
    domains.map(d => limit(() => checkGreenHosting(d).then(r => [d, r] as [string, GreenHostingResult])))
  );
  return new Map(results);
}
