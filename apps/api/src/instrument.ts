/**
 * Sentry instrumentation — imported as the very first line of server.ts and task.worker.ts
 * so Sentry's auto-instrumentation patches Node.js internals before any other code runs.
 *
 * Safe to import when SENTRY_DSN is unset — init() is skipped and all Sentry calls become no-ops.
 */
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    // Capture 20% of traces in production, 100% in dev/staging
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    // Ignore noisy, expected errors
    ignoreErrors: [
      'Invalid credentials',
      'Unauthorized',
    ],
  });
}

export { Sentry };
