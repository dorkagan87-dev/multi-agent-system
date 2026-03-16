'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '../../../../lib/api-client';
import {
  ArrowLeft, Rocket, Trash2, Plus, ChevronDown, ChevronRight,
  BookTemplate, Loader2, X, Check, User,
} from 'lucide-react';
import { cn } from '../../../../lib/utils';
import toast from 'react-hot-toast';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TemplateTask {
  id: string;
  title: string;
  description: string;
  priority: string;
  department?: string;
  suggestedRole?: string;
  order: number;
}

interface Template {
  id: string;
  name: string;
  description: string;
  goal: string;
  category: string;
  icon: string;
  isBuiltIn: boolean;
  useCount: number;
  tasks: TemplateTask[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  research: 'bg-violet-500/15 text-violet-300 border-violet-500/20',
  product: 'bg-blue-500/15 text-blue-300 border-blue-500/20',
  marketing: 'bg-pink-500/15 text-pink-300 border-pink-500/20',
  finance: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
  engineering: 'bg-orange-500/15 text-orange-300 border-orange-500/20',
  custom: 'bg-secondary text-muted-foreground border-border',
  general: 'bg-secondary text-muted-foreground border-border',
};

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: 'bg-red-400',
  HIGH: 'bg-orange-400',
  MEDIUM: 'bg-blue-400',
  LOW: 'bg-muted-foreground',
};

// ── Launch Modal ──────────────────────────────────────────────────────────────

function LaunchModal({
  template,
  agents,
  onClose,
}: {
  template: Template;
  agents: { id: string; name: string; jobTitle?: string; department?: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [projectName, setProjectName] = useState(template.name);
  const [goal, setGoal] = useState(template.goal);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [showTasks, setShowTasks] = useState(false);

  // Collect unique suggested roles from tasks
  const roles = Array.from(
    new Set(template.tasks.map((t) => t.suggestedRole).filter(Boolean) as string[])
  );

  const launchMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/templates/${template.id}/launch`, {
        projectName,
        goal,
        agentAssignments: assignments,
      }).then((r) => r.data),
    onSuccess: (data: { projectId: string }) => {
      toast.success('Project launched!');
      router.push(`/projects/${data.projectId}`);
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Launch failed'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{template.icon}</span>
            <div>
              <h2 className="font-semibold text-sm">Launch from template</h2>
              <p className="text-xs text-muted-foreground">{template.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Project name */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Project name</label>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              placeholder="My project name"
            />
          </div>

          {/* Goal */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Project goal</label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={3}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
            />
          </div>

          {/* Agent assignments */}
          {roles.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground block mb-2">
                Assign agents <span className="opacity-60">(optional — can be done later)</span>
              </label>
              <div className="space-y-2">
                {roles.map((role) => (
                  <div key={role} className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs text-foreground truncate">{role}</span>
                    </div>
                    <select
                      value={assignments[role] ?? ''}
                      onChange={(e) => setAssignments((prev) => ({ ...prev, [role]: e.target.value }))}
                      className="flex-1 bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
                    >
                      <option value="">— Auto-assign —</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}{a.jobTitle ? ` · ${a.jobTitle}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Task preview */}
          <div>
            <button
              onClick={() => setShowTasks((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {showTasks ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              {template.tasks.length} tasks included
            </button>
            {showTasks && (
              <div className="mt-2 space-y-1.5 pl-4 border-l border-border">
                {template.tasks.map((t) => (
                  <div key={t.id} className="flex items-start gap-2">
                    <div className={cn('w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0', PRIORITY_DOT[t.priority] ?? 'bg-muted-foreground')} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium">{t.title}</p>
                      {t.suggestedRole && (
                        <p className="text-[10px] text-muted-foreground">{t.suggestedRole}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={() => launchMutation.mutate()}
            disabled={!projectName.trim() || launchMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {launchMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Rocket className="w-3.5 h-3.5" />
            )}
            Launch Project
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Template Card ─────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onLaunch,
  onDelete,
}: {
  template: Template;
  onLaunch: (t: Template) => void;
  onDelete?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const catCls = CATEGORY_COLORS[template.category] ?? CATEGORY_COLORS.general;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col hover:border-primary/40 transition-colors">
      <div className="p-5 flex-1 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{template.icon}</span>
            <div>
              <h3 className="font-semibold text-sm leading-tight">{template.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border capitalize font-medium', catCls)}>
                  {template.category}
                </span>
                <span className="text-[10px] text-muted-foreground">{template.tasks.length} tasks</span>
                {template.useCount > 0 && (
                  <span className="text-[10px] text-muted-foreground">{template.useCount}× used</span>
                )}
              </div>
            </div>
          </div>
          {!template.isBuiltIn && onDelete && (
            <button
              onClick={() => onDelete(template.id)}
              className="text-muted-foreground hover:text-red-400 p-1"
              title="Delete template"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Description */}
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {template.description}
        </p>

        {/* Task list (expandable) */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {expanded ? 'Hide' : 'Preview'} tasks
        </button>

        {expanded && (
          <div className="space-y-1.5 pl-3 border-l border-border">
            {template.tasks.map((t) => (
              <div key={t.id} className="flex items-start gap-2">
                <div className={cn('w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0', PRIORITY_DOT[t.priority] ?? 'bg-muted-foreground')} />
                <div>
                  <p className="text-xs leading-snug">{t.title}</p>
                  {t.suggestedRole && (
                    <p className="text-[10px] text-muted-foreground">{t.suggestedRole}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Launch button */}
      <div className="px-5 pb-4">
        <button
          onClick={() => onLaunch(template)}
          className="w-full flex items-center justify-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 hover:border-primary/40 rounded-lg py-2 text-sm font-medium transition-colors"
        >
          <Rocket className="w-3.5 h-3.5" />
          Launch
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [launching, setLaunching] = useState<Template | null>(null);

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ['templates'],
    queryFn: () => apiClient.get('/templates').then((r) => r.data),
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => apiClient.get('/agents').then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/templates/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates'] }); toast.success('Template deleted'); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Delete failed'),
  });

  const builtIn = templates.filter((t) => t.isBuiltIn);
  const custom = templates.filter((t) => !t.isBuiltIn);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/projects" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Project Templates</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              One-click project setup with pre-defined tasks and agent assignments
            </p>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading templates…</span>
        </div>
      )}

      {/* Built-in templates */}
      {builtIn.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Built-in Templates</h2>
            <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{builtIn.length}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {builtIn.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onLaunch={setLaunching}
              />
            ))}
          </div>
        </section>
      )}

      {/* User templates */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Your Templates</h2>
            {custom.length > 0 && (
              <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{custom.length}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Save any project as a template from its detail page
          </p>
        </div>

        {custom.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-10 text-center space-y-2">
            <BookTemplate className="w-8 h-8 mx-auto text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">No custom templates yet</p>
            <p className="text-xs text-muted-foreground">
              Open any project and click <strong>Save as Template</strong> to create one
            </p>
            <Link href="/projects" className="inline-block text-xs text-primary hover:underline mt-1">
              ← Go to Projects
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {custom.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onLaunch={setLaunching}
                onDelete={(id) => {
                  if (confirm('Delete this template?')) deleteMutation.mutate(id);
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* Launch modal */}
      {launching && (
        <LaunchModal
          template={launching}
          agents={agents}
          onClose={() => setLaunching(null)}
        />
      )}
    </div>
  );
}
