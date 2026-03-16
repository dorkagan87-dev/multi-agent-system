'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { apiClient } from '../lib/api-client';
import { getSocket } from '../lib/socket';
import { Crown, Zap, CheckCircle2, Clock, Loader2, MessageSquare, TrendingUp, Timer } from 'lucide-react';
import { cn } from '../lib/utils';

// CEO planning typically takes 15–60s depending on model
const EST_DURATION_MS = 45_000;

function useActionTimer(active: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (active) {
      if (!startRef.current) startRef.current = Date.now();
      const tick = () => {
        setElapsed(Date.now() - startRef.current!);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      startRef.current = null;
      setElapsed(0);
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [active]);

  const elapsedSec = Math.floor(elapsed / 1000);
  const progress = Math.min(elapsed / EST_DURATION_MS, 0.99);
  const remainingSec = Math.max(0, Math.round((EST_DURATION_MS - elapsed) / 1000));

  return { elapsedSec, remainingSec, progress };
}

interface CEOMessage {
  id: number;
  text: string;
  ts: Date;
  type: 'plan' | 'announcement' | 'message' | 'error';
}

let _msgId = 0;

const STATUS_STYLES: Record<string, { dot: string; label: string; pulse: boolean }> = {
  idle:      { dot: 'bg-green-400',  label: 'Ready',    pulse: false },
  busy:      { dot: 'bg-yellow-400', label: 'Working',  pulse: true  },
  planning:  { dot: 'bg-blue-400',   label: 'Planning', pulse: true  },
  error:     { dot: 'bg-red-400',    label: 'Error',    pulse: false },
  disabled:  { dot: 'bg-gray-400',   label: 'Offline',  pulse: false },
};

export function CEOStatusPanel() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => apiClient.get('/agents').then((r) => r.data),
    refetchInterval: 5000,
  });

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => apiClient.get('/dashboard/stats').then((r) => r.data),
    refetchInterval: 10000,
  });

  const [messages, setMessages] = useState<CEOMessage[]>([]);
  const [tasksCreated, setTasksCreated] = useState(0);
  const [projectsPlanned, setProjectsPlanned] = useState(0);

  // Find CEO agent
  const ceo = agents.find((a: any) =>
    a.jobTitle?.toLowerCase().includes('ceo') ||
    a.jobTitle?.toLowerCase().includes('chief') ||
    a.name?.toLowerCase().includes('ceo')
  ) ?? agents[0];

  const statusKey = ceo?.status?.toLowerCase() ?? 'disabled';
  const statusStyle = STATUS_STYLES[statusKey] ?? STATUS_STYLES.idle;
  const isWorking = statusKey === 'busy' || statusKey === 'planning';
  const { elapsedSec, remainingSec, progress } = useActionTimer(isWorking);

  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    socket.emit('subscribe:global');

    const onMessage = (payload: any) => {
      const name: string = payload.fromAgentName ?? payload.agentName ?? '';
      const isCEO =
        name.toLowerCase().includes('ceo') ||
        name.toLowerCase().includes('chief') ||
        ceo?.name === name;
      if (!isCEO) return;

      const text: string = payload.message ?? payload.content ?? '';
      let type: CEOMessage['type'] = 'message';
      if (text.includes('[CEO PLAN]') || text.includes('plan ready')) { type = 'plan'; setProjectsPlanned((p) => p + 1); }
      if (text.includes('announcement') || text.startsWith('📋')) type = 'announcement';
      if (text.includes('⚠️') || text.includes('issue')) type = 'error';

      setMessages((prev) => [{ id: ++_msgId, text: text.slice(0, 140), ts: new Date(), type }, ...prev].slice(0, 20));
    };

    const onTaskCreated = () => setTasksCreated((p) => p + 1);

    socket.on('agent:message', onMessage);
    socket.on('company:announcement', onMessage);
    socket.on('task:created', onTaskCreated);

    return () => {
      socket.off('agent:message', onMessage);
      socket.off('company:announcement', onMessage);
      socket.off('task:created', onTaskCreated);
    };
  }, [token, ceo?.name]);

  if (!ceo) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 flex flex-col items-center justify-center gap-3 text-center" style={{ minHeight: 200 }}>
        <Crown className="w-10 h-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No CEO agent found</p>
        <p className="text-xs text-muted-foreground/60">Go to Settings → Configure a sector to create your agent roster</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary/20 to-purple-500/10 px-5 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xl">
              {ceo.avatarEmoji ?? '👔'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{ceo.name}</span>
                <Crown className="w-3.5 h-3.5 text-yellow-400" />
              </div>
              <p className="text-xs text-muted-foreground">{ceo.jobTitle ?? 'CEO'} · {ceo.modelId}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('w-2.5 h-2.5 rounded-full', statusStyle.dot, statusStyle.pulse && 'animate-pulse')} />
            <span className="text-xs font-medium">{statusStyle.label}</span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
        <StatCell icon={<TrendingUp className="w-3.5 h-3.5 text-blue-400" />} label="Projects Planned" value={projectsPlanned} />
        <StatCell icon={<CheckCircle2 className="w-3.5 h-3.5 text-green-400" />} label="Tasks Created" value={tasksCreated} />
        <StatCell icon={<Zap className="w-3.5 h-3.5 text-yellow-400" />} label="Tokens Today" value={(ceo.tokensUsedToday ?? 0).toLocaleString()} />
      </div>

      {/* Current activity + timer */}
      <div className="px-4 py-3 border-b border-border space-y-2">
        <p className="text-xs text-muted-foreground">Current Activity</p>
        {isWorking ? (
          <>
            <div className="flex items-center gap-2 text-sm text-yellow-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span className="truncate">{messages[0]?.text.slice(0, 80) ?? 'Working on a task…'}</span>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-yellow-400 rounded-full transition-all duration-1000"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            {/* Timer row */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Timer className="w-3 h-3" />
                <span>Elapsed: <span className="tabular-nums font-medium text-foreground">{formatSec(elapsedSec)}</span></span>
              </div>
              <div className="text-muted-foreground">
                EST remaining: <span className="tabular-nums font-medium text-yellow-400">{formatSec(remainingSec)}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>Idle — waiting for a project to plan</span>
          </div>
        )}
      </div>

      {/* Message feed */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Recent CEO Messages</p>
        </div>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {messages.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 italic">No messages yet — start a project to see CEO in action</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={cn(
                'text-xs rounded-lg px-3 py-2 leading-relaxed',
                m.type === 'plan'         && 'bg-blue-500/10 text-blue-300',
                m.type === 'announcement' && 'bg-primary/10 text-primary',
                m.type === 'error'        && 'bg-red-500/10 text-red-400',
                m.type === 'message'      && 'bg-secondary text-foreground/80',
              )}>
                <span className="opacity-50 mr-1 tabular-nums">
                  {m.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {m.text}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function formatSec(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec.toString().padStart(2, '0')}s` : `${sec}s`;
}

function StatCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center py-3 px-2 gap-1">
      {icon}
      <span className="text-base font-bold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground text-center leading-tight">{label}</span>
    </div>
  );
}
