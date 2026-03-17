'use client';
import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Zap, CheckCircle2, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { apiClient } from '../../../lib/api-client';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) setError('Missing reset token. Please use the link from your email.');
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await apiClient.post('/auth/reset-password', { token, password });
      setSuccess(true);
      // Redirect to login after 2.5s
      setTimeout(() => router.push('/auth/login'), 2500);
    } catch (err: any) {
      setError(err.response?.data?.error ?? err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      {success ? (
        /* Success state */
        <div className="flex flex-col items-center text-center gap-3 py-2">
          <CheckCircle2 className="w-10 h-10 text-green-500" />
          <h2 className="font-semibold text-base">Password updated!</h2>
          <p className="text-sm text-muted-foreground">
            Your password has been changed. Redirecting you to sign in…
          </p>
        </div>
      ) : !token ? (
        /* No token state */
        <div className="flex flex-col items-center text-center gap-3 py-2">
          <AlertCircle className="w-10 h-10 text-destructive" />
          <h2 className="font-semibold text-base">Invalid reset link</h2>
          <p className="text-sm text-muted-foreground">
            This link is missing a reset token. Please use the link from your email or{' '}
            <Link href="/auth/forgot-password" className="text-primary hover:underline">
              request a new one
            </Link>
            .
          </p>
        </div>
      ) : (
        /* Form state */
        <>
          <h2 className="font-semibold text-center mb-1">Set a new password</h2>
          <p className="text-xs text-muted-foreground text-center mb-5">
            Choose a strong password of at least 8 characters.
          </p>

          {error && (
            <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded mb-4">
              {error}
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">New password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                  minLength={8}
                  placeholder="At least 8 characters"
                  className="w-full bg-secondary border border-border rounded px-3 py-2 pr-9 text-sm
                             focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground
                             hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground mb-1">Confirm password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                placeholder="Repeat your new password"
                className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm
                           focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !password || !confirm}
              className="w-full bg-primary text-primary-foreground py-2 rounded text-sm
                         font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mb-3">
            <Zap className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">AgentHub</h1>
          <p className="text-sm text-muted-foreground mt-1">Virtual AI Office Platform</p>
        </div>

        <Suspense fallback={
          <div className="bg-card border border-border rounded-xl p-6 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        }>
          <ResetPasswordForm />
        </Suspense>

        <div className="flex justify-center mt-4">
          <Link
            href="/auth/login"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
