'use client';
import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../../lib/api-client';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Download, ChevronDown } from 'lucide-react';

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI', models: [] },
  { value: 'anthropic', label: 'Anthropic', models: [] },
  { value: 'google', label: 'Google Gemini', models: [] },
  { value: 'mistral', label: 'Mistral', models: [] },
  { value: 'custom', label: 'Custom (OpenAI-compatible)', models: [] },
];

export default function NewAgentPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '', description: '', provider: 'anthropic',
    modelId: 'claude-sonnet-4-6', apiKey: '',
    systemPrompt: '', temperature: 0.7, maxTokensPerTurn: 4096,
    maxTurns: 20, jobTitle: '', department: '',
  });
  const [importApiKey, setImportApiKey] = useState('');
  const [importProvider, setImportProvider] = useState('openai');
  const [importedAgents, setImportedAgents] = useState<any[]>([]);
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [templateName, setTemplateName] = useState<string | null>(null);

  // Load template preset from sessionStorage (set by /agents/templates gallery)
  useEffect(() => {
    const raw = sessionStorage.getItem('agent_template_preset');
    if (!raw) return;
    try {
      const preset = JSON.parse(raw);
      sessionStorage.removeItem('agent_template_preset');
      setTemplateName(preset.name ?? null);
      setForm((f) => ({
        ...f,
        name: preset.name ?? f.name,
        description: preset.description ?? f.description,
        provider: preset.provider ?? f.provider,
        modelId: preset.modelId ?? f.modelId,
        systemPrompt: preset.systemPrompt ?? f.systemPrompt,
        temperature: preset.temperature ?? f.temperature,
        maxTokensPerTurn: preset.maxTokensPerTurn ?? f.maxTokensPerTurn,
        maxTurns: preset.maxTurns ?? f.maxTurns,
        jobTitle: preset.jobTitle ?? f.jobTitle,
        department: preset.department ?? f.department,
      }));
    } catch { /* ignore */ }
  }, []);

  const createMutation = useMutation({
    mutationFn: (data: any) => apiClient.post('/agents', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Agent registered!');
      router.push('/agents');
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Failed to register agent'),
  });

  const fetchModels = async () => {
    try {
      const res = await apiClient.post('/agents/import/models', { provider: form.provider, apiKey: form.apiKey });
      setAvailableModels(res.data.models);
      toast.success(`${res.data.models.length} models loaded`);
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Failed to fetch models');
    }
  };

  const fetchImportableAgents = async () => {
    try {
      const res = await apiClient.post('/agents/import/list', { provider: importProvider, apiKey: importApiKey });
      setImportedAgents(res.data.agents);
      toast.success(`${res.data.agents.length} agents found`);
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Failed to fetch agents');
    }
  };

  const importAgent = (agent: any) => {
    setForm((f) => ({
      ...f,
      name: agent.name,
      description: agent.description ?? '',
      modelId: agent.modelId,
      systemPrompt: agent.systemPrompt ?? '',
      provider: importProvider,
      apiKey: importApiKey,
    }));
    toast.success(`Imported: ${agent.name}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(form);
  };

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="max-w-2xl space-y-6">
      {/* Template banner */}
      {templateName && (
        <div className="bg-primary/10 border border-primary/30 rounded-lg px-4 py-2.5 text-sm flex items-center justify-between">
          <span>Using template: <span className="font-medium">{templateName}</span></span>
          <button
            type="button"
            onClick={() => setTemplateName(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}

      {/* Import from provider section */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Download className="w-4 h-4 text-primary" /> Import from Provider
        </h3>
        <div className="flex gap-2">
          <select
            value={importProvider}
            onChange={(e) => setImportProvider(e.target.value)}
            className="bg-secondary border border-border rounded px-2 py-1.5 text-sm"
          >
            {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <input
            placeholder="API Key"
            type="password"
            value={importApiKey}
            onChange={(e) => setImportApiKey(e.target.value)}
            className="flex-1 bg-secondary border border-border rounded px-2 py-1.5 text-sm"
          />
          <button onClick={fetchImportableAgents} className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-sm">
            Fetch
          </button>
        </div>
        {importedAgents.length > 0 && (
          <div className="mt-3 space-y-1.5 max-h-40 overflow-y-auto">
            {importedAgents.map((a) => (
              <div key={a.providerAgentId} className="flex items-center justify-between bg-secondary rounded px-3 py-2 text-sm">
                <span>{a.name} <span className="text-muted-foreground text-xs">({a.modelId})</span></span>
                <button onClick={() => importAgent(a)} className="text-xs text-primary hover:underline">Import</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Agent form */}
      <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-5 space-y-4">
        <h3 className="font-semibold text-sm">Agent Details</h3>

        <Field label="Name *">
          <input value={form.name} onChange={(e) => set('name', e.target.value)} required className="input" />
        </Field>

        <Field label="Description">
          <input value={form.description} onChange={(e) => set('description', e.target.value)} className="input" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Provider *">
            <select value={form.provider} onChange={(e) => set('provider', e.target.value)} className="input">
              {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Model ID *">
            <div className="flex gap-1">
              {availableModels.length > 0 ? (
                <select value={form.modelId} onChange={(e) => set('modelId', e.target.value)} className="input flex-1">
                  {availableModels.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
                </select>
              ) : (
                <input value={form.modelId} onChange={(e) => set('modelId', e.target.value)} required className="input flex-1" placeholder="e.g. claude-sonnet-4-6" />
              )}
              <button type="button" onClick={fetchModels} title="Load available models" className="px-2 border border-border rounded bg-secondary hover:bg-accent text-xs">
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          </Field>
        </div>

        <Field label="API Key *">
          <input value={form.apiKey} onChange={(e) => set('apiKey', e.target.value)} type="password" required className="input" placeholder="Encrypted at rest" />
        </Field>

        <Field label="System Prompt">
          <textarea value={form.systemPrompt} onChange={(e) => set('systemPrompt', e.target.value)} rows={4} className="input font-mono text-xs" placeholder="You are a helpful business AI agent..." />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Temperature">
            <input type="number" min={0} max={2} step={0.1} value={form.temperature} onChange={(e) => set('temperature', parseFloat(e.target.value))} className="input" />
          </Field>
          <Field label="Max Tokens">
            <input type="number" value={form.maxTokensPerTurn} onChange={(e) => set('maxTokensPerTurn', parseInt(e.target.value))} className="input" />
          </Field>
          <Field label="Max Turns">
            <input type="number" value={form.maxTurns} onChange={(e) => set('maxTurns', parseInt(e.target.value))} className="input" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Job Title">
            <input value={form.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} className="input" placeholder="e.g. Senior Developer" />
          </Field>
          <Field label="Department">
            <input value={form.department} onChange={(e) => set('department', e.target.value)} className="input" placeholder="e.g. Engineering" />
          </Field>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => router.back()} className="px-4 py-2 text-sm border border-border rounded-md hover:bg-secondary">
            Cancel
          </button>
          <button type="submit" disabled={createMutation.isPending} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50">
            {createMutation.isPending ? 'Registering...' : 'Register Agent'}
          </button>
        </div>
      </form>

      <style>{`.input { @apply w-full bg-secondary border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring; }`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}
