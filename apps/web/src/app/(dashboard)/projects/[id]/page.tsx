'use client';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../../lib/api-client';
import Link from 'next/link';
import { CEOStatusPanel } from '../../../../components/ceo-status-panel';
import { NextStepsPanel } from '../../../../components/project/next-steps-panel';
import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { getSocket } from '../../../../lib/socket';
import {
  ArrowLeft, Play, Pause, CheckCircle2, Clock, Loader2, XCircle,
  ChevronDown, ChevronRight, Bot, AlertCircle, FileText, Trash2, ExternalLink,
  BookTemplate, GitFork, HelpCircle,
} from 'lucide-react';
import { cn, STATUS_COLORS } from '../../../../lib/utils';
import toast from 'react-hot-toast';

const TASK_STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Clock className="w-3.5 h-3.5 text-muted-foreground" />,
  queued: <Clock className="w-3.5 h-3.5 text-blue-400" />,
  running: <Loader2 className="w-3.5 h-3.5 text-yellow-400 animate-spin" />,
  completed: <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />,
  failed: <XCircle className="w-3.5 h-3.5 text-red-400" />,
  cancelled: <XCircle className="w-3.5 h-3.5 text-muted-foreground" />,
};

const PRIORITY_BADGE: Record<string, string> = {
  CRITICAL: 'bg-red-500/20 text-red-400',
  HIGH: 'bg-orange-500/20 text-orange-400',
  MEDIUM: 'bg-blue-500/20 text-blue-400',
  LOW: 'bg-secondary text-muted-foreground',
};

