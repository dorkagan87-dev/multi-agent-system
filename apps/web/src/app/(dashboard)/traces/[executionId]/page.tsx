'use client';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../../lib/api-client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../../../../lib/socket';
import { useSession } from 'next-auth/react';
import {
  ArrowLeft, Bot, Brain, Wrench, CheckCircle2, XCircle,
  Loader2, Clock, ChevronDown, ChevronRight, Zap, AlertTriangle,
  Info, Timer, DollarSign, Hash, ArrowUpDown,
} from 'lucide-react';
import { cn, PROVIDER_ICONS } from '../../../../lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExecutionLog {
  id: string;
  executionId: string;
  level: 'llm_turn' | 'tool_call' | 'tool_result' | 'info' | 'error';
  message: string;
  data?: Record<string, unknown> | null;
  timestamp: string;
}

interface Execution {
  id: string;
  taskId: string;
  agentId: string;
  attempt: number;
  status: string;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  turns: number;
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
  task: { id: string; title: string; description: string; projectId: string; status: string };
  agent: { id: string; name: string; provider: string; modelId: string; avatarUrl?: string };
}

// ── Log step config ───────────────────────────────────────────────────────────

const STEP_CONFIG: Record<string, {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  bg: string;
  border: string;
  text: string;
  dot: string;
}> = {
  llm_turn: {
    icon: Brain,
    label: 'LLM Turn',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/30',
    text: 'text-violet-300',
    dot: 'bg-violet-400',
  },
  tool_call: {
    icon: Wrench,
    label: 'Tool Call',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-300',
    dot: 'bg-blue-400',
  },
  tool_result: {
    icon: CheckCircle2,
    label: 'Tool Result',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-300',
    dot: 'bg-emerald-400',
  },
  info: {
    icon: Info,
    label: 'Info',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/30',
    text: 'text-sky-300',
    dot: 'bg-sky-400',
  },
  error: {
    icon: AlertTriangle,
    label: 'Error',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-300',
    dot: 'bg-red-400',
  },
};

