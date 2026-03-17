'use client';
import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import * as Sentry from '@sentry/nextjs';

// Catches errors in the root layout itself (e.g. Providers crashing)
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body style={{ margin: 0, background: '#0d1117', color: '#f0f6fc', fontFamily: 'sans-serif' }}>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '24px',
            textAlign: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'rgba(239,68,68,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertTriangle style={{ width: 32, height: 32, color: '#ef4444' }} />
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
              Application error
            </h2>
            <p style={{ fontSize: 14, color: '#8b949e', maxWidth: 400 }}>
              A critical error occurred. Please reload the page.
            </p>
            {error.digest && (
              <p style={{ fontSize: 11, color: '#6e7681', marginTop: 8, fontFamily: 'monospace' }}>
                Error ID: {error.digest}
              </p>
            )}
          </div>
          <button
            onClick={reset}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: '#2f81f7',
              color: '#fff',
              border: 'none',
              padding: '10px 20px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <RotateCcw style={{ width: 14, height: 14 }} /> Reload
          </button>
        </div>
      </body>
    </html>
  );
}
