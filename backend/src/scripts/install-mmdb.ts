/**
 * install-mmdb.ts
 * Downloads MaxMind GeoLite2 .mmdb files from GitHub mirrors.
 * Primary: P3TERX/GeoLite.mmdb (has all 3 databases)
 * Fallback: blocktrace/maxmind-geoip
 * No API key needed. Auto-polls weekly.
 */

import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { fileURLToPath } from 'url';
import { createModuleLogger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = createModuleLogger('mmdb-installer');

const DATA_DIR = path.join(__dirname, '../../../data/maxmind');
const LINK_DIR = path.join(__dirname, '../../../data');

// Mirrors — tried in order
const MIRRORS = [
  'https://github.com/P3TERX/GeoLite.mmdb/releases/latest/download',    // primary: has City+Country+ASN
  'https://github.com/blocktrace/maxmind-geoip/releases/latest/download', // fallback
];

const APIS = [
  'https://api.github.com/repos/P3TERX/GeoLite.mmdb/releases/latest',
  'https://api.github.com/repos/blocktrace/maxmind-geoip/releases/latest',
];

const UA = 'carbon-analyzer-mmdb/1.0';

const DB_FILES = [
  { name: 'GeoLite2-City.mmdb',    label: 'City-level geolocation' },
  { name: 'GeoLite2-Country.mmdb', label: 'Country geolocation'    },
  { name: 'GeoLite2-ASN.mmdb',     label: 'ASN / ISP lookup'       },
];

async function streamDownload(url: string, dest: string): Promise<void> {
  const { default: got } = await import('got');
  const src = got.stream(url, {
    headers: { 'User-Agent': UA },
    followRedirect: true,
    timeout: { request: 180_000 },
  });
  await pipeline(src as unknown as NodeJS.ReadableStream, createWriteStream(dest));
}

async function checkUrlOk(url: string): Promise<boolean> {
  try {
    const { default: got } = await import('got');
    await got.head(url, {
      headers: { 'User-Agent': UA },
      followRedirect: true,
      timeout: { request: 10_000 },
      throwHttpErrors: true,
    });
    return true;
  } catch { return false; }
}

async function getLatestPublishedAt(): Promise<string | null> {
  const { default: got } = await import('got');
  for (const api of APIS) {
    try {
      const rel = await got(api, {
        headers: { 'User-Agent': UA },
        followRedirect: true,
        timeout: { request: 10_000 },
        throwHttpErrors: false,
      }).json<{ published_at?: string }>();
      if (rel.published_at) return rel.published_at;
    } catch { /* try next */ }
  }
  return null;
}

function linkToDataDir(src: string, name: string): void {
  const dest = path.join(LINK_DIR, name);
  try { if (fs.existsSync(dest)) fs.unlinkSync(dest); } catch {}
  try { fs.symlinkSync(src, dest); } catch {
    try { fs.copyFileSync(src, dest); } catch {}
  }
}

export async function installMmdb(force = false): Promise<void> {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  logger.info('Checking MaxMind GeoIP databases...');

  const publishedAt = await getLatestPublishedAt();

  for (const db of DB_FILES) {
    const destPath = path.join(DATA_DIR, db.name);

    // Skip if already fresh
    if (!force && publishedAt && fs.existsSync(destPath)) {
      const mtime = fs.statSync(destPath).mtimeMs;
      if (mtime > new Date(publishedAt).getTime()) {
        logger.info({ db: db.name }, 'Up to date, skipping');
        linkToDataDir(destPath, db.name);
        continue;
      }
    }

    // Try each mirror in order
    let downloaded = false;
    for (const mirror of MIRRORS) {
      const url = `${mirror}/${db.name}`;
      const tmpPath = destPath + '.tmp';

      logger.info({ db: db.name, url }, 'Downloading...');

      try {
        await streamDownload(url, tmpPath);

        const size = fs.statSync(tmpPath).size;
        if (size < 100_000) {
          fs.rmSync(tmpPath, { force: true });
          logger.warn({ db: db.name, size, mirror }, 'File too small, trying next mirror');
          continue;
        }

        fs.renameSync(tmpPath, destPath);
        logger.info({ db: db.name, sizeMb: (size / 1048576).toFixed(1) }, `✓ Installed: ${db.label}`);
        linkToDataDir(destPath, db.name);
        downloaded = true;
        break;
      } catch (err) {
        fs.rmSync(tmpPath, { force: true });
        logger.warn({ db: db.name, mirror }, 'Mirror failed, trying next...');
      }
    }

    if (!downloaded) {
      logger.error({ db: db.name }, 'All mirrors failed for this database');
    }
  }

  logger.info('MaxMind database check complete');
}

/** Background poller — checks weekly (MaxMind updates every Tuesday). */
export function startMmdbPoller(intervalMs = 7 * 24 * 60 * 60 * 1000): void {
  installMmdb().catch(err => logger.error({ err }, 'Initial MMDB install failed'));
  setInterval(() => installMmdb().catch(err => logger.error({ err }, 'MMDB poll failed')), intervalMs);
  logger.info({ intervalDays: intervalMs / 86_400_000 }, 'MMDB auto-poller started');
}

if (process.argv[1]?.includes('install-mmdb')) {
  installMmdb(process.argv.includes('--force'))
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}
