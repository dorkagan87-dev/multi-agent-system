import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  JWT_REFRESH_EXPIRES: z.string().default('7d'),
  ENCRYPTION_KEY: z.string().length(64), // 32 bytes hex
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  WORKER_CONCURRENCY: z.coerce.number().default(5),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  // Public URL of the frontend — used to build password reset links
  APP_URL: z.string().default('http://localhost:3000'),
  // Sentry — optional; if absent, error reporting is disabled
  SENTRY_DSN: z.string().optional(),
  // SMTP — all optional; if absent, reset links are logged to console (dev mode)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
