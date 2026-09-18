import type {
  CarbonScores,
  CarbonEquivalents,
  ResourceBreakdown,
  Recommendation,
  NetworkRequest,
} from '../types/index.js';
import { CARBON_INTENSITY_BY_COUNTRY, GREEN_HOSTING_PROVIDERS } from './tech-patterns.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('carbon-calculator');

// SWD Model v4 constants (kWh/GB)
const SWD_DATA_CENTER = 0.055;
const SWD_NETWORK = 0.059;
const SWD_END_DEVICE = 0.080;
const SWD_TOTAL = SWD_DATA_CENTER + SWD_NETWORK + SWD_END_DEVICE; // 0.194

// 1byte model
const ONEBYTE_KWH_PER_GB = 0.06;

// JS execution energy estimate (kWh/MB parsed)
const JS_PARSE_KWH_PER_MB = 0.000035;

// Per unique third-party domain overhead (bytes equivalent)
const THIRD_PARTY_DOMAIN_OVERHEAD_BYTES = 2048;

interface CarbonInput {
  transferSizeBytes: number;
  decodedSizeBytes: number;
  greenHosting: boolean;
  greenHostingProvider?: string;
  serverGridIntensity: number; // gCO2eq/kWh
  serverCountryCode: string;
  serverCountry: string;
  serverRegion?: string;
  newVisitorRatio: number; // 0-1
  cacheRatio: number; // 0-1, average cache efficiency for returning visitors
  monthlyVisits?: number;
  resourceBreakdown: ResourceBreakdown;
  uniqueThirdPartyDomains: number;
  networkRequests: NetworkRequest[];
  jsLongTasksMs: number; // total blocking time from JS
  jsTotalBytes: number;
}

export function calculateCarbon(input: CarbonInput): {
  models: CarbonScores;
  equivalents: CarbonEquivalents;
  recommendations: Recommendation[];
} {
  const {
    transferSizeBytes,
    greenHosting,
    greenHostingProvider,
    serverGridIntensity,
    serverCountryCode,
    serverCountry,
    serverRegion,
    newVisitorRatio,
    cacheRatio,
    monthlyVisits,
    resourceBreakdown,
    uniqueThirdPartyDomains,
    jsLongTasksMs,
    jsTotalBytes,
  } = input;

  const transferGB = transferSizeBytes / (1024 ** 3);
  const returningVisitorRatio = 1 - newVisitorRatio;
  
  // Effective data transferred (accounting for caching)
  const effectiveTransferGB = (newVisitorRatio * transferGB) + (returningVisitorRatio * transferGB * (1 - cacheRatio));

  // === Model 1: SWD v4 ===
  let swdDataCenterEnergy = SWD_DATA_CENTER;
  if (greenHosting) {
    swdDataCenterEnergy = 0; // Green hosting eliminates data center energy
  }
  
  const swdTotalKwh = effectiveTransferGB * (swdDataCenterEnergy + SWD_NETWORK + SWD_END_DEVICE);
  const swdCo2G = swdTotalKwh * serverGridIntensity;

  // === Model 2: 1byte ===
  const onebyteKwh = effectiveTransferGB * ONEBYTE_KWH_PER_GB;
  const onebyteCo2G = onebyteKwh * serverGridIntensity;

  // === Model 3: Hybrid (Our Custom Model) ===
  const hybridCo2G = calculateHybridModel({
    resourceBreakdown,
    effectiveTransferGB,
    serverGridIntensity,
    greenHosting,
    uniqueThirdPartyDomains,
    jsLongTasksMs,
    jsTotalBytes,
    networkRequests: input.networkRequests,
  });

  // Annual estimate
  let annualCo2Kg: number | undefined;
  if (monthlyVisits) {
    annualCo2Kg = (hybridCo2G / 1000) * monthlyVisits * 12;
  }

  const grade = getCarbonGrade(hybridCo2G);

  const models: CarbonScores = {
    swd: Math.round(swdCo2G * 1000) / 1000,
    onebyte: Math.round(onebyteCo2G * 1000) / 1000,
    hybrid: Math.round(hybridCo2G * 1000) / 1000,
    grade,
    greenHosting,
    greenHostingProvider,
    gridIntensity: serverGridIntensity,
    serverLocation: {
      country: serverCountry,
      countryCode: serverCountryCode,
      region: serverRegion,
    },
    annualCo2Kg,
  };

  const equivalents = calculateEquivalents(hybridCo2G, monthlyVisits);
  const recommendations = generateCarbonRecommendations(input, hybridCo2G);

  return { models, equivalents, recommendations };
}

