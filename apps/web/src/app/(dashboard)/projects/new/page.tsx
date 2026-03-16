'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../../lib/api-client';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { PIPELINE_PHASES } from '../../../../components/project/next-steps-panel';

type TaskDraft = { title: string; description: string; department: string; priority: string };

export default function NewProjectPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName] = useState(params.get('name') ?? '');
  const [goal, setGoal] = useState(params.get('goal') ?? '');
  const prefillPhaseId = params.get('phase');
  const prefillPhase = prefillPhaseId ? PIPELINE_PHASES.find((p) => p.id === prefillPhaseId) : null;
  const [ceoPlan, setCeoPlan] = useState(true); // let CEO auto-plan by default
  const [tasks, setTasks] = useState<TaskDraft[]>([]);

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => apiClient.get('/agents').then((r) => r.data),
  });

  const departments = [...new Set(agents.map((a: any) => a.department).filter(Boolean))] as string[];

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: project } = await apiClient.post('/projects', { name, goal });
      if (!ceoPlan && tasks.length > 0) {
        for (const t of tasks) {
          await apiClient.post(`/projects/${project.id}/tasks`, {
            title: t.title,
            description: t.description,
            department: t.department || undefined,
            priority: t.priority || 'MEDIUM',
          });
        }
      }
      return project;
    },
    onSuccess: (project) => {
      toast.success('Project created!');
      router.push(`/projects/${project.id}`);
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Failed to create project'),
  });

  const addTask = () => setTasks((prev) => [...prev, { title: '', description: '', department: '', priority: 'MEDIUM' }]);
  const removeTask = (i: number) => setTasks((prev) => prev.filter((_, idx) => idx !== i));
  const updateTask = (i: number, field: keyof TaskDraft, val: string) =>
    setTasks((prev) => prev.map((t, idx) => idx === i ? { ...t, [field]: val } : t));

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/projects" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-lg font-semibold">New Project</h1>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        {/* Phase context banner */}
        {prefillPhase && (
          <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${prefillPhase.bg} ${prefillPhase.color}`}>
            {(() => { const Icon = prefillPhase.icon; return <Icon className="w-3.5 h-3.5 flex-shrink-0" />; })()}
            <span>Pipeline phase: <strong>{prefillPhase.label}</strong> — {prefillPhase.description}</span>
          </div>
        )}
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Project Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required
            placeholder="e.g. Q3 Market Expansion Strategy"
            className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">Goal / Brief *</label>
          <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={4}
            placeholder="Describe what you want to achieve. The CEO agent will use this to plan and delegate tasks autonomously."
            className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>

        {/* Planning mode */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground block">Task Planning</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setCeoPlan(true)}
              className={`rounded-lg border px-3 py-3 text-left text-sm transition-colors ${ceoPlan ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-border/80'}`}>
              <div className="font-medium">🤖 Let CEO Plan</div>
              <div className="text-xs mt-0.5 opacity-70">AI decomposes goal into tasks automatically</div>
            </button>
            <button type="button" onClick={() => setCeoPlan(false)}
              className={`rounded-lg border px-3 py-3 text-left text-sm transition-colors ${!ceoPlan ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-border/80'}`}>
              <div className="font-medium">✍️ Manual Tasks</div>
              <div className="text-xs mt-0.5 opacity-70">Define tasks yourself before launching</div>
            </button>
          </div>
        </div>

        {/* Manual task list */}
        {!ceoPlan && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">Tasks</label>
              <button type="button" onClick={addTask}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                <Plus className="w-3 h-3" /> Add Task
              </button>
            </div>
            {tasks.length === 0 && (
              <p className="text-xs text-muted-foreground italic">No tasks yet — click Add Task</p>
            )}
            {tasks.map((t, i) => (
              <div key={i} className="bg-secondary rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input value={t.title} onChange={(e) => updateTask(i, 'title', e.target.value)}
                    placeholder={`Task ${i + 1} title`}
                    className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
                  <button type="button" onClick={() => removeTask(i)} className="text-red-400 hover:text-red-300">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <textarea value={t.description} onChange={(e) => updateTask(i, 'description', e.target.value)}
                  placeholder="Task description / instructions..." rows={2}
                  className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
                <div className="flex gap-2">
                  <select value={t.department} onChange={(e) => updateTask(i, 'department', e.target.value)}
                    className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="">Any department</option>
                    {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select value={t.priority} onChange={(e) => updateTask(i, 'priority', e.target.value)}
                    className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => createMutation.mutate()}
          disabled={!name || !goal || createMutation.isPending}
          className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
          {createMutation.isPending ? 'Creating...' : 'Create Project'}
        </button>
      </div>
    </div>
  );
}