const DEFAULT_STEP = {
  icon: Zap,
  label: 'Event',
  bg: 'bg-secondary',
  border: 'border-border',
  text: 'text-muted-foreground',
  dot: 'bg-muted-foreground',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(start: string, end?: string): string {
  const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function relativeMs(base: string, ts: string): string {
  const ms = new Date(ts).getTime() - new Date(base).getTime();
  if (ms < 0) return '+0ms';
  if (ms < 1000) return `+${ms}ms`;
  return `+${(ms / 1000).toFixed(2)}s`;
}

// ── Step component ────────────────────────────────────────────────────────────

function TraceStep({ log, baseTime, index }: { log: ExecutionLog; baseTime: string; index: number }) {
  const [expanded, setExpanded] = useState(log.level === 'error');
  const cfg = STEP_CONFIG[log.level] ?? DEFAULT_STEP;
  const Icon = cfg.icon;
  const hasData = log.data && Object.keys(log.data).length > 0;

  // For llm_turn, extract tool call names from data
  const toolCallNames: string[] = [];
  if (log.level === 'llm_turn' && log.data?.toolCalls) {
    const calls = log.data.toolCalls as Array<{ name: string }>;
    calls.forEach((c) => toolCallNames.push(c.name));
  }

  return (
    <div className="flex gap-3 group">
      {/* Timeline spine */}
      <div className="flex flex-col items-center flex-shrink-0 w-7">
        <div className={cn('w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border', cfg.bg, cfg.border)}>
          <Icon className={cn('w-3.5 h-3.5', cfg.text)} />
        </div>
        <div className="w-px flex-1 bg-border mt-1 min-h-[8px]" />
      </div>

      {/* Content */}
      <div className={cn(
        'flex-1 mb-3 rounded-lg border overflow-hidden',
        cfg.bg, cfg.border,
        log.level === 'error' && 'ring-1 ring-red-500/50',
      )}>
        {/* Header row */}
        <button
          onClick={() => hasData && setExpanded((v) => !v)}
          className={cn(
            'w-full flex items-start gap-2 px-3 py-2.5 text-left',
            hasData && 'hover:brightness-110',
          )}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className={cn('text-[10px] font-semibold uppercase tracking-wide flex-shrink-0 px-1.5 py-0.5 rounded', cfg.bg, cfg.text)}>
              {cfg.label}
            </span>
            <span className="text-xs text-foreground leading-relaxed line-clamp-2 flex-1">
              {log.message}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            {toolCallNames.length > 0 && (
              <div className="hidden sm:flex items-center gap-1">
                {[...new Set(toolCallNames)].map((n, i) => (
                  <span key={`${n}-${i}`} className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-mono">
                    {n}()
                  </span>
                ))}
              </div>
            )}
            <span className="text-[10px] text-muted-foreground font-mono">{relativeMs(baseTime, log.timestamp)}</span>
            {hasData && (
              expanded
                ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            )}
          </div>
        </button>

        {/* Expanded data */}
        {expanded && hasData && (
          <div className="border-t border-border/50 px-3 py-2 bg-black/20">
            <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-all leading-relaxed max-h-80 overflow-y-auto">
              {JSON.stringify(log.data, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ComponentType<{ className?: string }>; cls: string; label: string }> = {
    RUNNING: { icon: Loader2, cls: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30', label: 'Running' },
    COMPLETED: { icon: CheckCircle2, cls: 'text-green-400 bg-green-400/10 border-green-400/30', label: 'Completed' },
    FAILED: { icon: XCircle, cls: 'text-red-400 bg-red-400/10 border-red-400/30', label: 'Failed' },
    CANCELLED: { icon: XCircle, cls: 'text-muted-foreground bg-secondary border-border', label: 'Cancelled' },
  };
  const cfg = map[status] ?? map.RUNNING;
  const Icon = cfg.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border', cfg.cls)}>
      <Icon className={cn('w-3.5 h-3.5', status === 'RUNNING' && 'animate-spin')} />
      {cfg.label}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TracePage() {
  const { executionId } = useParams<{ executionId: string }>();
  const { data: session } = useSession();
  const qc = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [elapsed, setElapsed] = useState('0s');

  const { data: exec, isLoading: execLoading } = useQuery<Execution>({
    queryKey: ['execution', executionId],
    queryFn: () => apiClient.get(`/executions/${executionId}`).then((r) => r.data),
    refetchInterval: (q) => q.state.data?.status === 'RUNNING' ? 3000 : false,
  });

  const { data: logs = [] } = useQuery<ExecutionLog[]>({
    queryKey: ['execution-logs', executionId],
    queryFn: () => apiClient.get(`/executions/${executionId}/logs`).then((r) => r.data),
    refetchInterval: exec?.status === 'RUNNING' ? 3000 : false,
    enabled: !!exec,
  });

  // Live elapsed timer
  useEffect(() => {
    if (!exec?.startedAt || exec.status !== 'RUNNING') return;
    const iv = setInterval(() => setElapsed(formatDuration(exec.startedAt)), 500);
    return () => clearInterval(iv);
  }, [exec?.startedAt, exec?.status]);

  // Real-time log streaming via socket
  useEffect(() => {
    if (!exec?.task?.projectId || !session?.user) return;
    const token = (session as any).accessToken ?? '';
    const s = getSocket(token);
    s.emit('subscribe:project', { projectId: exec.task.projectId });

    const handler = (event: { type: string; payload: unknown }) => {
      if (event.type === 'task:log_appended') {
        const p = event.payload as { executionId: string; log: ExecutionLog };
        if (p.executionId === executionId) {
          qc.setQueryData<ExecutionLog[]>(['execution-logs', executionId], (old = []) => [...old, p.log]);
        }
      }
      if (event.type === 'task:status_changed') {
        const p = event.payload as { taskId: string };
        if (p.taskId === exec.taskId) {
          qc.invalidateQueries({ queryKey: ['execution', executionId] });
        }
      }
    };
    s.on('event', handler);
    return () => { s.off('event', handler); };
  }, [exec?.task?.projectId, exec?.taskId, executionId, qc, session]);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs.length, autoScroll]);

  if (execLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading trace…
      </div>
    );
  }

  if (!exec) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <XCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Execution not found</p>
        <Link href="/agents" className="text-xs text-primary mt-2 inline-block hover:underline">← Back to agents</Link>
      </div>
    );
  }

  const providerIcon = PROVIDER_ICONS?.[exec.agent.provider?.toLowerCase()] ?? '🤖';
  const duration = exec.completedAt
    ? formatDuration(exec.startedAt, exec.completedAt)
    : exec.status === 'RUNNING' ? elapsed : '—';
  const totalTokens = exec.promptTokens + exec.completionTokens;

  const turnLogs = logs.filter((l) => l.level === 'llm_turn');
  const toolLogs = logs.filter((l) => l.level === 'tool_call');

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Back nav */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/projects/${exec.task.projectId}`} className="hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Project
        </Link>
        <span>/</span>
        <Link href={`/agents/${exec.agent.id}`} className="hover:text-foreground">
          {exec.agent.name}
        </Link>
        <span>/</span>
        <span className="text-foreground">Trace</span>
      </div>

      {/* Header card */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-xl flex-shrink-0">
              {providerIcon}
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold text-base leading-tight truncate">{exec.task.title}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Bot className="w-3 h-3" /> {exec.agent.name}
                </span>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">{exec.agent.modelId}</span>
                {exec.attempt > 1 && (
                  <>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-yellow-400">Attempt #{exec.attempt}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <StatusBadge status={exec.status} />
        </div>

        {/* Metrics strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          {[
            { icon: Timer, label: 'Duration', value: duration },
            { icon: ArrowUpDown, label: 'Turns', value: `${exec.turns} / ${turnLogs.length} logged` },
            { icon: Hash, label: 'Tokens', value: totalTokens > 0 ? totalTokens.toLocaleString() : '—' },
            { icon: DollarSign, label: 'Cost', value: exec.totalCost > 0 ? `$${exec.totalCost.toFixed(4)}` : '—' },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="bg-secondary/50 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
                <Icon className="w-3 h-3" /> {label}
              </div>
              <p className="text-sm font-semibold">{value}</p>
            </div>
          ))}
        </div>

        {/* Token breakdown */}
        {totalTokens > 0 && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Prompt: {exec.promptTokens.toLocaleString()}</span>
              <span>Completion: {exec.completionTokens.toLocaleString()}</span>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden flex">
              <div
                className="h-full bg-violet-500 rounded-full"
                style={{ width: `${(exec.promptTokens / totalTokens) * 100}%` }}
              />
              <div className="h-full bg-emerald-500 rounded-full flex-1" />
            </div>
          </div>
        )}

        {/* Error message */}
        {exec.errorMessage && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-300 font-mono">
            {exec.errorMessage}
          </div>
        )}
      </div>

      {/* Stats bar */}
      {logs.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
          <span>{logs.length} events</span>
          <span>·</span>
          <span>{turnLogs.length} LLM turns</span>
          <span>·</span>
          <span>{toolLogs.length} tool calls</span>
          <span>·</span>
          <span>Started {formatTime(exec.startedAt)}</span>
          <div className="flex-1" />
          <button
            onClick={() => setAutoScroll((v) => !v)}
            className={cn('flex items-center gap-1 px-2 py-1 rounded border',
              autoScroll ? 'border-primary text-primary' : 'border-border')}
          >
            <ArrowLeft className="w-3 h-3 rotate-90" />
            Auto-scroll {autoScroll ? 'on' : 'off'}
          </button>
        </div>
      )}

      {/* Timeline */}
      <div className="space-y-0">
        {logs.length === 0 && exec.status === 'RUNNING' ? (
          <div className="flex items-center gap-3 py-8 text-muted-foreground justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Waiting for first event…</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No logs recorded for this execution</p>
          </div>
        ) : (
          <>
            {logs.map((log, i) => (
              <TraceStep key={log.id} log={log} baseTime={exec.startedAt} index={i} />
            ))}

            {/* Terminal node */}
            <div className="flex gap-3">
              <div className="flex flex-col items-center flex-shrink-0 w-7">
                <div className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border',
                  exec.status === 'COMPLETED' && 'bg-green-500/10 border-green-500/30',
                  exec.status === 'FAILED' && 'bg-red-500/10 border-red-500/30',
                  exec.status === 'RUNNING' && 'bg-yellow-500/10 border-yellow-500/30',
                )}>
                  {exec.status === 'COMPLETED' && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
                  {exec.status === 'FAILED' && <XCircle className="w-3.5 h-3.5 text-red-400" />}
                  {exec.status === 'RUNNING' && <Loader2 className="w-3.5 h-3.5 text-yellow-400 animate-spin" />}
                </div>
              </div>
              <div className="flex-1 pb-4 flex items-center">
                <span className="text-xs text-muted-foreground">
                  {exec.status === 'COMPLETED' && `Completed · ${duration}`}
                  {exec.status === 'FAILED' && 'Execution failed'}
                  {exec.status === 'RUNNING' && 'Running…'}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      <div ref={bottomRef} />
    </div>
  );
}
