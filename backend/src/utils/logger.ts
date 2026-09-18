import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
    : undefined,
  base: { service: 'carbon-analyzer' },
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});

export function createModuleLogger(module: string) {
  return logger.child({ module });
}
