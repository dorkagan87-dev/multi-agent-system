'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { apiClient } from '../../../lib/api-client';
import { getSocket } from '../../../lib/socket';
import { cn, STATUS_COLORS, PROVIDER_ICONS } from '../../../lib/utils';
import { formatRelativeTime } from '../../../lib/utils';
import { MessageSquare, Activity, Users, Briefcase, Plus, UserPlus, Video, CheckCircle, X, Power, Trash2, Save, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

type AgentMessage = {
  fromAgentId: string;
  fromAgentName: string;
  toAgentId: string | null;
  projectId: string;
  message: string;
  timestamp: string;
  metadata?: { type?: string; meetingId?: string };
};

type HiringRequest = {
  id: string;
  role: string;
  department: string;
  skills: string[];
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
};

const DEPARTMENTS = ['All', 'Executive', 'Engineering', 'Marketing', 'Analytics', 'Finance', 'Legal', 'Design', 'Operations', 'Research'];

function HireApprovalModal({
  request,
  onClose,
  onApprove,
  onReject,
  isPending,
}: {
  request: HiringRequest;
  onClose: () => void;
  onApprove: (data: { apiKey: string; provider: string; modelId: string }) => void;
  onReject: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({ apiKey: '', provider: 'anthropic', modelId: 'claude-sonnet-4-6' });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-md space-y-4 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-primary" /> Hire: {request.role}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">{request.department} · {request.skills.join(', ')}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded border border-border text-muted-foreground hover:bg-secondary">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <p className="text-xs text-foreground/70 bg-secondary/50 rounded p-2">{request.reason}</p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Provider</label>
            <select
              value={form.provider}
              onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
              className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="google">Google</option>
              <option value="mistral">Mistral</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Model ID</label>
            <input
              value={form.modelId}
              onChange={(e) => setForm((f) => ({ ...f, modelId: e.target.value }))}
              placeholder="e.g. claude-sonnet-4-6"
              className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">API Key</label>
            <input
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
              placeholder="sk-ant-... / sk-... / AIza..."
              className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onReject}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-2 text-xs border border-red-500/40 text-red-400 rounded-lg hover:bg-red-500/10 disabled:opacity-50"
          >
            <XCircle className="w-3.5 h-3.5" /> Reject
          </button>
          <button onClick={onClose} className="flex-1 py-2 text-xs border border-border rounded-lg hover:bg-secondary">
            Cancel
          </button>
          <button
            disabled={!form.apiKey || !form.modelId || isPending}
            onClick={() => onApprove(form)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            <CheckCircle className="w-3.5 h-3.5" /> {isPending ? 'Hiring...' : 'Hire Agent'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AgentEditModal({ agent, onClose, onDeleted }: { agent: any; onClose: () => void; onDeleted: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: agent.name ?? '',
    jobTitle: agent.jobTitle ?? '',
    department: agent.department ?? '',
    systemPrompt: agent.systemPrompt ?? '',
    temperature: agent.temperature ?? 0.7,
    maxTokensPerTurn: agent.maxTokensPerTurn ?? 4096,
    maxTurns: agent.maxTurns ?? 20,
  });
  const [engineOpen, setEngineOpen] = useState(false);
  const [engine, setEngine] = useState({
    provider: agent.provider?.toLowerCase() ?? 'openai',
    modelId: agent.modelId ?? '',
    apiKey: '',
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.patch(`/agents/${agent.id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Agent updated');
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Update failed'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ enabled }: { enabled: boolean }) =>
      apiClient.post(`/agents/${agent.id}/${enabled ? 'enable' : 'disable'}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agents'] }); toast.success('Agent updated'); },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/agents/${agent.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agents'] }); toast.success('Agent removed'); onDeleted(); },
    onError: () => toast.error('Failed to remove agent'),
  });

  const status = agent.status?.toLowerCase();
  const providerIcon = PROVIDER_ICONS?.[agent.provider?.toLowerCase()] ?? '🤖';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Modal header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-xl flex-shrink-0">
              {agent.avatarUrl ? <img src={agent.avatarUrl} className="rounded-full w-full h-full object-cover" alt="" /> : providerIcon}
            </div>
            <div>
              <p className="font-semibold text-sm">{agent.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={cn('w-2 h-2 rounded-full', STATUS_COLORS[status] ?? 'bg-gray-400')} />
                <span className="text-xs text-muted-foreground capitalize">{status}</span>
                <span className="text-xs text-muted-foreground">· {agent.provider} / {agent.modelId}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => toggleMutation.mutate({ enabled: status === 'disabled' })}
              className={cn('p-1.5 rounded border border-border hover:bg-secondary', status === 'disabled' ? 'text-green-400' : 'text-yellow-400')}
              title={status === 'disabled' ? 'Enable' : 'Disable'}
            >
              <Power className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { if (confirm(`Remove ${agent.name}?`)) deleteMutation.mutate(); }}
              className="p-1.5 rounded border border-border text-red-400 hover:bg-red-400/10"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded border border-border text-muted-foreground hover:bg-secondary ml-1">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 p-4 border-b border-border">
          {[
            { label: 'Tasks today', value: agent.currentTaskCount ?? 0 },
            { label: 'Tokens today', value: (agent.tokensUsedToday ?? 0).toLocaleString() },
            { label: 'Capabilities', value: agent.capabilities?.length ?? 0 },
          ].map(({ label, value }) => (
            <div key={label} className="bg-secondary/50 rounded-lg p-2 text-center">
              <p className="text-xs font-semibold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* Edit form */}
        <div className="p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Edit Agent</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Job Title</label>
              <input
                value={form.jobTitle}
                onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))}
                className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Department</label>
            <select
              value={form.department}
              onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
              className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">None</option>
              {DEPARTMENTS.filter((d) => d !== 'All').map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">System Prompt</label>
            <textarea
              value={form.systemPrompt}
              onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
              rows={5}
              className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Temperature</label>
              <input
                type="number" min="0" max="2" step="0.05"
                value={form.temperature}
                onChange={(e) => setForm((f) => ({ ...f, temperature: parseFloat(e.target.value) }))}
                className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Max Tokens</label>
              <input
                type="number" min="256"
                value={form.maxTokensPerTurn}
                onChange={(e) => setForm((f) => ({ ...f, maxTokensPerTurn: parseInt(e.target.value) }))}
                className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Max Turns</label>
              <input
                type="number" min="1" max="100"
                value={form.maxTurns}
                onChange={(e) => setForm((f) => ({ ...f, maxTurns: parseInt(e.target.value) }))}
                className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Replace AI Engine */}
          <div className="border border-border rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setEngineOpen((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-secondary/40 hover:bg-secondary/70 text-sm font-medium"
            >
              <span>Replace AI Engine</span>
              <span className="text-xs text-muted-foreground">{agent.provider} / {agent.modelId}</span>
            </button>
            {engineOpen && (
              <div className="p-3 space-y-3 border-t border-border">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Provider</label>
                  <select
                    value={engine.provider}
                    onChange={(e) => setEngine((v) => ({ ...v, provider: e.target.value }))}
                    className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="google">Google</option>
                    <option value="mistral">Mistral</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Model ID</label>
                  <input
                    value={engine.modelId}
                    onChange={(e) => setEngine((v) => ({ ...v, modelId: e.target.value }))}
                    placeholder={
                      engine.provider === 'openai' ? 'e.g. gpt-4o' :
                      engine.provider === 'anthropic' ? 'e.g. claude-sonnet-4-6' :
                      engine.provider === 'google' ? 'e.g. gemini-1.5-pro' : 'model id'
                    }
                    className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">New API Key</label>
                  <input
                    type="password"
                    value={engine.apiKey}
                    onChange={(e) => setEngine((v) => ({ ...v, apiKey: e.target.value }))}
                    placeholder="sk-... (leave blank to keep current)"
                    className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2 text-sm border border-border rounded-lg hover:bg-secondary">
              Cancel
            </button>
            <button
              disabled={updateMutation.isPending}
              onClick={() => {
                const payload: Record<string, unknown> = { ...form };
                if (engineOpen) {
                  if (engine.provider) payload.provider = engine.provider.toUpperCase();
                  if (engine.modelId) payload.modelId = engine.modelId;
                  if (engine.apiKey) payload.apiKey = engine.apiKey;
                }
                updateMutation.mutate(payload);
              }}
              className="flex-1 flex items-center justify-center gap-2 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OfficePage() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const token = (session as any)?.accessToken;

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => apiClient.get('/agents').then((r) => r.data),
    refetchInterval: 8_000,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiClient.get('/projects').then((r) => r.data),
  });

  const { data: feed = [] } = useQuery({
    queryKey: ['company-feed'],
    queryFn: () => apiClient.get('/company/feed?limit=200').then((r) => r.data),
    refetchInterval: 15_000,
  });

  const { data: hiringRequests = [] } = useQuery({
    queryKey: ['hiring-requests'],
    queryFn: () => apiClient.get('/company/hiring').then((r) => r.data),
    refetchInterval: 30_000,
  });

  const [liveMessages, setLiveMessages] = useState<AgentMessage[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, string>>({});
  const [activeDept, setActiveDept] = useState('All');
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [meetingTopic, setMeetingTopic] = useState('');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'feed' | 'floor' | 'hiring'>('feed');
  const [viewAgent, setViewAgent] = useState<any>(null);
  const [hireTarget, setHireTarget] = useState<HiringRequest | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  // Real-time socket
  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    socket.emit('subscribe:global');

    socket.on('agent:message', (payload: AgentMessage) => {
      setLiveMessages((prev) => [...prev.slice(-500), payload]);
    });
    socket.on('agent:status_changed', ({ agentId, status }: { agentId: string; status: string }) => {
      setAgentStatuses((prev) => ({ ...prev, [agentId]: status }));
      qc.invalidateQueries({ queryKey: ['agents'] });
    });
    socket.on('company:hiring_request', () => {
      qc.invalidateQueries({ queryKey: ['hiring-requests'] });
    });

    return () => {
      socket.off('agent:message');
      socket.off('agent:status_changed');
      socket.off('company:hiring_request');
    };
  }, [token]);

  // Auto-scroll
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [liveMessages]);

  const meetingMutation = useMutation({
    mutationFn: (data: { projectId: string; topic: string; agentIds: string[]; rounds: number }) =>
      apiClient.post('/company/meetings', data),
    onSuccess: () => { toast.success('Meeting started!'); setShowMeetingModal(false); },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Meeting failed'),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string; apiKey: string; provider: string; modelId: string }) =>
      apiClient.post(`/company/hiring/${id}/approve`, body),
    onSuccess: () => {
      toast.success('Agent hired!');
      qc.invalidateQueries({ queryKey: ['hiring-requests'] });
      qc.invalidateQueries({ queryKey: ['agents'] });
      setHireTarget(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Hire failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/company/hiring/${id}/reject`),
    onSuccess: () => {
      toast.success('Hiring request rejected');
      qc.invalidateQueries({ queryKey: ['hiring-requests'] });
      setHireTarget(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Reject failed'),
  });

  const filteredAgents = activeDept === 'All'
    ? agents
    : agents.filter((a: any) => a.department === activeDept || a.jobTitle?.includes(activeDept));

  const allMessages = [
    ...feed.map((f: any) => ({
      fromAgentId: f.fromAgent?.id,
      fromAgentName: f.fromAgent?.name ?? 'Agent',
      projectId: f.projectId,
      message: f.content,
      timestamp: f.timestamp,
      metadata: f.metadata,
    })),
    ...liveMessages,
  ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()).slice(-200);

  const pendingHiring = (hiringRequests as HiringRequest[]).filter((h) => h.status === 'pending');

  return (
    <div className="flex gap-4 h-[calc(100vh-9rem)]">
      {/* ── Left Panel: Agent Floor ──────────────────────────────────── */}
      <div className="w-64 flex-shrink-0 flex flex-col gap-3">
        {/* Department filter */}
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Departments</p>
          <div className="flex flex-wrap gap-1">
            {DEPARTMENTS.filter((d) => d === 'All' || agents.some((a: any) => a.department === d || a.jobTitle?.includes(d))).map((d) => (
              <button
                key={d}
                onClick={() => setActiveDept(d)}
                className={cn('text-xs px-2 py-0.5 rounded', activeDept === d ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground')}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Agent cards */}
        <div className="flex-1 overflow-y-auto space-y-2">
          <p className="text-xs text-muted-foreground px-1">{filteredAgents.length} agents</p>
          {filteredAgents.map((agent: any) => {
            const status = (agentStatuses[agent.id] ?? agent.status).toLowerCase();
            const isBusy = status === 'busy';
            const isSelected = selectedAgentIds.includes(agent.id);
            return (
              <div key={agent.id}
                onClick={() => setViewAgent(agent)}
                className="bg-card border border-border rounded-lg p-2.5 cursor-pointer transition-all hover:border-primary/40"
              >
                <div className="flex items-center gap-2">
                  <div className="relative flex-shrink-0">
                    <div className={cn('w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-base', isBusy && 'ring-2 ring-yellow-400/60')}>
                      {PROVIDER_ICONS[agent.provider?.toLowerCase()] ?? '🤖'}
                    </div>
                    <span className={cn(
                      'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-card',
                      STATUS_COLORS[status] ?? 'bg-gray-400',
                      isBusy && 'status-busy',
                    )} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{agent.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{agent.jobTitle ?? agent.modelId}</p>
                  </div>
                  {/* Meeting select checkbox */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    title="Select for meeting"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      e.stopPropagation();
                      setSelectedAgentIds((prev) =>
                        e.target.checked ? [...prev, agent.id] : prev.filter((id) => id !== agent.id)
                      );
                    }}
                    className="w-3.5 h-3.5 rounded accent-primary flex-shrink-0"
                  />
                </div>
                {isBusy && (
                  <div className="mt-1.5 flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-yellow-400 animate-pulse" />
                    <span className="w-1 h-1 rounded-full bg-yellow-400 animate-pulse delay-75" />
                    <span className="w-1 h-1 rounded-full bg-yellow-400 animate-pulse delay-150" />
                    <span className="text-xs text-yellow-400 ml-0.5">working</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Meeting button */}
        {selectedAgentIds.length >= 2 && (
          <button
            onClick={() => setShowMeetingModal(true)}
            className="flex items-center justify-center gap-2 w-full bg-primary text-primary-foreground py-2 rounded-lg text-xs font-medium hover:bg-primary/90"
          >
            <Video className="w-3.5 h-3.5" /> Call Meeting ({selectedAgentIds.length})
          </button>
        )}
      </div>

      {/* ── Right Panel: Tabs ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-card border border-border rounded-lg overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-border">
          {[
            { id: 'feed', label: 'Company Feed', icon: MessageSquare },
            { id: 'floor', label: 'Office Map', icon: Users },
            { id: 'hiring', label: `Hiring ${pendingHiring.length > 0 ? `(${pendingHiring.length})` : ''}`, icon: UserPlus },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors',
                activeTab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1.5 pr-4 text-xs text-muted-foreground">
            <Activity className="w-3 h-3 text-green-400" /> Live
          </div>
        </div>

        {/* Company Feed */}
        {activeTab === 'feed' && (
          <div ref={feedRef} className="flex-1 overflow-y-auto p-4 space-y-2.5 log-stream">
            {allMessages.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm">Start a project — the CEO will plan it and agents will start working</p>
              </div>
            ) : (
              allMessages.map((msg, i) => {
                const isMeeting = msg.metadata?.type === 'meeting';
                const isAnnouncement = msg.metadata?.type === 'company_announcement';
                return (
                  <div key={i} className={cn('flex gap-2.5 rounded-lg px-2 py-1.5', isAnnouncement && 'bg-primary/5 border border-primary/20')}>
                    <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-sm flex-shrink-0 mt-0.5">
                      {PROVIDER_ICONS['anthropic'] ?? '🤖'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-primary">{msg.fromAgentName}</span>
                        {isMeeting && <span className="text-xs bg-blue-500/20 text-blue-400 px-1 rounded">meeting</span>}
                        {isAnnouncement && <span className="text-xs bg-primary/20 text-primary px-1 rounded">announcement</span>}
                        <span className="text-xs text-muted-foreground ml-auto">{formatRelativeTime(msg.timestamp)}</span>
                      </div>
                      <p className="text-xs text-foreground/80 mt-0.5 leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Office Map — visual department grid */}
        {activeTab === 'floor' && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
              {DEPARTMENTS.filter((d) => d !== 'All').map((dept) => {
                const deptAgents = agents.filter((a: any) => a.department === dept || a.jobTitle?.includes(dept));
                if (deptAgents.length === 0) return null;
                return (
                  <div key={dept} className="bg-background border border-border rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                      <p className="text-xs font-semibold text-muted-foreground">{dept}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {deptAgents.map((a: any) => {
                        const status = (agentStatuses[a.id] ?? a.status).toLowerCase();
                        return (
                          <div key={a.id} className="flex flex-col items-center gap-1" title={a.name}>
                            <div className={cn(
                              'w-10 h-10 rounded-full bg-card border-2 flex items-center justify-center text-lg',
                              status === 'busy' ? 'border-yellow-400 shadow-lg shadow-yellow-400/20' : 'border-border',
                            )}>
                              {PROVIDER_ICONS[a.provider?.toLowerCase()] ?? '🤖'}
                            </div>
                            <p className="text-xs text-center text-muted-foreground max-w-16 truncate">{a.name}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {agents.filter((a: any) => !a.department).length > 0 && (
                <div className="bg-background border border-dashed border-border rounded-xl p-3">
                  <p className="text-xs text-muted-foreground mb-2">Unassigned</p>
                  <div className="flex flex-wrap gap-2">
                    {agents.filter((a: any) => !a.department).map((a: any) => (
                      <div key={a.id} className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center text-base" title={a.name}>
                        {PROVIDER_ICONS[a.provider?.toLowerCase()] ?? '🤖'}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Hiring Requests */}
        {activeTab === 'hiring' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {(hiringRequests as HiringRequest[]).length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <UserPlus className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm">No hiring requests yet</p>
                <p className="text-xs mt-1">Agents will request new hires when they need help they can't provide</p>
              </div>
            ) : (
              (hiringRequests as HiringRequest[]).map((req) => (
                <div key={req.id} className={cn('bg-background border rounded-lg p-3', req.status === 'pending' && 'border-yellow-500/40')}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{req.role}</p>
                        <span className="text-xs bg-secondary px-2 py-0.5 rounded">{req.department}</span>
                        <span className={cn('text-xs px-2 py-0.5 rounded capitalize',
                          req.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                          req.status === 'approved' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        )}>
                          {req.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{req.reason}</p>
                      {req.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {req.skills.map((s) => <span key={s} className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{s}</span>)}
                        </div>
                      )}
                    </div>
                    {req.status === 'pending' && (
                      <button
                        onClick={() => setHireTarget(req)}
                        className="flex items-center gap-1 text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded hover:bg-green-500/30"
                      >
                        <CheckCircle className="w-3 h-3" /> Review
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Hire Approval Modal ────────────────────────────────────────── */}
      {hireTarget && (
        <HireApprovalModal
          request={hireTarget}
          onClose={() => setHireTarget(null)}
          onApprove={(data) => approveMutation.mutate({ id: hireTarget.id, ...data })}
          onReject={() => rejectMutation.mutate(hireTarget.id)}
          isPending={approveMutation.isPending || rejectMutation.isPending}
        />
      )}

      {/* ── Agent Edit Modal ───────────────────────────────────────────── */}
      {viewAgent && (
        <AgentEditModal
          agent={viewAgent}
          onClose={() => setViewAgent(null)}
          onDeleted={() => setViewAgent(null)}
        />
      )}

      {/* ── Meeting Modal ──────────────────────────────────────────────── */}
      {showMeetingModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-5 w-full max-w-md space-y-4">
            <h3 className="font-semibold flex items-center gap-2"><Video className="w-4 h-4 text-primary" /> Call a Meeting</h3>

            <div>
              <label className="block text-xs text-muted-foreground mb-1">Meeting Topic *</label>
              <input value={meetingTopic} onChange={(e) => setMeetingTopic(e.target.value)}
                className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm"
                placeholder="e.g. Q2 marketing strategy review" />
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-1">Participants ({selectedAgentIds.length} selected)</p>
              <div className="flex flex-wrap gap-1">
                {agents.filter((a: any) => selectedAgentIds.includes(a.id)).map((a: any) => (
                  <span key={a.id} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded flex items-center gap-1">
                    {a.name}
                    <button onClick={() => setSelectedAgentIds((p) => p.filter((id) => id !== a.id))}>×</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground mb-1">Project (optional)</label>
              <select className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm" id="meetingProject">
                <option value="">General (no project)</option>
                {projects.filter((p: any) => p.status === 'ACTIVE').map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowMeetingModal(false)} className="flex-1 py-2 text-sm border border-border rounded-lg hover:bg-secondary">
                Cancel
              </button>
              <button
                disabled={!meetingTopic || selectedAgentIds.length < 2 || meetingMutation.isPending}
                onClick={() => {
                  const projectSel = (document.getElementById('meetingProject') as HTMLSelectElement)?.value;
                  meetingMutation.mutate({
                    topic: meetingTopic,
                    agentIds: selectedAgentIds,
                    rounds: 2,
                    projectId: projectSel || (projects[0]?.id ?? ''),
                  });
                }}
                className="flex-1 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {meetingMutation.isPending ? 'Meeting in progress...' : 'Start Meeting'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