function TaskRow({ task, agents }: { task: any; agents: any[] }) {
  const [open, setOpen] = useState(false);
  const agent = agents.find((a) => a.id === task.assignedAgentId);
  const status = task.status.toLowerCase();
  const isDelegated = task.title?.startsWith('[Delegated]');
  const displayTitle = isDelegated ? task.title.replace('[Delegated] ', '') : task.title;

  return (
    <div className={cn('border rounded-lg overflow-hidden', isDelegated ? 'border-violet-500/30' : 'border-border')}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 text-left"
      >
        <span className="flex-shrink-0">{TASK_STATUS_ICON[status] ?? <Clock className="w-3.5 h-3.5" />}</span>
        {isDelegated && <span title="Delegated by agent"><GitFork className="w-3 h-3 text-violet-400 flex-shrink-0" /></span>}
        <span className="flex-1 text-sm font-medium truncate">{displayTitle}</span>
        {task.priority && (
          <span className={cn('text-xs px-2 py-0.5 rounded-full flex-shrink-0', PRIORITY_BADGE[task.priority] ?? 'bg-secondary text-muted-foreground')}>
            {task.priority}
          </span>
        )}
        {agent && (
          <span className="text-xs text-muted-foreground flex-shrink-0 hidden sm:block">{agent.name}</span>
        )}
        {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-border bg-secondary/30 px-4 py-3 space-y-3">
          {task.description && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Description</p>
              <p className="text-sm whitespace-pre-wrap">{task.description}</p>
            </div>
          )}
          {task.outputSummary && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Output</p>
              <p className="text-sm whitespace-pre-wrap text-green-400/90">{task.outputSummary}</p>
            </div>
          )}
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>ID: <span className="font-mono select-all">{task.id}</span></span>
            {task.department && <span>Dept: {task.department}</span>}
            {task.retryCount > 0 && <span>Retries: {task.retryCount}/{task.maxRetries}</span>}
          </div>
          {/* Execution logs + trace link */}
          {task.executions?.[0] && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Latest Execution</p>
                <Link
                  href={`/traces/${task.executions[0].id}`}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="w-3 h-3" /> View full trace
                </Link>
              </div>
              <ExecLogs executionId={task.executions[0].id} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExecLogs({ executionId }: { executionId: string }) {
  const { data: logs = [] } = useQuery({
    queryKey: ['exec-logs', executionId],
    queryFn: () => apiClient.get(`/executions/${executionId}/logs`).then((r) => r.data),
    refetchInterval: 3000,
  });
  if (logs.length === 0) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">Execution Logs</p>
      <div className="bg-background rounded border border-border p-2 max-h-40 overflow-y-auto space-y-1">
        {logs.map((log: any) => (
          <div key={log.id} className={cn('text-xs font-mono', log.level === 'tool_call' ? 'text-blue-400' : log.level === 'tool_result' ? 'text-purple-400' : 'text-muted-foreground')}>
            <span className="opacity-50">[{log.level}]</span> {log.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskAgentAssign({ task, agents, projectId, onAssigned }: {
  task: any; agents: any[]; projectId: string; onAssigned: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const handleChange = async (agentId: string) => {
    setSaving(true);
    try {
      await apiClient.patch(`/projects/${projectId}/tasks/${task.id}/assign`, { agentId: agentId || null });
      onAssigned();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2 bg-secondary/40 border border-border rounded-lg px-3 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{task.title}</p>
        <p className="text-xs text-muted-foreground capitalize">{task.status.toLowerCase()}</p>
      </div>
      <select
        value={task.assignedAgentId ?? ''}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
        className="bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 max-w-[140px]"
      >
        <option value="">Unassigned</option>
        {agents.map((a: any) => (
          <option key={a.id} value={a.id}>{a.name} ({a.department ?? 'General'})</option>
        ))}
      </select>
    </div>
  );
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const router = useRouter();
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [feed, setFeed] = useState<Array<{ msg: string; type: string }>>([]);

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => apiClient.get(`/projects/${id}`).then((r) => r.data),
    refetchInterval: 5000,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['project-tasks', id],
    queryFn: () => apiClient.get(`/projects/${id}/tasks`).then((r) => r.data),
    refetchInterval: 3000,
    enabled: !!id,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => apiClient.get('/agents').then((r) => r.data),
  });

  const [showAssignPanel, setShowAssignPanel] = useState(false);
  const assignAgentMutation = useMutation({
    mutationFn: (agentId: string) => apiClient.post(`/projects/${id}/agents/${agentId}`),
    onSuccess: (data: any) => { qc.invalidateQueries({ queryKey: ['project-tasks', id] }); toast.success(`Assigned to ${data.data.assigned} tasks`); setShowAssignPanel(false); },
    onError: () => toast.error('Failed to assign agent'),
  });
  const unassignAgentMutation = useMutation({
    mutationFn: (agentId: string) => apiClient.delete(`/projects/${id}/agents/${agentId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['project-tasks', id] }); toast.success('Agent unassigned from tasks'); },
  });

  const startMutation = useMutation({
    mutationFn: () => apiClient.post(`/projects/${id}/start`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['project', id] }); toast.success('Project started!'); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed to start'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/projects/${id}`),
    onSuccess: () => { router.push('/projects'); toast.success('Project deleted'); },
    onError: () => toast.error('Failed to delete project'),
  });

  const saveTemplateMutation = useMutation({
    mutationFn: () => apiClient.post(`/templates/from-project/${id}`, {}),
    onSuccess: () => toast.success('Saved as template — find it in Templates'),
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed to save template'),
  });

  // Real-time feed via Socket.io
  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    socket.emit('subscribe:project', { projectId: id });

    const onStatusChanged = (data: any) => {
      qc.invalidateQueries({ queryKey: ['project-tasks', id] });
      qc.invalidateQueries({ queryKey: ['project', id] });
      const isDelegated = data.delegatedBy ? ' (delegated)' : '';
      setFeed((prev) => [{ msg: `Task ${data.taskId.slice(0, 8)}...${isDelegated} → ${data.status}`, type: 'task' }, ...prev].slice(0, 50));
    };
    const onAgentMessage = (data: any) => {
      setFeed((prev) => [{ msg: `${data.fromAgentName}: ${data.message.slice(0, 80)}`, type: 'message' }, ...prev].slice(0, 50));
    };
    const onLogAppended = () => {
      qc.invalidateQueries({ queryKey: ['project-tasks', id] });
    };
    const onHitlQuestion = (data: any) => {
      setFeed((prev) => [{ msg: `❓ ${data.agentId?.slice(0, 8)}... asks: ${data.question?.slice(0, 80)}`, type: 'hitl' }, ...prev].slice(0, 50));
      toast(`Agent needs your input — check the Intervene panel`, { icon: '❓', duration: 6000 });
    };
    const onHitlAnswered = (data: any) => {
      setFeed((prev) => [{ msg: `✅ Question ${data.questionId?.slice(0, 12)}... answered`, type: 'hitl_answered' }, ...prev].slice(0, 50));
    };

    socket.on('task:status_changed', onStatusChanged);
    socket.on('agent:message', onAgentMessage);
    socket.on('task:log_appended', onLogAppended);
    socket.on('hitl:question', onHitlQuestion);
    socket.on('hitl:answered', onHitlAnswered);

    return () => {
      socket.emit('unsubscribe:project', { projectId: id });
      socket.off('task:status_changed', onStatusChanged);
      socket.off('agent:message', onAgentMessage);
      socket.off('task:log_appended', onLogAppended);
      socket.off('hitl:question', onHitlQuestion);
      socket.off('hitl:answered', onHitlAnswered);
    };
  }, [id, token, qc]);

  if (isLoading) return <div className="text-muted-foreground text-sm">Loading...</div>;
  if (!project) return <div className="text-muted-foreground text-sm">Project not found.</div>;

  const status = project.status.toLowerCase();
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t: any) => t.status === 'COMPLETED').length;
  const pct = totalTasks > 0 ? Math.round(completedTasks / totalTasks * 100) : 0;

  // Group by department
  const byDept: Record<string, any[]> = {};
  for (const t of tasks) {
    const d = t.department ?? 'General';
    if (!byDept[d]) byDept[d] = [];
    byDept[d].push(t);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/projects" className="text-muted-foreground hover:text-foreground mt-1">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">{project.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{project.goal}</p>
            <div className="flex items-center gap-2 mt-2">
              <div className={cn('w-2 h-2 rounded-full', STATUS_COLORS[status] ?? 'bg-gray-400')} />
              <span className="text-xs capitalize text-muted-foreground">{status}</span>
            </div>
          </div>
        </div>
        <div className="flex-shrink-0 flex gap-2">
          {status === 'draft' && (
            <button onClick={() => startMutation.mutate()} disabled={startMutation.isPending}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
              {startMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Start Project
            </button>
          )}
          {(status === 'draft' || status === 'active') && tasks.length === 0 && (
            <button onClick={() => startMutation.mutate()} disabled={startMutation.isPending}
              className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
              {startMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
              Let CEO Plan
            </button>
          )}
          <button
            onClick={() => saveTemplateMutation.mutate()}
            disabled={saveTemplateMutation.isPending}
            className="flex items-center gap-2 border border-border text-muted-foreground hover:text-foreground hover:bg-secondary px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            title="Save as template"
          >
            {saveTemplateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookTemplate className="w-4 h-4" />}
            <span className="hidden sm:inline">Save as Template</span>
          </button>
          <button
            onClick={() => { if (confirm(`Delete "${project.name}"?`)) deleteMutation.mutate(); }}
            disabled={deleteMutation.isPending}
            className="flex items-center gap-2 border border-red-400/30 text-red-400 hover:bg-red-400/10 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress */}
      {totalTasks > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">{completedTasks}/{totalTasks} tasks completed</span>
            <span className="font-semibold">{pct}%</span>
          </div>
          <div className="h-2 bg-secondary rounded-full">
            <div className="h-2 bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
            {['pending', 'queued', 'running', 'completed', 'failed'].map((s) => {
              const count = tasks.filter((t: any) => t.status === s.toUpperCase()).length;
              return count > 0 ? (
                <span key={s} className="capitalize">{s}: <strong>{count}</strong></span>
              ) : null;
            })}
          </div>
        </div>
      )}

      {/* ── Next Steps Panel (shown when project is complete) ── */}
      {status === 'completed' && (
        <NextStepsPanel project={project} tasks={tasks} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Task list */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="font-semibold text-sm">Tasks</h2>
          {tasks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border border-border rounded-xl">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No tasks yet — start the project to let the CEO plan automatically</p>
            </div>
          ) : Object.keys(byDept).length > 1 ? (
            Object.entries(byDept).map(([dept, dTasks]) => (
              <div key={dept} className="space-y-2">
                <h3 className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{dept}</h3>
                {dTasks.map((t: any) => <TaskRow key={t.id} task={t} agents={agents} />)}
              </div>
            ))
          ) : (
            <div className="space-y-2">
              {tasks.map((t: any) => <TaskRow key={t.id} task={t} agents={agents} />)}
            </div>
          )}
        </div>

        {/* Live feed */}
        <div className="space-y-3">
          <CEOStatusPanel />

          <h2 className="font-semibold text-sm mt-2">Live Feed</h2>
          <div className="bg-card border border-border rounded-xl p-3 h-80 overflow-y-auto space-y-1.5">
            {feed.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center mt-4">Waiting for activity...</p>
            ) : (
              feed.map((entry, i) => (
                <div key={i} className={cn(
                  'text-xs border-b border-border/40 pb-1.5 last:border-0',
                  entry.type === 'message' ? 'text-blue-400' :
                  entry.type === 'hitl' ? 'text-yellow-400 font-medium' :
                  entry.type === 'hitl_answered' ? 'text-green-400' :
                  'text-muted-foreground',
                )}>
                  {entry.msg}
                </div>
              ))
            )}
          </div>

          {/* Bulk Assign Agent */}
          <div className="flex items-center justify-between mt-4">
            <h2 className="font-semibold text-sm">Assign Agent</h2>
            <button
              onClick={() => setShowAssignPanel((v) => !v)}
              className="text-xs text-primary hover:underline"
            >
              {showAssignPanel ? 'Hide' : 'Bulk assign'}
            </button>
          </div>
          {showAssignPanel && (
            <div className="bg-card border border-border rounded-xl p-3 space-y-2">
              <p className="text-xs text-muted-foreground mb-1">Select an agent to assign to all unassigned tasks:</p>
              {agents.length === 0 ? (
                <p className="text-xs text-muted-foreground">No agents available</p>
              ) : (
                agents.map((a: any) => {
                  const isAssigned = tasks.some((t: any) => t.assignedAgentId === a.id);
                  return (
                    <div key={a.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{a.name}</p>
                        <p className="text-xs text-muted-foreground">{a.jobTitle ?? a.department ?? 'Agent'}</p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => assignAgentMutation.mutate(a.id)}
                          disabled={assignAgentMutation.isPending}
                          className="text-xs px-2 py-1 bg-primary/20 text-primary rounded hover:bg-primary/30 disabled:opacity-50"
                        >
                          Assign
                        </button>
                        {isAssigned && (
                          <button
                            onClick={() => unassignAgentMutation.mutate(a.id)}
                            disabled={unassignAgentMutation.isPending}
                            className="text-xs px-2 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Per-task Agent Assignment */}
          <h2 className="font-semibold text-sm mt-2">Tasks &amp; Agents</h2>
          <div className="space-y-2">
            {tasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">No tasks yet</p>
            ) : (
              tasks.map((task: any) => (
                <TaskAgentAssign key={task.id} task={task} agents={agents} projectId={id} onAssigned={() => qc.invalidateQueries({ queryKey: ['project-tasks', id] })} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