function calculateHybridModel(params: {
  resourceBreakdown: ResourceBreakdown;
  effectiveTransferGB: number;
  serverGridIntensity: number;
  greenHosting: boolean;
  uniqueThirdPartyDomains: number;
  jsLongTasksMs: number;
  jsTotalBytes: number;
  networkRequests: NetworkRequest[];
}): number {
  const {
    resourceBreakdown,
    effectiveTransferGB,
    serverGridIntensity,
    greenHosting,
    uniqueThirdPartyDomains,
    jsLongTasksMs,
    jsTotalBytes,
  } = params;

  // Segment multipliers by resource type
  const typeMultipliers: Record<string, number> = {
    html: 1.0,
    javascript: 1.5, // Execution energy on device
    css: 0.9,
    images: 1.2,
    fonts: 0.8, // Cached aggressively
    video: 3.0, // Video processing = much more energy
    xhr: 1.0,
    other: 1.0,
  };

  let weightedTransferGB = 0;
  const totalTransferBytes = resourceBreakdown.total.transferSize;

  for (const [type, multiplier] of Object.entries(typeMultipliers)) {
    const rb = resourceBreakdown[type as keyof ResourceBreakdown] as { transferSize: number } | undefined;
    if (rb) {
      const ratio = totalTransferBytes > 0 ? rb.transferSize / totalTransferBytes : 0;
      weightedTransferGB += effectiveTransferGB * ratio * multiplier;
    }
  }

  // Data center energy
  const dataCenterEnergy = greenHosting ? 0 : SWD_DATA_CENTER;

  // Base carbon from transfer
  const transferCo2G = weightedTransferGB * (dataCenterEnergy + SWD_NETWORK + SWD_END_DEVICE) * serverGridIntensity;

  // JavaScript execution energy (device-side)
  const jsMB = jsTotalBytes / (1024 ** 2);
  const jsParseKwh = jsMB * JS_PARSE_KWH_PER_MB;
  const jsExecutionKwh = (jsLongTasksMs / 1000) * 0.000005; // ~5W device load
  const jsCo2G = (jsParseKwh + jsExecutionKwh) * serverGridIntensity;

  // Third-party domain overhead
  const thirdPartyOverheadBytes = uniqueThirdPartyDomains * THIRD_PARTY_DOMAIN_OVERHEAD_BYTES;
  const thirdPartyOverheadGB = thirdPartyOverheadBytes / (1024 ** 3);
  const thirdPartyCo2G = thirdPartyOverheadGB * SWD_TOTAL * serverGridIntensity;

  const totalCo2G = transferCo2G + jsCo2G + thirdPartyCo2G;

  logger.debug({
    transferCo2G,
    jsCo2G,
    thirdPartyCo2G,
    total: totalCo2G,
  }, 'Hybrid carbon model breakdown');

  return Math.max(0.001, totalCo2G);
}

function getCarbonGrade(co2G: number): string {
  // Based on SWD model benchmarks and website carbon calculator grades
  // Thresholds in grams CO2 per page view
  if (co2G <= 0.095) return 'A+';
  if (co2G <= 0.186) return 'A';
  if (co2G <= 0.341) return 'B';
  if (co2G <= 0.493) return 'C';
  if (co2G <= 0.656) return 'D';
  if (co2G <= 1.0) return 'E';
  return 'F';
}

function calculateEquivalents(co2G: number, monthlyVisits?: number): CarbonEquivalents {
  const equivalents: CarbonEquivalents = {
    kettleBoils: Math.round((co2G / 50) * 10000) / 10000,
    smartphoneCharges: Math.round((co2G / 8.22) * 10000) / 10000,
    ledBulbHours: Math.round((co2G / 9) * 10000) / 10000,
    carKm: Math.round((co2G / 200) * 10000) / 10000,
    flightKm: Math.round((co2G / 255) * 10000) / 10000,
    treeYearPercent: Math.round((co2G / 21000) * 1000000) / 10000,
  };

  return equivalents;
}

export function getGridIntensity(countryCode: string): number {
  return CARBON_INTENSITY_BY_COUNTRY[countryCode] ?? CARBON_INTENSITY_BY_COUNTRY['__default'];
}

export function detectGreenHosting(provider?: string, asn?: string): {
  isGreen: boolean;
  isPartialGreen: boolean;
  providerName?: string;
  method?: string;
  percentage?: number;
} {
  if (!provider) {
    return { isGreen: false, isPartialGreen: false };
  }

  const providerLower = provider.toLowerCase();
  
  for (const [key, info] of Object.entries(GREEN_HOSTING_PROVIDERS)) {
    if (providerLower.includes(key)) {
      return {
        isGreen: info.green === true,
        isPartialGreen: info.green === 'partial',
        providerName: provider,
        method: info.method,
        percentage: info.percentage,
      };
    }
  }

  return { isGreen: false, isPartialGreen: false };
}

export function calculateResourceCarbonBreakdown(
  resourceBreakdown: ResourceBreakdown,
  gridIntensity: number,
  greenHosting: boolean,
): ResourceBreakdown {
  const multiplier = SWD_TOTAL * gridIntensity;
  
  const calculateCo2 = (bytes: number): number => {
    const gb = bytes / (1024 ** 3);
    return gb * multiplier;
  };

  const result = { ...resourceBreakdown };
  
  for (const key of Object.keys(result) as Array<keyof ResourceBreakdown>) {
    const stats = result[key];
    if (stats) {
      result[key] = {
        ...stats,
        co2Grams: calculateCo2(stats.transferSize),
      };
    }
  }

  return result;
}

