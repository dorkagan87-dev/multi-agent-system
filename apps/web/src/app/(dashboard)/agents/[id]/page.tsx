'use client';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../../lib/api-client';
import Link from 'next/link';
import {
  ArrowLeft, Bot, Power, Trash2, Brain, Wrench, Activity,
  CheckCircle2, XCircle, Loader2, Clock, Plus, X, ExternalLink,
  Search, Tag, Globe, FolderOpen,
} from 'lucide-react';
import { cn, STATUS_COLORS, PROVIDER_ICONS } from '../../../../lib/utils';
import toast from 'react-hot-toast';
import { useState } from 'react';

const LEVEL_COLOR: Record<string, string> = {
  llm_turn: 'text-foreground',
  tool_call: 'text-blue-400',
  tool_result: 'text-purple-400',
  info: 'text-green-400',
  error: 'text-red-400',
};

const EXEC_STATUS_ICON: Record<string, React.ReactNode> = {
  RUNNING: <Loader2 className="w-3.5 h-3.5 animate-spin text-yellow-400" />,
  COMPLETED: <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />,
  FAILED: <XCircle className="w-3.5 h-3.5 text-red-400" />,
  CANCELLED: <XCircle className="w-3.5 h-3.5 text-muted-foreground" />,
};

function ExecutionCard({ exec }: { exec: any }) {
  return (
    <div className="border border-border rounded-lg overflow-hidden flex items-center gap-3 px-4 py-3 hover:bg-secondary/50">
      {EXEC_STATUS_ICON[exec.status] ?? <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">Task: {exec.task?.title ?? exec.taskId.slice(0, 16)}…</p>
        <p className="text-xs text-muted-foreground">
          {new Date(exec.startedAt ?? exec.createdAt).toLocaleString()} · {exec.turns} turns
        </p>
      </div>
      <div className="text-xs text-muted-foreground hidden sm:block flex-shrink-0">
        ${exec.totalCost?.toFixed(4) ?? '—'}
      </div>
      <Link
        href={`/traces/${exec.id}`}
        className="flex items-center gap-1 text-xs text-primary hover:underline flex-shrink-0 ml-2"
        title="View trace"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Trace</span>
      </Link>
    </div>
  );
}

function ToolGrantsPanel({ agentId, toolGrants }: { agentId: string; toolGrants: any[] }) {
  const qc = useQueryClient();

  const { data: allTools = [] } = useQuery({
    queryKey: ['tools'],
    queryFn: () => apiClient.get('/tools').then((r) => r.data),
  });

  const grantMutation = useMutation({
    mutationFn: (toolId: string) => apiClient.post(`/tools/${toolId}/grant/${agentId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agent', agentId] }); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Grant failed'),
  });

  const revokeMutation = useMutation({
    mutationFn: (toolId: string) => apiClient.delete(`/tools/${toolId}/grant/${agentId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agent', agentId] }); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Revoke failed'),
  });

  const grantedIds = new Set(toolGrants.map((g: any) => g.toolId ?? g.tool?.id));
  const ungrantedTools = allTools.filter((t: any) => !grantedIds.has(t.id));

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-medium">Tool Grants</h3>

      {toolGrants.length === 0 && ungrantedTools.length === 0 && (
        <p className="text-xs text-muted-foreground">No tools available. Add tools in the <a href="/tools" className="text-primary hover:underline">Tool Registry</a>.</p>
      )}

      {/* Granted tools */}
      {toolGrants.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {toolGrants.map((g: any) => {
            const toolId = g.toolId ?? g.tool?.id;
            return (
              <span key={g.id} className="flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-1 rounded-full">
                {g.tool?.name ?? toolId}
                <button
                  onClick={() => revokeMutation.mutate(toolId)}
                  disabled={revokeMutation.isPending}
                  className="hover:text-red-400 ml-0.5"
                  title="Revoke"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Grant additional tools */}
      {ungrantedTools.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Grant access to more tools:</p>
          <div className="flex flex-wrap gap-1.5">
            {ungrantedTools.map((tool: any) => (
              <button
                key={tool.id}
                onClick={() => grantMutation.mutate(tool.id)}
                disabled={grantMutation.isPending}
                className="flex items-center gap-1 text-xs border border-dashed border-border text-muted-foreground px-2 py-1 rounded-full hover:border-primary hover:text-primary disabled:opacity-50"
              >
                <Plus className="w-3 h-3" /> {tool.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const SOURCE_LABEL: Record<string, { label: string; cls: string }> = {
  agent: { label: 'Agent', cls: 'bg-violet-500/20 text-violet-300' },
  auto_extract: { label: 'Auto', cls: 'bg-emerald-500/20 text-emerald-300' },
  human: { label: 'Human', cls: 'bg-sky-500/20 text-sky-300' },
};

function MemoryTab({ agentId, memory }: { agentId: string; memory: any[] }) {
  const [search, setSearch] = useState('');
  const filtered = search.trim()
    ? memory.filter((m) => {
        const q = search.toLowerCase();
        return (
          m.key.toLowerCase().includes(q) ||
          (m.content ?? '').toLowerCase().includes(q) ||
          (m.tags ?? []).some((t: string) => t.toLowerCase().includes(q))
        );
      })
    : memory;

  const globalCount = memory.filter((m) => m.scope === 'AGENT_GLOBAL').length;
  const projectCount = memory.filter((m) => m.scope === 'PROJECT').length;

  if (memory.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Brain className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No memory entries yet</p>
        <p className="text-xs mt-1 max-w-xs mx-auto">
          Memory builds automatically as tasks complete. Agents can also call{' '}
          <code className="bg-secondary px-1 rounded">store_memory</code> to save key findings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stats + search */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> {globalCount} global</span>
          <span className="flex items-center gap-1"><FolderOpen className="w-3 h-3" /> {projectCount} project</span>
        </div>
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search memory…"
            className="w-full bg-secondary border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-6">No memories match "{search}"</p>
      )}

      {filtered.map((m: any) => {
        const src = SOURCE_LABEL[m.source ?? 'human'];
        const isGlobal = m.scope === 'AGENT_GLOBAL';
        return (
          <div key={m.id} className="bg-card border border-border rounded-lg p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-xs text-primary font-semibold">{m.key}</span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {src && (
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', src.cls)}>
                    {src.label}
                  </span>
                )}
                <span className={cn(
                  'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded',
                  isGlobal ? 'bg-secondary text-muted-foreground' : 'bg-blue-500/10 text-blue-300',
                )}>
                  {isGlobal ? <Globe className="w-2.5 h-2.5" /> : <FolderOpen className="w-2.5 h-2.5" />}
                  {isGlobal ? 'Global' : 'Project'}
                </span>
              </div>
            </div>

            {m.content ? (
              <p className="text-xs text-foreground/80 leading-relaxed">{m.content}</p>
            ) : (
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                {typeof m.value === 'string' ? m.value : JSON.stringify(m.value, null, 2)}
              </pre>
            )}

            {m.tags?.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Tag className="w-3 h-3 text-muted-foreground" />
                {m.tags.map((t: string) => (
                  <span key={t} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">
                    {t}
                  </span>
                ))}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground">
              Updated {new Date(m.updatedAt).toLocaleString()}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'memory' | 'history'>('overview');

  const { data: agent, isLoading } = useQuery({
    queryKey: ['agent', id],
    queryFn: () => apiClient.get(`/agents/${id}`).then((r) => r.data),
    refetchInterval: 5000,
  });

  const { data: executions = [] } = useQuery({
    queryKey: ['agent-executions', id],
    queryFn: () => apiClient.get(`/agents/${id}/executions`).then((r) => r.data),
    enabled: activeTab === 'history',
  });

  const { data: memory = [] } = useQuery({
    queryKey: ['agent-memory', id],
    queryFn: () => apiClient.get(`/agents/${id}/memory`).then((r) => r.data),
    enabled: activeTab === 'memory',
  });

  const toggleMutation = useMutation({
    mutationFn: ({ enabled }: { enabled: boolean }) =>
      apiClient.post(`/agents/${id}/${enabled ? 'enable' : 'disable'}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agent', id] }); toast.success('Agent updated'); },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/agents/${id}`),
    onSuccess: () => { toast.success('Agent removed'); router.push('/agents'); },
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading...</div>;
  if (!agent) return <div className="text-sm text-muted-foreground">Agent not found.</div>;

  const status = agent.status.toLowerCase();
  const providerIcon = PROVIDER_ICONS?.[agent.provider?.toLowerCase()] ?? '🤖';

  const TABS = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'memory', label: 'Memory', icon: Brain },
    { id: 'history', label: 'Executions', icon: Wrench },
  ] as const;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/agents" className="text-muted-foreground hover:text-foreground mt-1">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-2xl flex-shrink-0">
              {agent.avatarUrl ? <img src={agent.avatarUrl} className="rounded-full w-full h-full object-cover" alt="" /> : providerIcon}
            </div>
            <div>
              <h1 className="text-xl font-bold">{agent.name}</h1>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <div className={cn('w-2 h-2 rounded-full flex-shrink-0', STATUS_COLORS[status] ?? 'bg-gray-400')} />
                <span className="text-xs text-muted-foreground capitalize">{status}</span>
                {agent.jobTitle && <><span className="text-xs text-muted-foreground">·</span><span className="text-xs text-muted-foreground">{agent.jobTitle}</span></>}
                {agent.department && <><span className="text-xs text-muted-foreground">·</span><span className="text-xs text-muted-foreground">{agent.department}</span></>}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => toggleMutation.mutate({ enabled: status === 'disabled' })}
            className={cn('p-2 rounded-lg border border-border hover:bg-secondary', status === 'disabled' ? 'text-green-400' : 'text-yellow-400')}
            title={status === 'disabled' ? 'Enable' : 'Disable'}
          >
            <Power className="w-4 h-4" />
          </button>
          <button
            onClick={() => { if (confirm('Permanently remove this agent?')) deleteMutation.mutate(); }}
            className="p-2 rounded-lg border border-border text-red-400 hover:bg-red-400/10"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {TABS.map(({ id: tid, label, icon: Icon }) => (
          <button key={tid} onClick={() => setActiveTab(tid as any)}
            className={cn('flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors',
              activeTab === tid ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Provider', value: agent.provider },
              { label: 'Model', value: agent.modelId },
              { label: 'Tasks Today', value: agent.currentTaskCount },
              { label: 'Tokens Today', value: agent.tokensUsedToday?.toLocaleString() ?? '0' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-card border border-border rounded-lg p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-semibold text-sm mt-0.5 truncate">{value}</p>
              </div>
            ))}
          </div>

          <div className="bg-card border border-border rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-medium">Configuration</h3>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div><span className="text-xs text-muted-foreground block">Temperature</span>{agent.temperature}</div>
              <div><span className="text-xs text-muted-foreground block">Max Tokens</span>{agent.maxTokensPerTurn}</div>
              <div><span className="text-xs text-muted-foreground block">Max Turns</span>{agent.maxTurns}</div>
            </div>
            {agent.systemPrompt && (
              <div>
                <span className="text-xs text-muted-foreground block mb-1">System Prompt</span>
                <pre className="text-xs bg-secondary rounded p-2 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono">{agent.systemPrompt}</pre>
              </div>
            )}
          </div>

          <ToolGrantsPanel agentId={id} toolGrants={agent.toolGrants ?? []} />
        </div>
      )}

      {/* Memory */}
      {activeTab === 'memory' && (
        <MemoryTab agentId={id} memory={memory} />
      )}

      {/* Execution History */}
      {activeTab === 'history' && (
        <div className="space-y-2">
          {executions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No executions yet</p>
            </div>
          ) : (
            executions.map((exec: any) => <ExecutionCard key={exec.id} exec={exec} />)
          )}
        </div>
      )}
    </div>
  );
}
