'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api-client';
import { cn, formatRelativeTime, PROVIDER_ICONS } from '../../../lib/utils';
import toast from 'react-hot-toast';
import {
  Zap, TrendingUp, AlertTriangle, CheckCircle2, XCircle,
  BarChart3, RefreshCw, ChevronDown, ChevronUp, Clock,
  ArrowRight, Settings2,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface OptimizationIssue {
  type: string;
  severity: 'low' | 'medium' | 'high';
  detail: string;
}

interface AgentMetrics {
  agentId: string;
  agentName: string;
  provider: string;
  modelId: string;
  department: string | null;
  jobTitle: string | null;
  totalTasks: number;
  successRate: number;
  retryRate: number;
  avgTurns: number;
  avgCost: number;
  avgTokens: number;
  maxTurns: number;
  issues: OptimizationIssue[];
}

interface Recommendation {
  id: string;
  type: string;
  reason: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  impact: 'low' | 'medium' | 'high';
  status: 'pending' | 'applied' | 'rejected';
  appliedAt: string | null;
  agent: { id: string; name: string; jobTitle: string | null; department: string | null; provider: string };
}

interface OptimizationRun {
  id: string;
  status: string;
  trigger: string;
  agentsAnalyzed: number;
  recommendationCount: number;
  appliedCount: number;
  summary: string | null;
  createdAt: string;
  completedAt: string | null;
  recommendations: Recommendation[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const SEVERITY_COLORS = {
  high: 'text-red-400 bg-red-400/10 border-red-400/20',
  medium: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  low: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
};

const IMPACT_COLORS = {
  high: 'bg-red-400/15 text-red-400',
  medium: 'bg-yellow-400/15 text-yellow-400',
  low: 'bg-blue-400/15 text-blue-400',
};

const REC_TYPE_LABELS: Record<string, string> = {
  prompt_update: 'Prompt Rewrite',
  temperature: 'Temperature',
  max_turns: 'Max Turns',
  max_tokens: 'Token Limit',
};

function SuccessBar({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn('text-xs font-mono', pct >= 70 ? 'text-green-400' : pct >= 40 ? 'text-yellow-400' : 'text-red-400')}>
        {pct}%
      </span>
    </div>
  );
}

// ── Agent metrics card ────────────────────────────────────────────────────────

function AgentMetricsCard({ m }: { m: AgentMetrics }) {
  const [open, setOpen] = useState(false);
  const icon = PROVIDER_ICONS[m.provider?.toLowerCase()] ?? '🤖';

  return (
    <div className={cn(
      'bg-card border rounded-xl overflow-hidden transition-colors',
      m.issues.length > 0 ? 'border-yellow-400/30' : 'border-border',
    )}>
      <button
        className="w-full px-4 py-3 flex items-center gap-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{m.agentName}</span>
            {m.issues.length > 0 && (
              <span className="text-xs bg-yellow-400/15 text-yellow-400 px-1.5 py-0.5 rounded-full">
                {m.issues.length} issue{m.issues.length > 1 ? 's' : ''}
              </span>
            )}
            {m.issues.length === 0 && m.totalTasks > 0 && (
              <span className="text-xs bg-green-400/15 text-green-400 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Healthy
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{m.jobTitle ?? 'Agent'} · {m.totalTasks} tasks (14d)</p>
        </div>

        {/* Mini stats */}
        <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground mr-2">
          <div className="w-20">
            <SuccessBar rate={m.successRate} />
          </div>
          <span>${m.avgCost.toFixed(3)}/task</span>
        </div>

        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          {/* Stats grid */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {[
              { label: 'Success', value: `${Math.round(m.successRate * 100)}%` },
              { label: 'Retry', value: `${Math.round(m.retryRate * 100)}%` },
              { label: 'Avg Turns', value: `${m.avgTurns.toFixed(1)}/${m.maxTurns}` },
              { label: 'Avg Cost', value: `$${m.avgCost.toFixed(3)}` },
              { label: 'Avg Tokens', value: Math.round(m.avgTokens).toLocaleString() },
            ].map(({ label, value }) => (
              <div key={label} className="bg-secondary/50 rounded-lg p-2 text-center">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-mono font-semibold">{value}</p>
              </div>
            ))}
          </div>

          {/* Issues */}
          {m.issues.length > 0 && (
            <div className="space-y-1.5">
              {m.issues.map((issue, i) => (
                <div key={i} className={cn('flex items-start gap-2 text-xs border rounded-lg px-3 py-2', SEVERITY_COLORS[issue.severity])}>
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>{issue.detail}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Recommendation card ───────────────────────────────────────────────────────

function RecCard({ rec, onApply, onReject }: {
  rec: Recommendation;
  onApply: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const [showDiff, setShowDiff] = useState(false);
  const icon = PROVIDER_ICONS[rec.agent.provider?.toLowerCase()] ?? '🤖';
  const isPromptUpdate = rec.type === 'prompt_update';

  return (
    <div className={cn(
      'bg-card border rounded-xl p-4 space-y-3',
      rec.status === 'applied' ? 'border-green-400/30 opacity-60' :
      rec.status === 'rejected' ? 'border-border opacity-40' :
      'border-border',
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">{icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{rec.agent.name}</span>
              <span className="text-xs bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">
                {REC_TYPE_LABELS[rec.type] ?? rec.type}
              </span>
              <span className={cn('text-xs px-1.5 py-0.5 rounded-full', IMPACT_COLORS[rec.impact])}>
                {rec.impact} impact
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{rec.agent.jobTitle ?? 'Agent'}</p>
          </div>
        </div>

        {rec.status === 'pending' && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => onReject(rec.id)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
              title="Reject"
            >
              <XCircle className="w-4 h-4" />
            </button>
            <button
              onClick={() => onApply(rec.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              <Zap className="w-3.5 h-3.5" /> Apply
            </button>
          </div>
        )}

        {rec.status === 'applied' && (
          <span className="text-xs text-green-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Applied
          </span>
        )}
        {rec.status === 'rejected' && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5" /> Rejected
          </span>
        )}
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed">{rec.reason}</p>

      {/* Diff view */}
      <button
        onClick={() => setShowDiff((v) => !v)}
        className="text-xs text-primary hover:underline flex items-center gap-1"
      >
        {showDiff ? 'Hide' : 'Show'} changes
        <ArrowRight className={cn('w-3 h-3 transition-transform', showDiff && 'rotate-90')} />
      </button>

      {showDiff && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
            <p className="text-xs text-red-400 font-medium mb-2">Before</p>
            {isPromptUpdate ? (
              <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6 font-mono">
                {(rec.before.systemPrompt as string) ?? '(no prompt)'}
              </p>
            ) : (
              <pre className="text-xs text-muted-foreground">{JSON.stringify(rec.before, null, 2)}</pre>
            )}
          </div>
          <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
            <p className="text-xs text-green-400 font-medium mb-2">After</p>
            {isPromptUpdate ? (
              <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6 font-mono">
                {(rec.after.systemPrompt as string) ?? '(no prompt)'}
              </p>
            ) : (
              <pre className="text-xs text-muted-foreground">{JSON.stringify(rec.after, null, 2)}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function OptimizePage() {
  const qc = useQueryClient();
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [tab, setTab] = useState<'analysis' | 'history'>('analysis');

  // Current analysis (live metrics)
  const { data: analysis = [], isLoading: analysisLoading, refetch: refetchAnalysis } = useQuery<AgentMetrics[]>({
    queryKey: ['opt-analysis'],
    queryFn: () => apiClient.get('/optimize/analysis').then((r) => r.data),
  });

  // Past runs
  const { data: runs = [], isLoading: runsLoading } = useQuery<OptimizationRun[]>({
    queryKey: ['opt-runs'],
    queryFn: () => apiClient.get('/optimize/runs').then((r) => r.data),
  });

  // Active run detail
  const { data: activeRun, isLoading: runDetailLoading } = useQuery<OptimizationRun>({
    queryKey: ['opt-run', activeRunId],
    queryFn: () => apiClient.get(`/optimize/runs/${activeRunId}`).then((r) => r.data),
    enabled: !!activeRunId,
    refetchInterval: (query) => {
      // Poll while running
      return query.state.data?.status === 'running' ? 3000 : false;
    },
  });

  // Trigger run
  const runMutation = useMutation({
    mutationFn: () => apiClient.post('/optimize/run').then((r) => r.data),
    onSuccess: (data) => {
      toast.success('Optimization started');
      setActiveRunId(data.runId);
      setTab('history');
      qc.invalidateQueries({ queryKey: ['opt-runs'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed to start optimization'),
  });

  // Apply
  const applyMutation = useMutation({
    mutationFn: (recId: string) => apiClient.post(`/optimize/recommendations/${recId}/apply`),
    onSuccess: () => {
      toast.success('Recommendation applied — agent updated');
      qc.invalidateQueries({ queryKey: ['opt-run', activeRunId] });
      qc.invalidateQueries({ queryKey: ['opt-analysis'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Apply failed'),
  });

  // Reject
  const rejectMutation = useMutation({
    mutationFn: (recId: string) => apiClient.post(`/optimize/recommendations/${recId}/reject`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opt-run', activeRunId] });
    },
  });

  const totalIssues = analysis.reduce((s, m) => s + m.issues.length, 0);
  const healthyAgents = analysis.filter((m) => m.issues.length === 0 && m.totalTasks > 0).length;
  const avgSuccessRate = analysis.length > 0
    ? analysis.reduce((s, m) => s + m.successRate, 0) / analysis.length
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" /> Self-Optimization
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Hub analyzes agent performance and generates improvement recommendations
          </p>
        </div>
        <button
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Zap className={cn('w-4 h-4', runMutation.isPending && 'animate-pulse')} />
          {runMutation.isPending ? 'Starting…' : 'Run Optimization'}
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Agents Monitored</p>
          <p className="text-2xl font-bold mt-1">{analysis.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Active Issues</p>
          <p className={cn('text-2xl font-bold mt-1', totalIssues > 0 ? 'text-yellow-400' : 'text-green-400')}>
            {totalIssues}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Avg Success Rate</p>
          <p className={cn('text-2xl font-bold mt-1', avgSuccessRate >= 0.7 ? 'text-green-400' : 'text-yellow-400')}>
            {Math.round(avgSuccessRate * 100)}%
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Healthy Agents</p>
          <p className="text-2xl font-bold mt-1 text-green-400">{healthyAgents}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary/50 p-1 rounded-lg w-fit">
        {(['analysis', 'history'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize',
              tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t === 'analysis' ? (
              <span className="flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5" /> Analysis</span>
            ) : (
              <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Run History</span>
            )}
          </button>
        ))}
      </div>

      {/* Analysis tab */}
      {tab === 'analysis' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Performance over last 14 days</p>
            <button onClick={() => refetchAnalysis()} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>

          {analysisLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading metrics…</div>
          ) : analysis.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No agents found. Register agents to start monitoring.</p>
            </div>
          ) : (
            <>
              {/* Issues first, then healthy */}
              {[...analysis]
                .sort((a, b) => b.issues.length - a.issues.length)
                .map((m) => <AgentMetricsCard key={m.agentId} m={m} />)
              }
            </>
          )}
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div className="space-y-4">
          {runsLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading runs…</div>
          ) : runs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Zap className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No optimization runs yet. Click "Run Optimization" to start.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Run list */}
              <div className="space-y-2">
                {runs.map((run) => (
                  <button
                    key={run.id}
                    onClick={() => setActiveRunId(run.id)}
                    className={cn(
                      'w-full text-left bg-card border rounded-xl p-3 hover:border-primary/40 transition-colors',
                      activeRunId === run.id ? 'border-primary/60 bg-primary/5' : 'border-border',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        'text-xs px-1.5 py-0.5 rounded-full font-medium',
                        run.status === 'completed' ? 'bg-green-400/15 text-green-400' :
                        run.status === 'running' ? 'bg-yellow-400/15 text-yellow-400' :
                        'bg-red-400/15 text-red-400',
                      )}>
                        {run.status === 'running' ? '⏳ Running' : run.status}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatRelativeTime(run.createdAt)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {run.agentsAnalyzed} agents · {run.recommendationCount} recommendations
                      {run.appliedCount > 0 && ` · ${run.appliedCount} applied`}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">{run.trigger}</p>
                  </button>
                ))}
              </div>

              {/* Run detail */}
              <div className="lg:col-span-2">
                {!activeRunId ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <p className="text-sm">Select a run to view recommendations</p>
                  </div>
                ) : runDetailLoading ? (
                  <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
                ) : activeRun ? (
                  <div className="space-y-3">
                    {/* Run summary */}
                    {activeRun.summary && (
                      <div className="bg-card border border-border rounded-xl p-4">
                        <p className="text-xs text-muted-foreground mb-1">Summary</p>
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{activeRun.summary}</p>
                      </div>
                    )}

                    {activeRun.status === 'running' && (
                      <div className="flex items-center gap-2 text-sm text-yellow-400 bg-yellow-400/10 rounded-xl px-4 py-3">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Optimization in progress — refreshing automatically…
                      </div>
                    )}

                    {/* Pending first */}
                    {activeRun.recommendations
                      ?.sort((a, b) => {
                        const order = { high: 0, medium: 1, low: 2 };
                        return order[a.impact] - order[b.impact];
                      })
                      .map((rec) => (
                        <RecCard
                          key={rec.id}
                          rec={rec}
                          onApply={(id) => applyMutation.mutate(id)}
                          onReject={(id) => rejectMutation.mutate(id)}
                        />
                      ))
                    }

                    {activeRun.recommendations?.length === 0 && activeRun.status === 'completed' && (
                      <div className="text-center py-12 text-muted-foreground">
                        <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-400/50" />
                        <p className="text-sm">All agents are performing well — no changes needed</p>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
