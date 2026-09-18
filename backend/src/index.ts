import 'dotenv/config';

import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1']);

import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifySensible from '@fastify/sensible';
import { registerRoutes } from './routes/api.js';
import { logger } from './utils/logger.js';
import { initPool, shutdownPool } from './modules/browser-pool.js';
import { restoreInterruptedJobs } from './jobs/job-manager.js';
import { startMmdbPoller } from './scripts/install-mmdb.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

const app = Fastify({
  logger: false,
  bodyLimit: 1048576,
  trustProxy: true,
});

await app.register(fastifyCors, {
  origin: process.env.CORS_ORIGIN ?? '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

await app.register(fastifyRateLimit, {
  max: 100,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.ip,
});

await app.register(fastifySensible);
await registerRoutes(app);

// ── Initialize browser pool ───────────────────────────────────────────────
await initPool();

// ── Restore jobs interrupted by previous shutdown ─────────────────────────
restoreInterruptedJobs();

// ── GeoIP auto-update (weekly, no API key) ───────────────────────────────
if (process.env.MMDB_AUTO_UPDATE !== 'false') {
  startMmdbPoller();
}

const shutdown = async () => {
  logger.info('Shutting down...');
  await app.close();
  await shutdownPool();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

try {
  await app.listen({ port: PORT, host: HOST });
  logger.info({ port: PORT, host: HOST }, 'Server started (v2.1.0)');
} catch (err) {
  logger.error(err, 'Failed to start server');
  process.exit(1);
}
