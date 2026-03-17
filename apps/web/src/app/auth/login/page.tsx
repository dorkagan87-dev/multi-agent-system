'use client';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const result = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);
    if (!result) { setError('No response from auth server'); return; }
    if (result.error || !result.ok) {
      setError(`Login failed: ${result.error ?? 'unknown error'} (ok=${result.ok}, status=${result.status})`);
      return;
    }
    setError('Login OK — redirecting...');
    await new Promise((r) => setTimeout(r, 500));
    window.location.href = '/dashboard';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mb-3">
            <Zap className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">AgentHub</h1>
          <p className="text-sm text-muted-foreground mt-1">Virtual AI Office Platform</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-center">Sign In</h2>
          {error && <p className="text-xs font-bold px-3 py-2 rounded" style={{color:'red',background:'#fee'}}>{error}</p>}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus
              className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-primary text-primary-foreground py-2 rounded text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          <div className="flex justify-between text-xs text-muted-foreground">
            <a href="/auth/forgot-password" className="hover:text-foreground hover:underline">
              Forgot password?
            </a>
            <span>
              No account?{' '}
              <a href="/auth/register" className="text-primary hover:underline">Register</a>
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
