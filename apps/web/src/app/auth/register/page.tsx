'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../../lib/api-client';
import { Zap } from 'lucide-react';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await apiClient.post('/auth/register', { name, email, password });
      router.push('/auth/login?registered=1');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
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
          <h2 className="font-semibold text-center">Create Account</h2>
          {error && <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded">{error}</p>}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus
              className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
              className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            <p className="text-xs text-muted-foreground mt-1">Minimum 8 characters</p>
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-primary text-primary-foreground py-2 rounded text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
          <p className="text-xs text-center text-muted-foreground">
            Already have an account? <a href="/auth/login" className="text-primary hover:underline">Sign in</a>
          </p>
        </form>
      </div>
    </div>
  );
}
