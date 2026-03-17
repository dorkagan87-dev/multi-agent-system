'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api-client';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Building2,
  CheckCircle,
  ChevronRight,
  Key,
  Loader2,
  User,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';
import { cn } from '../../../lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab = 'account' | 'company';
type CompanyStep = 'select' | 'configure' | 'done';

// ── Account tab ───────────────────────────────────────────────────────────────

function AccountSettings() {
  const { data: session, update: updateSession } = useSession();
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  // Profile form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  // Password form
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  // Seed from /auth/me
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiClient.get('/auth/me').then((r) => r.data),
  });

  useEffect(() => {
    if (me) {
      setName(me.name ?? '');
      setEmail(me.email ?? '');
    }
  }, [me]);

  const profileMutation = useMutation({
    mutationFn: (data: { name?: string; email?: string }) =>
      apiClient.patch('/auth/me', data).then((r) => r.data),
    onSuccess: (updated) => {
      toast.success('Profile updated');
      // Refresh NextAuth session so the header reflects the new name/email
      updateSession({ name: updated.name, email: updated.email });
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Failed to update profile'),
  });

  const passwordMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      apiClient.post('/auth/change-password', data),
    onSuccess: () => {
      toast.success('Password changed');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Failed to change password'),
  });

  function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    const updates: { name?: string; email?: string } = {};
    if (name !== (me?.name ?? '')) updates.name = name;
    if (email !== me?.email) updates.email = email;
    if (Object.keys(updates).length === 0) return toast('Nothing to save');
    profileMutation.mutate(updates);
  }

  function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault();
    if (newPw.length < 8) return toast.error('New password must be at least 8 characters');
    if (newPw !== confirmPw) return toast.error('New passwords do not match');
    passwordMutation.mutate({ currentPassword: currentPw, newPassword: newPw });
  }

  return (
    <div className="space-y-6 max-w-lg">
      {/* Profile */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold mb-4">
          <User className="w-4 h-4 text-primary" /> Profile
        </h3>
        <form onSubmit={handleProfileSave} className="space-y-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Display name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm
                         focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm
                         focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={profileMutation.isPending}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2
                         rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {profileMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save profile
            </button>
          </div>
        </form>
      </div>

      {/* Password */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold mb-4">
          <Lock className="w-4 h-4 text-primary" /> Change password
        </h3>
        <form onSubmit={handlePasswordSave} className="space-y-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Current password</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                required
                placeholder="Your current password"
                className="w-full bg-secondary border border-border rounded px-3 py-2 pr-9 text-sm
                           focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">New password</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                required
                minLength={8}
                placeholder="At least 8 characters"
                className="w-full bg-secondary border border-border rounded px-3 py-2 pr-9 text-sm
                           focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Confirm new password</label>
            <input
              type={showNew ? 'text' : 'password'}
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              required
              placeholder="Repeat new password"
              className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm
                         focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={passwordMutation.isPending || !currentPw || !newPw || !confirmPw}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2
                         rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {passwordMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Update password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Company tab (existing sector flow, unchanged logic) ───────────────────────

function CompanySettings() {
  const qc = useQueryClient();
  const router = useRouter();

  const { data: sectorsData } = useQuery({
    queryKey: ['sectors'],
    queryFn: () => apiClient.get('/sector').then((r) => r.data),
  });

  const { data: currentSector } = useQuery({
    queryKey: ['current-sector'],
    queryFn: () => apiClient.get('/sector/current').then((r) => r.data),
  });

  const [selected, setSelected] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState({ anthropic: '', openai: '', google: '' });
  const [step, setStep] = useState<CompanyStep>('select');

  const applyMutation = useMutation({
    mutationFn: (data: { sector: string; apiKeys: Record<string, string> }) =>
      apiClient.post('/sector/apply', data),
    onSuccess: (res) => {
      const d = res.data;
      toast.success(`${d.sector} company configured! Created ${d.created.length} agents.`);
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: ['current-sector'] });
      setStep('done');
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Failed to apply sector'),
  });

  const sectors = sectorsData?.sectors ?? [];
  const activeSector = currentSector?.sector;

  if (step === 'done') {
    return (
      <div className="max-w-lg text-center py-16 space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
          <CheckCircle className="w-8 h-8 text-green-400" />
        </div>
        <h2 className="text-xl font-bold">Company Configured!</h2>
        <p className="text-muted-foreground text-sm">
          Your AI company has been optimised for your sector. All recommended agents have been
          registered with sector-tuned system prompts and tool grants.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => router.push('/agents')}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm"
          >
            View Agents
          </button>
          <button
            onClick={() => router.push('/office')}
            className="border border-border px-4 py-2 rounded-lg text-sm hover:bg-secondary"
          >
            Open Office
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {activeSector && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-3 flex items-center gap-3">
          <Building2 className="w-4 h-4 text-primary" />
          <p className="text-sm">
            Current sector:{' '}
            <span className="font-semibold text-primary capitalize">{activeSector}</span>
          </p>
        </div>
      )}

      {step === 'select' && (
        <>
          <div>
            <h2 className="text-base font-semibold">Select Your Industry Sector</h2>
            <p className="text-sm text-muted-foreground mt-1">
              AgentHub will configure the optimal agent roster, system prompts, tools, compliance
              rules, and CEO planning style for your industry.
            </p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {sectors.map((s: any) => (
              <button
                key={s.id}
                onClick={() => { setSelected(s.id); setStep('configure'); }}
                className={cn(
                  'text-left bg-card border rounded-xl p-4 hover:border-primary/60 transition-all',
                  selected === s.id ? 'border-primary ring-1 ring-primary' : 'border-border',
                )}
              >
                <div className="text-2xl mb-2">{s.icon}</div>
                <p className="font-semibold text-sm">{s.label}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.description}</p>
                <ChevronRight className="w-3 h-3 text-muted-foreground mt-2" />
              </button>
            ))}
          </div>
        </>
      )}

      {step === 'configure' && selected && (() => {
        const sector = sectors.find((s: any) => s.id === selected);
        return (
          <div className="space-y-5">
            <button
              onClick={() => setStep('select')}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ← Back to sector selection
            </button>
            <div className="flex items-center gap-3">
              <span className="text-3xl">{sector?.icon}</span>
              <div>
                <h2 className="font-bold text-lg">{sector?.label}</h2>
                <p className="text-sm text-muted-foreground">{sector?.description}</p>
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Key className="w-4 h-4 text-primary" /> Provider API Keys
              </h3>
              <p className="text-xs text-muted-foreground">
                Provide API keys for the AI providers used in this sector. Keys are encrypted at
                rest using AES-256-GCM. You can leave providers blank to skip those agents.
              </p>
              {[
                { id: 'anthropic', label: 'Anthropic (Claude)', placeholder: 'sk-ant-...' },
                { id: 'openai', label: 'OpenAI (GPT)', placeholder: 'sk-...' },
                { id: 'google', label: 'Google (Gemini)', placeholder: 'AIza...' },
              ].map(({ id, label, placeholder }) => (
                <div key={id}>
                  <label className="block text-xs text-muted-foreground mb-1">{label}</label>
                  <input
                    type="password"
                    value={apiKeys[id as keyof typeof apiKeys]}
                    onChange={(e) => setApiKeys((k) => ({ ...k, [id]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm
                               focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep('select')}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-secondary"
              >
                Back
              </button>
              <button
                disabled={
                  applyMutation.isPending ||
                  (!apiKeys.anthropic && !apiKeys.openai && !apiKeys.google)
                }
                onClick={() => applyMutation.mutate({ sector: selected, apiKeys })}
                className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground
                           py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {applyMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Configuring company...</>
                ) : (
                  <>Configure {sector?.label} Company</>
                )}
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('account');

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'account', label: 'Account', icon: <User className="w-4 h-4" /> },
    { id: 'company', label: 'Company', icon: <Building2 className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account and company configuration.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'account' && <AccountSettings />}
      {tab === 'company' && <CompanySettings />}
    </div>
  );
}
