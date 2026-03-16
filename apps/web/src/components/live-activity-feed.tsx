'use client';
import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { getSocket } from '../lib/socket';
import { Activity, Bot, CheckCircle, XCircle, Zap, MessageSquare, Users, FolderOpen } from 'lucide-react';

interface LogEntry {
  id: number;
  ts: Date;
  type: string;
  message: string;
  agentName?: string;
  color: string;
  Icon: React.ElementType;
}

let _id = 0;

const EVENT_MAP: Record<string, { label: (p: any) => string; color: string; Icon: React.ElementType }> = {
  'task:status_changed': {
    label: (p) => `Task "${p.taskTitle ?? p.taskId}" → ${p.status}`,
    color: 'text-yellow-400',
    Icon: Activity,
  },
  'agent:status_changed': {
    label: (p) => `${p.agentName ?? 'Agent'} is now ${p.status}`,
    color: 'text-blue-400',
    Icon: Bot,
  },
  'agent:message': {
    label: (p) => `${p.agentName ?? 'Agent'}: ${(p.content ?? '').slice(0, 80)}${(p.content ?? '').length > 80 ? '…' : ''}`,
    color: 'text-green-400',
    Icon: MessageSquare,
  },
  'task:completed': {
    label: (p) => `Completed: "${p.taskTitle ?? p.taskId}"`,
    color: 'text-emerald-400',
    Icon: CheckCircle,
  },
  'task:failed': {
    label: (p) => `Failed: "${p.taskTitle ?? p.taskId}"`,
    color: 'text-red-400',
    Icon: XCircle,
  },
  'project:started': {
    label: (p) => `Project "${p.projectName ?? p.projectId}" started`,
    color: 'text-purple-400',
    Icon: FolderOpen,
  },
  'company:announcement': {
    label: (p) => p.message ?? 'Company announcement',
    color: 'text-orange-400',
    Icon: Zap,
  },
  'meeting:started': {
    label: (p) => `Meeting started: ${p.topic ?? ''}`,
    color: 'text-cyan-400',
    Icon: Users,
  },
};

const ALL_EVENTS = Object.keys(EVENT_MAP);

export function LiveActivityFeed() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    socket.emit('subscribe:global');

    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    if (socket.connected) setConnected(true);

    const handlers: Record<string, (p: any) => void> = {};

    ALL_EVENTS.forEach((event) => {
      const def = EVENT_MAP[event];
      const handler = (payload: any) => {
        const entry: LogEntry = {
          id: ++_id,
          ts: new Date(),
          type: event,
          message: def.label(payload),
          agentName: payload?.agentName,
          color: def.color,
          Icon: def.Icon,
        };
        setEntries((prev) => [...prev.slice(-199), entry]);
      };
      handlers[event] = handler;
      socket.on(event, handler);
    });

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      ALL_EVENTS.forEach((e) => socket.off(e, handlers[e]));
    };
  }, [token]);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  return (
    <div className="bg-card border border-border rounded-lg flex flex-col" style={{ height: '340px' }}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Live Activity</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
          <span className="text-xs text-muted-foreground">{connected ? 'Live' : 'Offline'}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 log-stream space-y-1">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Activity className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-xs">Waiting for activity…</p>
            <p className="text-xs opacity-60 mt-1">Events will appear here in real-time</p>
          </div>
        ) : (
          entries.map((e) => (
            <div key={e.id} className="flex items-start gap-2 text-xs group">
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {e.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <e.Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${e.color}`} />
              <span className="text-foreground/90 leading-tight">{e.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
