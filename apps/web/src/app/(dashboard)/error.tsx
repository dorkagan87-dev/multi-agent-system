'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import * as Sentry from '@sentry/nextjs';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertTriangle className="w-8 h-8 text-destructive" />
      </div>

      <div className="space-y-2 max-w-md">
        <h2 className="text-xl font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {error.message || 'An unexpected error occurred on this page.'}
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/60 font-mono">
            Error ID: {error.digest}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={reset}
          className="flex items-center gap-2 bg-primary text-primary-foreground
                     px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90
                     transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Try again
        </button>
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-2 border border-border px-4 py-2
                     rounded-lg text-sm hover:bg-secondary transition-colors"
        >
          <Home className="w-3.5 h-3.5" />
          Go to dashboard
        </button>
      </div>
    </div>
  );
}