function generateCarbonRecommendations(
  input: CarbonInput,
  co2G: number,
): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const { resourceBreakdown, greenHosting, uniqueThirdPartyDomains } = input;

  // Green hosting recommendation
  if (!greenHosting) {
    const potentialSaving = co2G * 0.28; // ~28% from datacenter segment
    recommendations.push({
      id: 'green-hosting',
      title: 'Switch to a green hosting provider',
      description: 'Your site is hosted on non-renewable energy. Switching to green hosting (Hetzner, Cloudflare, Netlify) could reduce data center emissions by up to 100%.',
      category: 'carbon',
      impact: 'high',
      estimatedCo2SaveG: potentialSaving,
      references: ['https://www.thegreenwebfoundation.org/', 'https://sustainablewebdesign.org/'],
    });
  }

  // Image optimization
  const imageSizeKb = resourceBreakdown.images.transferSize / 1024;
  if (imageSizeKb > 500) {
    recommendations.push({
      id: 'image-optimization',
      title: 'Optimize images — convert to WebP/AVIF',
      description: `Images account for ${Math.round(imageSizeKb)}KB of your page weight. Converting to WebP/AVIF can reduce image size by 25-50%.`,
      category: 'carbon',
      impact: 'high',
      estimatedCo2SaveG: co2G * (resourceBreakdown.images.transferSize / resourceBreakdown.total.transferSize) * 0.35,
      estimatedSizesSaveBytes: resourceBreakdown.images.transferSize * 0.35,
      codeSnippet: `<picture>
  <source srcset="image.avif" type="image/avif">
  <source srcset="image.webp" type="image/webp">
  <img src="image.jpg" alt="description" loading="lazy">
</picture>`,
    });
  }

  // JavaScript reduction
  const jsSizeKb = resourceBreakdown.javascript.transferSize / 1024;
  if (jsSizeKb > 300) {
    recommendations.push({
      id: 'reduce-javascript',
      title: 'Reduce JavaScript bundle size',
      description: `${Math.round(jsSizeKb)}KB of JavaScript detected. Large JS bundles increase both transfer AND device energy consumption. Consider code splitting, tree shaking, or removing unused dependencies.`,
      category: 'carbon',
      impact: 'high',
      estimatedCo2SaveG: co2G * 0.15,
      estimatedSizesSaveBytes: resourceBreakdown.javascript.transferSize * 0.3,
    });
  }

  // Font optimization
  const fontSizeKb = resourceBreakdown.fonts.transferSize / 1024;
  if (fontSizeKb > 50) {
    recommendations.push({
      id: 'self-host-fonts',
      title: 'Self-host fonts or use system fonts',
      description: `External font services (Google Fonts, Adobe Fonts) add ${Math.round(fontSizeKb)}KB plus additional connection overhead. Self-hosting with font-display: swap improves both performance and privacy.`,
      category: 'carbon',
      impact: 'medium',
      estimatedCo2SaveG: co2G * 0.05,
      codeSnippet: `@font-face {
  font-family: 'MyFont';
  src: url('/fonts/myfont.woff2') format('woff2');
  font-display: swap;
}`,
    });
  }

  // Third party reduction
  if (uniqueThirdPartyDomains > 10) {
    recommendations.push({
      id: 'reduce-third-parties',
      title: `Reduce third-party requests (${uniqueThirdPartyDomains} unique domains)`,
      description: 'Each unique third-party domain requires a separate DNS lookup, TCP handshake, and TLS negotiation. Consider consolidating analytics, removing unused widgets, and using privacy-friendly alternatives.',
      category: 'carbon',
      impact: 'medium',
      estimatedCo2SaveG: co2G * 0.08,
    });
  }

  // Video optimization
  const videoSizeKb = resourceBreakdown.video.transferSize / 1024;
  if (videoSizeKb > 100) {
    recommendations.push({
      id: 'optimize-video',
      title: 'Lazy-load or defer video content',
      description: `${Math.round(videoSizeKb)}KB of video resources loaded on page load. Video has 3× the carbon footprint per byte. Use facade patterns for embedded players.`,
      category: 'carbon',
      impact: 'high',
      estimatedCo2SaveG: co2G * (resourceBreakdown.video.transferSize / resourceBreakdown.total.transferSize) * 0.8,
      codeSnippet: `<!-- Lite YouTube Embed instead of full iframe -->
<lite-youtube videoid="YOUTUBE_ID"></lite-youtube>`,
    });
  }

  // Compression
  if (resourceBreakdown.total.transferSize < resourceBreakdown.total.decodedSize * 0.5) {
    // If compression ratio is less than 50%, likely already compressed
  } else {
    recommendations.push({
      id: 'enable-compression',
      title: 'Enable Brotli compression',
      description: 'Brotli compression can reduce text resource sizes by 15-25% compared to gzip. Ensure your server has Brotli enabled.',
      category: 'carbon',
      impact: 'medium',
      estimatedCo2SaveG: co2G * 0.08,
    });
  }

  return recommendations.sort((a, b) => {
    const impactOrder = { high: 0, medium: 1, low: 2 };
    return impactOrder[a.impact] - impactOrder[b.impact];
  });
}
