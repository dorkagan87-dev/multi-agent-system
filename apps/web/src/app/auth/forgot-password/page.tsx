'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Zap, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { apiClient } from '../../../lib/api-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await apiClient.post('/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.response?.data?.error ?? err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

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

        <div className="bg-card border border-border rounded-xl p-6">
          {submitted ? (
            /* Success state */
            <div className="flex flex-col items-center text-center gap-3 py-2">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
              <h2 className="font-semibold text-base">Check your inbox</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                If <span className="text-foreground font-medium">{email}</span> is registered,
                you'll receive a password reset link shortly.
              </p>
              <p className="text-xs text-muted-foreground">
                Didn't get it? Check your spam folder or{' '}
                <button
                  onClick={() => setSubmitted(false)}
                  className="text-primary hover:underline"
                >
                  try again
                </button>
                .
              </p>
            </div>
          ) : (
            /* Form state */
            <>
              <h2 className="font-semibold text-center mb-1">Forgot your password?</h2>
              <p className="text-xs text-muted-foreground text-center mb-5">
                Enter your email and we'll send you a reset link.
              </p>

              {error && (
                <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded mb-4">
                  {error}
                </p>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    placeholder="you@example.com"
                    className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm
                               focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary text-primary-foreground py-2 rounded text-sm
                             font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            </>
          )}
        </div>

        <div className="flex justify-center mt-4">
          <Link
            href="/auth/login"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-3 h-3" /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
