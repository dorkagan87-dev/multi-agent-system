'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';
import {
  ShieldAlert, X, MessageSquare, Edit3, Pause, Play,
  BrainCircuit, ArrowRightLeft, ChevronDown, Send, Loader2,
  HelpCircle, CheckCircle2, Clock, AlertTriangle,
} from 'lucide-react';

type Tab = 'message' | 'override' | 'department' | 'context' | 'redirect' | 'questions';

/**
 * Floating Human Control Panel.
 * Opens a side drawer from any page.
 * Lets the user:
 *   - Message any agent mid-execution
 *   - Ask agents questions / give advice
 *   - Override any task
 *   - Pause/resume any department
 *   - Inject knowledge into agent memory
 *   - Redirect a task to a different agent
 */
export function ControlPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('message');
  const qc = useQueryClient();

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => apiClient.get('/agents').then((r) => r.data),
    enabled: open,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiClient.get('/projects').then((r) => r.data.filter((p: any) => p.status === 'ACTIVE' || p.status === 'DRAFT')),
    enabled: open,
  });

  // Shared state
  const [selectedAgent, setSelectedAgent] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [message, setMessage] = useState('');
  const [taskId, setTaskId] = useState('');
  const [taskOverrides, setTaskOverrides] = useState({ description: '', assignedAgentId: '', priority: '' });
  const [department, setDepartment] = useState('');
  const [contextKey, setContextKey] = useState('');
  const [contextValue, setContextValue] = useState('');
  const [redirectTaskId, setRedirectTaskId] = useState('');
  const [redirectAgent, setRedirectAgent] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const departments = [...new Set(agents.map((a: any) => a.department).filter(Boolean))] as string[];

  const msgMutation = useMutation({
    mutationFn: () => apiClient.post('/intervene/message-agent', { agentId: selectedAgent, message, projectId: selectedProject }),
    onSuccess: () => { toast.success('Message sent to agent'); setMessage(''); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  });

  const overrideMutation = useMutation({
    mutationFn: () => apiClient.post('/intervene/override-task', { taskId, updates: taskOverrides }),
    onSuccess: () => { toast.success('Task overridden and re-queued'); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  });

  const pauseMutation = useMutation({
    mutationFn: (action: 'pause' | 'resume') => apiClient.post(`/intervene/${action}-department`, { projectId: selectedProject, department }),
    onSuccess: (_, action) => { toast.success(action === 'pause' ? 'Department paused' : 'Department resumed'); qc.invalidateQueries(); },
  });

  const contextMutation = useMutation({
    mutationFn: () => apiClient.post('/intervene/inject-context', {
      agentId: selectedAgent,
      projectId: selectedProject || null,
      key: contextKey,
      value: contextValue,
    }),
    onSuccess: () => { toast.success('Context injected into agent memory'); setContextKey(''); setContextValue(''); },
  });

  const redirectMutation = useMutation({
    mutationFn: () => apiClient.post('/intervene/redirect-task', { taskId: redirectTaskId, newAgentId: redirectAgent }),
    onSuccess: () => { toast.success('Task redirected!'); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  });

  const { data: questions = [] } = useQuery({
    queryKey: ['hitl-questions'],
    queryFn: () => apiClient.get('/intervene/questions').then((r) => r.data),
    enabled: open && tab === 'questions',
    refetchInterval: 5000,
  });

  const replyMutation = useMutation({
    mutationFn: ({ questionId, answer }: { questionId: string; answer: string }) =>
      apiClient.post(`/intervene/questions/${questionId}/reply`, { answer }),
    onSuccess: (_, { questionId }) => {
      toast.success('Reply sent to agent');
      setAnswers((a) => { const n = { ...a }; delete n[questionId]; return n; });
      qc.invalidateQueries({ queryKey: ['hitl-questions'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Failed'),
  });

  const pendingCount = (questions as any[]).filter((q) => q.status === 'pending').length;

  const TABS: Array<{ id: Tab; label: string; icon: React.ElementType; desc: string; badge?: number }> = [
    { id: 'message', label: 'Message Agent', icon: MessageSquare, desc: 'Send a message or ask a question to any agent mid-execution' },
    { id: 'override', label: 'Override Task', icon: Edit3, desc: 'Edit and re-run any task with updated instructions' },
    { id: 'department', label: 'Dept Control', icon: Pause, desc: 'Pause or resume an entire department' },
    { id: 'context', label: 'Inject Knowledge', icon: BrainCircuit, desc: 'Add information to an agent\'s memory for future tasks' },
    { id: 'redirect', label: 'Redirect Task', icon: ArrowRightLeft, desc: 'Reassign a task to a different agent' },
    { id: 'questions', label: 'HITL Questions', icon: HelpCircle, desc: 'Answer questions agents are waiting on before they can continue', badge: pendingCount },
  ];

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'fixed bottom-6 right-6 z-40 flex items-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-black px-4 py-2.5 rounded-full shadow-lg text-sm font-semibold transition-all',
          open && 'opacity-0 pointer-events-none',
        )}
      >
        <ShieldAlert className="w-4 h-4" /> Intervene
      </button>

      {/* Drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="flex-1 bg-black/40" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div className="w-full max-w-md bg-card border-l border-border flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-yellow-500/10">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-yellow-400" />
                <span className="font-semibold text-sm">Human Control Panel</span>
              </div>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab bar */}
            <div className="flex overflow-x-auto border-b border-border">
              {TABS.map(({ id, label, icon: Icon, badge }) => (
                <button key={id} onClick={() => setTab(id)}
                  className={cn('flex-shrink-0 flex flex-col items-center gap-0.5 px-3 py-2.5 text-xs border-b-2 transition-colors relative',
                    tab === id ? 'border-yellow-400 text-yellow-400' : 'border-transparent text-muted-foreground hover:text-foreground')}
                >
                  <span className="relative">
                    <Icon className="w-3.5 h-3.5" />
                    {badge != null && badge > 0 && (
                      <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold leading-none">
                        {badge > 9 ? '9+' : badge}
                      </span>
                    )}
                  </span>
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {/* Tab description */}
            <div className="px-4 py-2 bg-secondary/50 text-xs text-muted-foreground">
              {TABS.find((t) => t.id === tab)?.desc}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">

              {/* ── MESSAGE AGENT ───────────────────────────────── */}
              {tab === 'message' && (
                <>
                  <Select label="Agent" value={selectedAgent} onChange={setSelectedAgent}
                    options={agents.map((a: any) => ({ value: a.id, label: `${a.name} (${a.status})` }))}
                    placeholder="Select agent..." />
                  <Select label="Project" value={selectedProject} onChange={setSelectedProject}
                    options={projects.map((p: any) => ({ value: p.id, label: p.name }))}
                    placeholder="Select project..." />
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Message / Question / Advice</label>
                    <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5}
                      placeholder="E.g. 'Focus on the European market only', 'I have additional data: Q3 revenue was $2.4M', 'What approach are you taking for the risk assessment?'"
                      className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
                    <p className="text-xs text-muted-foreground mt-1">The agent will receive this before its next response.</p>
                  </div>
                  <Btn onClick={() => msgMutation.mutate()} loading={msgMutation.isPending} disabled={!selectedAgent || !message || !selectedProject} icon={Send}>
                    Send to Agent
                  </Btn>
                </>
              )}

              {/* ── OVERRIDE TASK ───────────────────────────────── */}
              {tab === 'override' && (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Task ID</label>
                    <input value={taskId} onChange={(e) => setTaskId(e.target.value)}
                      placeholder="Paste task ID from the project view"
                      className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">New Description (leave blank to keep current)</label>
                    <textarea value={taskOverrides.description} onChange={(e) => setTaskOverrides((o) => ({ ...o, description: e.target.value }))} rows={4}
                      placeholder="Updated task instructions..."
                      className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm resize-none" />
                  </div>
                  <Select label="Reassign to Agent (optional)" value={taskOverrides.assignedAgentId}
                    onChange={(v) => setTaskOverrides((o) => ({ ...o, assignedAgentId: v }))}
                    options={agents.map((a: any) => ({ value: a.id, label: a.name }))} placeholder="Keep current agent" />
                  <Select label="Priority (optional)" value={taskOverrides.priority}
                    onChange={(v) => setTaskOverrides((o) => ({ ...o, priority: v }))}
                    options={[{ value: 'CRITICAL', label: 'Critical' }, { value: 'HIGH', label: 'High' }, { value: 'MEDIUM', label: 'Medium' }, { value: 'LOW', label: 'Low' }]}
                    placeholder="Keep current priority" />
                  <Btn onClick={() => overrideMutation.mutate()} loading={overrideMutation.isPending} disabled={!taskId} icon={Edit3}>
                    Override & Re-run
                  </Btn>
                </>
              )}

              {/* ── DEPARTMENT CONTROL ──────────────────────────── */}
              {tab === 'department' && (
                <>
                  <Select label="Project" value={selectedProject} onChange={setSelectedProject}
                    options={projects.map((p: any) => ({ value: p.id, label: p.name }))} placeholder="Select project..." />
                  <Select label="Department" value={department} onChange={setDepartment}
                    options={departments.map((d) => ({ value: d, label: d }))} placeholder="Select department..." />
                  <p className="text-xs text-muted-foreground">
                    Pausing stops all agents in this department and halts their queued tasks. You can resume at any time.
                  </p>
                  <div className="flex gap-2">
                    <Btn onClick={() => pauseMutation.mutate('pause')} loading={pauseMutation.isPending} disabled={!selectedProject || !department} icon={Pause} variant="danger">
                      Pause Dept
                    </Btn>
                    <Btn onClick={() => pauseMutation.mutate('resume')} loading={pauseMutation.isPending} disabled={!selectedProject || !department} icon={Play} variant="success">
                      Resume Dept
                    </Btn>
                  </div>
                </>
              )}

              {/* ── INJECT KNOWLEDGE ────────────────────────────── */}
              {tab === 'context' && (
                <>
                  <Select label="Agent" value={selectedAgent} onChange={setSelectedAgent}
                    options={agents.map((a: any) => ({ value: a.id, label: a.name }))} placeholder="Select agent..." />
                  <Select label="Project (optional — leave blank for global)" value={selectedProject} onChange={setSelectedProject}
                    options={projects.map((p: any) => ({ value: p.id, label: p.name }))} placeholder="Global memory" />
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Memory Key</label>
                    <input value={contextKey} onChange={(e) => setContextKey(e.target.value)}
                      placeholder="e.g. client_preferences, market_data, constraints"
                      className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Knowledge / Value</label>
                    <textarea value={contextValue} onChange={(e) => setContextValue(e.target.value)} rows={5}
                      placeholder='E.g. "Client budget is $500K. They prefer conservative strategies. Key contact: John Smith."'
                      className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm resize-none" />
                  </div>
                  <Btn onClick={() => contextMutation.mutate()} loading={contextMutation.isPending} disabled={!selectedAgent || !contextKey || !contextValue} icon={BrainCircuit}>
                    Inject into Memory
                  </Btn>
                </>
              )}

              {/* ── REDIRECT TASK ───────────────────────────────── */}
              {tab === 'redirect' && (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Task ID</label>
                    <input value={redirectTaskId} onChange={(e) => setRedirectTaskId(e.target.value)}
                      placeholder="Task ID to redirect"
                      className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm" />
                  </div>
                  <Select label="Redirect to Agent" value={redirectAgent} onChange={setRedirectAgent}
                    options={agents.map((a: any) => ({ value: a.id, label: `${a.name} (${a.status})` }))} placeholder="Select new agent..." />
                  <Btn onClick={() => redirectMutation.mutate()} loading={redirectMutation.isPending} disabled={!redirectTaskId || !redirectAgent} icon={ArrowRightLeft}>
                    Redirect Task
                  </Btn>
                </>
              )}

              {/* ── HITL QUESTIONS ──────────────────────────────── */}
              {tab === 'questions' && (
                <>
                  {(questions as any[]).length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                      <CheckCircle2 className="w-8 h-8 opacity-40" />
                      <p className="text-sm">No pending questions from agents.</p>
                      <p className="text-xs opacity-60">Agents will appear here when they need your input.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(questions as any[]).map((q) => (
                        <div key={q.questionId} className={cn(
                          'rounded-lg border p-3 space-y-2.5',
                          q.status === 'pending' ? 'border-yellow-500/40 bg-yellow-500/5' : 'border-border bg-secondary/30 opacity-60',
                        )}>
                          {/* Header */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium text-foreground">{q.agentName ?? 'Agent'}</span>
                              <UrgencyBadge urgency={q.urgency} />
                            </div>
                            {q.status === 'answered'
                              ? <span className="flex items-center gap-1 text-[10px] text-green-400"><CheckCircle2 className="w-3 h-3" /> Answered</span>
                              : <span className="flex items-center gap-1 text-[10px] text-yellow-400"><Clock className="w-3 h-3" /> Waiting</span>
                            }
                          </div>

                          {/* Question */}
                          <p className="text-sm text-foreground leading-relaxed">{q.question}</p>

                          {/* Answered: show the reply */}
                          {q.status === 'answered' && q.answer && (
                            <div className="text-xs text-green-300 bg-green-950/30 rounded px-2 py-1.5">
                              <span className="font-medium">Your reply:</span> {q.answer}
                            </div>
                          )}

                          {/* Pending: reply input */}
                          {q.status === 'pending' && (
                            <div className="space-y-1.5">
                              <textarea
                                value={answers[q.questionId] ?? ''}
                                onChange={(e) => setAnswers((a) => ({ ...a, [q.questionId]: e.target.value }))}
                                rows={3}
                                placeholder="Type your answer..."
                                className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                              <button
                                onClick={() => replyMutation.mutate({ questionId: q.questionId, answer: answers[q.questionId] ?? '' })}
                                disabled={!answers[q.questionId]?.trim() || replyMutation.isPending}
                                className="flex items-center gap-1.5 text-xs font-medium bg-yellow-500 hover:bg-yellow-400 text-black px-3 py-1.5 rounded disabled:opacity-50 transition-colors"
                              >
                                {replyMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                Send Reply
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Small UI helpers ──────────────────────────────────────────────────────────

function Select({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>; placeholder: string;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function UrgencyBadge({ urgency }: { urgency?: string }) {
  const u = (urgency ?? 'medium').toLowerCase();
  const styles: Record<string, string> = {
    critical: 'bg-red-500/20 text-red-400 border-red-500/30',
    high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  };
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize', styles[u] ?? styles.medium)}>
      {u === 'critical' || u === 'high' ? <AlertTriangle className="w-2.5 h-2.5" /> : null}
      {u}
    </span>
  );
}

function Btn({ onClick, loading, disabled, icon: Icon, children, variant = 'primary' }: {
  onClick: () => void; loading: boolean; disabled?: boolean;
  icon: React.ElementType; children: React.ReactNode; variant?: 'primary' | 'danger' | 'success';
}) {
  const colors = { primary: 'bg-primary text-primary-foreground hover:bg-primary/90', danger: 'bg-red-600 text-white hover:bg-red-500', success: 'bg-green-600 text-white hover:bg-green-500' };
  return (
    <button onClick={onClick} disabled={disabled || loading}
      className={cn('flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm font-medium disabled:opacity-50', colors[variant])}>
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
      {loading ? 'Working...' : children}
    </button>
  );
}
