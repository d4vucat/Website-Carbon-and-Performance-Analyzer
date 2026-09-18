/**
 * device-emulator.ts
 * Real device emulation with accurate CPU throttling, network conditions,
 * and device-specific viewport/user-agent profiles.
 * Uses Playwright's CDP session for hardware-accurate throttling.
 */

import type { BrowserContext, Page, CDPSession } from 'playwright';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('device-emulator');

// ---------------------------------------------------------------------------
// Device profiles
// ---------------------------------------------------------------------------

export type DeviceProfile =
  | 'desktop-fast'
  | 'desktop-average'
  | 'mobile-high-end'
  | 'mobile-mid-range'
  | 'mobile-low-end'
  | 'tablet';

export interface DeviceConfig {
  name: string;
  userAgent: string;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  // CPU throttling (1 = no throttle, 4 = 4× slower)
  cpuThrottling: number;
  // Network throttling (CDP NetworkConditions)
  network: {
    offline: boolean;
    downloadThroughput: number;  // bytes/s (-1 = no limit)
    uploadThroughput: number;
    latency: number;             // ms
    connectionType: string;
  };
}

export const DEVICE_PROFILES: Record<DeviceProfile, DeviceConfig> = {
  'desktop-fast': {
    name: 'Desktop (Fast — Fiber)',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    cpuThrottling: 1,
    network: { offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0, connectionType: 'wifi' },
  },

  'desktop-average': {
    name: 'Desktop (Average — Cable)',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    cpuThrottling: 1,
    network: { offline: false, downloadThroughput: 5_000_000 / 8, uploadThroughput: 1_000_000 / 8, latency: 20, connectionType: 'cable' },
  },

  'mobile-high-end': {
    name: 'Mobile High-End (Pixel 7 / iPhone 14)',
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    cpuThrottling: 2,
    network: { offline: false, downloadThroughput: 40_000_000 / 8, uploadThroughput: 10_000_000 / 8, latency: 20, connectionType: '4g' },
  },

  'mobile-mid-range': {
    name: 'Mobile Mid-Range (Moto G Power)',
    userAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    viewport: { width: 412, height: 892 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    cpuThrottling: 4,
    network: { offline: false, downloadThroughput: 10_000_000 / 8, uploadThroughput: 3_000_000 / 8, latency: 40, connectionType: '4g' },
  },

  'mobile-low-end': {
    name: 'Mobile Low-End (3G emerging market)',
    userAgent: 'Mozilla/5.0 (Linux; Android 9; SM-J260M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.93 Mobile Safari/537.36',
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    cpuThrottling: 6,
    network: { offline: false, downloadThroughput: 1_600_000 / 8, uploadThroughput: 750_000 / 8, latency: 300, connectionType: '3g' },
  },

  'tablet': {
    name: 'Tablet (iPad Air)',
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 820, height: 1180 },
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: true,
    cpuThrottling: 2,
    network: { offline: false, downloadThroughput: 20_000_000 / 8, uploadThroughput: 5_000_000 / 8, latency: 30, connectionType: 'wifi' },
  },
};

// ---------------------------------------------------------------------------
// Emulation setup
// ---------------------------------------------------------------------------

export async function applyDeviceEmulation(
  context: BrowserContext,
  page: Page,
  profile: DeviceProfile | DeviceConfig,
): Promise<CDPSession | null> {
  const config: DeviceConfig = typeof profile === 'string' ? DEVICE_PROFILES[profile] : profile;

  // Viewport & mobile emulation via context is done at context creation.
  // Here we apply CDP-level throttling.

  let cdp: CDPSession | null = null;

  try {
    cdp = await context.newCDPSession(page);

    // CPU throttling via CDP Emulation
    if (config.cpuThrottling > 1) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: config.cpuThrottling });
      logger.debug({ throttle: `${config.cpuThrottling}×` }, 'CPU throttling applied');
    }

    // Network throttling via CDP Network
    if (config.network.downloadThroughput !== -1 || config.network.latency > 0) {
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: config.network.offline,
        downloadThroughput: config.network.downloadThroughput,
        uploadThroughput: config.network.uploadThroughput,
        latency: config.network.latency,
        connectionType: config.network.connectionType,
      });
      logger.debug({
        down: `${Math.round((config.network.downloadThroughput * 8) / 1_000_000)}Mbps`,
        latency: `${config.network.latency}ms`,
      }, 'Network throttling applied');
    }

    // Touch emulation
    if (config.hasTouch) {
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    }

    // Device memory and hardware concurrency hints
    await cdp.send('Emulation.setHardwareConcurrency', { hardwareConcurrency: config.isMobile ? 4 : 8 }).catch(() => {});

  } catch (err) {
    logger.warn({ err }, 'Failed to apply some CDP throttling settings');
  }

  return cdp;
}

export function buildContextOptions(profile: DeviceProfile | DeviceConfig): Parameters<import('playwright').Browser['newContext']>[0] {
  const config: DeviceConfig = typeof profile === 'string' ? DEVICE_PROFILES[profile] : profile;
  return {
    viewport: config.viewport,
    userAgent: config.userAgent,
    deviceScaleFactor: config.deviceScaleFactor,
    isMobile: config.isMobile,
    hasTouch: config.hasTouch,
  };
}

// ---------------------------------------------------------------------------
// Multi-device runner
// ---------------------------------------------------------------------------

export interface MultiDeviceResult {
  profile: DeviceProfile;
  config: DeviceConfig;
  // Subset of analysis result relevant to device comparison
  metrics: {
    lcp?: number;
    fcp?: number;
    ttfb?: number;
    tbt?: number;
    transferBytes: number;
    jsTime?: number;
    score?: number;
  };
}
