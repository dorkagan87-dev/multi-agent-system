/**
 * Sentry server-side config — runs in Next.js Node.js runtime (SSR, API routes).
 * Skips init when SENTRY_DSN is not set.
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  });
}
