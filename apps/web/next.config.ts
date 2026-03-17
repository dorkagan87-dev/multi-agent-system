import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1/:path*`,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Sourcemap upload — requires SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT env vars.
  // If unset, the build succeeds silently without uploading sourcemaps.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Only print Sentry build output in CI
  silent: !process.env.CI,
  // Upload a larger set of source maps for prettier stack traces
  widenClientFileUpload: true,
  // Hide source maps from generated client bundles to avoid leaking source code
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  // Suppresses source map upload logs during build
  disableLogger: true,
  // Automatically instrument Vercel cron monitors — not needed here
  automaticVercelMonitors: false,
});
