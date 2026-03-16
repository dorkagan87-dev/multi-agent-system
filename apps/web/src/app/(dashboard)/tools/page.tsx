'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api-client';
import { Wrench, Plus, Trash2, X, Lock, Code2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import toast from 'react-hot-toast';

const BUILTIN_ICONS: Record<string, string> = {
  web_search: '🔍',
  code_execution: '💻',
  http_request: '🌐',
  request_hire: '👤',
};

function NewToolModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', description: '', inputSchema: '{}' });
  const [schemaError, setSchemaError] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: any) => apiClient.post('/tools', data),
    onSuccess: () => {
      toast.success('Tool created');
      qc.invalidateQueries({ queryKey: ['tools'] });
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed to create tool'),
  });

  const handleSubmit = () => {
    let parsedSchema: Record<string, unknown> = {};
    try {
      parsedSchema = JSON.parse(form.inputSchema);
      setSchemaError('');
    } catch {
      setSchemaError('Invalid JSON schema');
      return;
    }
    createMutation.mutate({ name: form.name, description: form.description, inputSchema: parsedSchema });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-lg space-y-4 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2"><Plus className="w-4 h-4 text-primary" /> New Custom Tool</h3>
          <button onClick={onClose} className="p-1.5 rounded border border-border text-muted-foreground hover:bg-secondary"><X className="w-3.5 h-3.5" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Tool Name <span className="text-muted-foreground">(lowercase, underscores)</span></label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))}
              placeholder="e.g. send_slack_message"
              className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              placeholder="What does this tool do?"
              className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Input Schema (JSON Schema)</label>
            <textarea
              value={form.inputSchema}
              onChange={(e) => setForm((f) => ({ ...f, inputSchema: e.target.value }))}
              rows={5}
              placeholder='{"type":"object","properties":{"message":{"type":"string"}},"required":["message"]}'
              className={cn(
                'w-full bg-secondary border rounded px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-none',
                schemaError ? 'border-red-500' : 'border-border',
              )}
            />
            {schemaError && <p className="text-xs text-red-400 mt-1">{schemaError}</p>}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-border rounded-lg hover:bg-secondary">Cancel</button>
          <button
            disabled={!form.name || !form.description || createMutation.isPending}
            onClick={handleSubmit}
            className="flex-1 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Tool'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ToolsPage() {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);

  const { data: tools = [], isLoading } = useQuery({
    queryKey: ['tools'],
    queryFn: () => apiClient.get('/tools').then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/tools/${id}`),
    onSuccess: () => { toast.success('Tool deleted'); qc.invalidateQueries({ queryKey: ['tools'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Cannot delete built-in tool'),
  });

  const builtinTools = tools.filter((t: any) => t.isBuiltin);
  const customTools = tools.filter((t: any) => !t.isBuiltin);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2"><Wrench className="w-4 h-4 text-primary" /> Tool Registry</h2>
          <p className="text-xs text-muted-foreground mt-1">Tools agents can use during task execution. Grant tools to agents from the agent detail page.</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" /> New Tool
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading tools...</div>
      ) : (
        <>
          {/* Built-in tools */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Lock className="w-3 h-3" /> Built-in Tools ({builtinTools.length})
            </h3>
            {builtinTools.length === 0 ? (
              <p className="text-xs text-muted-foreground">No built-in tools seeded yet. Run <code className="bg-secondary px-1 rounded">pnpm db:seed</code>.</p>
            ) : (
              <div className="grid gap-2">
                {builtinTools.map((tool: any) => (
                  <div key={tool.id} className="bg-card border border-border rounded-lg p-3 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-base flex-shrink-0">
                      {BUILTIN_ICONS[tool.name] ?? '🔧'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-mono font-medium">{tool.name}</p>
                        <span className="text-xs bg-primary/10 text-primary px-1.5 rounded">built-in</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{tool.description}</p>
                    </div>
                    <Lock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Custom tools */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Code2 className="w-3 h-3" /> Custom Tools ({customTools.length})
            </h3>
            {customTools.length === 0 ? (
              <div className="border border-dashed border-border rounded-lg p-8 text-center text-muted-foreground">
                <Wrench className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">No custom tools yet</p>
                <p className="text-xs mt-1">Create custom tools to extend your agents' capabilities</p>
              </div>
            ) : (
              <div className="grid gap-2">
                {customTools.map((tool: any) => (
                  <div key={tool.id} className="bg-card border border-border rounded-lg p-3 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-base flex-shrink-0">🔧</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono font-medium">{tool.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{tool.description}</p>
                      {tool.inputSchema && Object.keys(tool.inputSchema).length > 0 && (
                        <details className="mt-1.5">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Input schema</summary>
                          <pre className="text-xs font-mono bg-secondary rounded p-2 mt-1 overflow-x-auto">{JSON.stringify(tool.inputSchema, null, 2)}</pre>
                        </details>
                      )}
                    </div>
                    <button
                      onClick={() => { if (confirm(`Delete tool "${tool.name}"?`)) deleteMutation.mutate(tool.id); }}
                      className="p-1.5 rounded border border-border text-red-400 hover:bg-red-400/10 flex-shrink-0"
                      title="Delete tool"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {showNew && <NewToolModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
