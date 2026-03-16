'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api-client';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  DollarSign, Zap, Activity, TrendingUp, Bot, FolderOpen, AlertTriangle,
} from 'lucide-react';
import { cn } from '../../../lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────
interface AgentStat { id: string; name: string; provider: string; modelId: string; tokensUsedToday: number; dailyTokenBudget: number | null; totalCost: number; totalTokens: number; executions: number }
interface ProjectStat { id: string; name: string; status: string; totalCost: number }
interface DayPoint { date: string; cost: number; tokens: number; count: number }
interface Summary { period: string; totalCost: number; totalTokens: number; totalExecutions: number; agents: AgentStat[]; projects: ProjectStat[] }

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt$ = (n: number) => n < 0.01 ? `$${(n * 100).toFixed(3)}¢` : `$${n.toFixed(4)}`;
const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'];

const PROVIDER_COLOR: Record<string, string> = {
  ANTHROPIC: '#c97d4e',
  OPENAI: '#10a37f',
  GOOGLE: '#4285f4',
  MISTRAL: '#ff7000',
  COHERE: '#39d3c3',
};

function StatCard({ icon: Icon, label, value, sub, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={cn('w-3.5 h-3.5', accent)} />
        {label}
      </div>
      <p className={cn('text-2xl font-bold', accent)}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function FinOpsPage() {
  const [days, setDays] = useState(14);

  const { data: summary, isLoading: loadingSummary } = useQuery<Summary>({
    queryKey: ['finops-summary'],
    queryFn: () => apiClient.get('/finops/summary').then((r) => r.data),
  });

  const { data: trend = [], isLoading: loadingTrend } = useQuery<DayPoint[]>({
    queryKey: ['finops-trend', days],
    queryFn: () => apiClient.get(`/finops/trend?days=${days}`).then((r) => r.data),
  });

  const loading = loadingSummary || loadingTrend;

  // Prep pie chart data
  const agentPie = (summary?.agents ?? [])
    .filter((a) => a.totalCost > 0)
    .map((a, i) => ({ name: a.name, value: a.totalCost, color: COLORS[i % COLORS.length] }));

  const topAgents = summary?.agents.slice(0, 5) ?? [];
  const maxAgentCost = topAgents[0]?.totalCost ?? 1;

  // Format trend labels
  const trendData = trend.map((d) => ({
    ...d,
    label: new Date(d.date + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' }),
    costFormatted: fmt$(d.cost),
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Loading cost data…
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">FinOps</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Cost tracking across all agents and projects</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={DollarSign} label="Total Cost (30d)" value={fmt$(summary?.totalCost ?? 0)} sub={`${summary?.totalExecutions ?? 0} executions`} accent="text-emerald-400" />
        <StatCard icon={Zap} label="Tokens Used (30d)" value={fmtK(summary?.totalTokens ?? 0)} sub="prompt + completion" accent="text-violet-400" />
        <StatCard icon={Bot} label="Agents" value={String(summary?.agents.length ?? 0)} sub={`${summary?.agents.filter((a) => a.totalCost > 0).length} with activity`} />
        <StatCard icon={FolderOpen} label="Projects" value={String(summary?.projects.length ?? 0)} sub={`${summary?.projects.filter((p) => p.totalCost > 0).length} with spend`} />
      </div>

      {/* Daily cost trend */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" /> Daily Spend
          </h2>
          <div className="flex items-center gap-1">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={cn(
                  'px-2.5 py-1 rounded text-xs',
                  days === d ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary',
                )}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={trendData}>
            <defs>
              <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: '#888' }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v.toFixed(4)}`} width={60} />
            <Tooltip
              contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number) => [fmt$(v), 'Cost']}
            />
            <Area type="monotone" dataKey="cost" stroke="#10b981" strokeWidth={2} fill="url(#costGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Cost by agent pie */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Bot className="w-4 h-4 text-muted-foreground" /> Spend by Agent
          </h2>
          {agentPie.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">No agent spend recorded yet</p>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={agentPie} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" strokeWidth={0}>
                    {agentPie.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 11 }} formatter={(v: number) => [fmt$(v)]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5 min-w-0">
                {agentPie.map((d) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                    <span className="truncate flex-1">{d.name}</span>
                    <span className="text-muted-foreground flex-shrink-0">{fmt$(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Cost by project */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-muted-foreground" /> Spend by Project
          </h2>
          {(summary?.projects.filter((p) => p.totalCost > 0) ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">No project spend recorded yet</p>
          ) : (
            <div className="space-y-2">
              {summary?.projects.filter((p) => p.totalCost > 0).slice(0, 6).map((p) => {
                const maxCost = summary.projects[0]?.totalCost ?? 1;
                const pct = (p.totalCost / maxCost) * 100;
                return (
                  <div key={p.id} className="space-y-0.5">
                    <div className="flex justify-between text-xs">
                      <span className="truncate max-w-[70%]">{p.name}</span>
                      <span className="text-muted-foreground">{fmt$(p.totalCost)}</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Agent detail table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" /> Agent Detail (30d)
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {['Agent', 'Provider / Model', 'Executions', 'Total Tokens', 'Total Cost', 'Tokens Today', 'Budget'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-muted-foreground font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary?.agents.map((a) => {
                const budgetPct = a.dailyTokenBudget ? (a.tokensUsedToday / a.dailyTokenBudget) * 100 : null;
                const overBudget = budgetPct !== null && budgetPct > 90;
                return (
                  <tr key={a.id} className="border-b border-border/50 hover:bg-secondary/30">
                    <td className="px-4 py-3 font-medium">{a.name}</td>
                    <td className="px-4 py-3">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: `${PROVIDER_COLOR[a.provider]}20`, color: PROVIDER_COLOR[a.provider] ?? '#888' }}>
                        {a.provider}
                      </span>
                      <span className="ml-1.5 text-muted-foreground font-mono">{a.modelId}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{a.executions}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtK(a.totalTokens)}</td>
                    <td className={cn('px-4 py-3 font-semibold', a.totalCost > 0.1 ? 'text-orange-400' : 'text-foreground')}>{fmt$(a.totalCost)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtK(a.tokensUsedToday)}</td>
                    <td className="px-4 py-3">
                      {a.dailyTokenBudget ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1">
                            {overBudget && <AlertTriangle className="w-3 h-3 text-orange-400" />}
                            <span className={overBudget ? 'text-orange-400' : 'text-muted-foreground'}>
                              {Math.round(budgetPct!)}%
                            </span>
                          </div>
                          <div className="h-1 w-16 bg-secondary rounded-full overflow-hidden">
                            <div className={cn('h-full rounded-full', overBudget ? 'bg-orange-400' : 'bg-emerald-500')} style={{ width: `${Math.min(budgetPct!, 100)}%` }} />
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground opacity-40">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
