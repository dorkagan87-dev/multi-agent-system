'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api-client';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Building2, CheckCircle, ChevronRight, Key, Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';

const SECURITY_COLORS: Record<string, string> = {
  standard: 'text-green-400 bg-green-400/10',
  high: 'text-yellow-400 bg-yellow-400/10',
  critical: 'text-red-400 bg-red-400/10',
};

export default function SettingsPage() {
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
  const [step, setStep] = useState<'select' | 'configure' | 'done'>('select');

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
      <div className="max-w-lg mx-auto text-center py-16 space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
          <CheckCircle className="w-8 h-8 text-green-400" />
        </div>
        <h2 className="text-xl font-bold">Company Configured!</h2>
        <p className="text-muted-foreground text-sm">Your AI company has been optimized for your sector. All recommended agents have been registered with sector-tuned system prompts and tool grants.</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => router.push('/agents')} className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm">
            View Agents
          </button>
          <button onClick={() => router.push('/office')} className="border border-border px-4 py-2 rounded-lg text-sm hover:bg-secondary">
            Open Office
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Current sector indicator */}
      {activeSector && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-3 flex items-center gap-3">
          <Building2 className="w-4 h-4 text-primary" />
          <p className="text-sm">Current sector: <span className="font-semibold text-primary capitalize">{activeSector}</span></p>
        </div>
      )}

      {step === 'select' && (
        <>
          <div>
            <h2 className="text-base font-semibold">Select Your Industry Sector</h2>
            <p className="text-sm text-muted-foreground mt-1">
              AgentHub will configure the optimal agent roster, system prompts, tools, compliance rules, and CEO planning style for your industry.
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
            <button onClick={() => setStep('select')} className="text-xs text-muted-foreground hover:text-foreground">
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
                Provide API keys for the AI providers used in this sector. Keys are encrypted at rest using AES-256-GCM. You can leave providers blank to skip those agents.
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
                    className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('select')} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-secondary">
                Back
              </button>
              <button
                disabled={applyMutation.isPending || (!apiKeys.anthropic && !apiKeys.openai && !apiKeys.google)}
                onClick={() => applyMutation.mutate({ sector: selected, apiKeys })}
                className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
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
