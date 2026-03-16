'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api-client';
import Link from 'next/link';
import { Plus, FolderOpen, Play, Pause, CheckCircle, Trash2, BookTemplate } from 'lucide-react';
import { cn, STATUS_COLORS } from '../../../lib/utils';
import toast from 'react-hot-toast';

export default function ProjectsPage() {
  const qc = useQueryClient();
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiClient.get('/projects').then((r) => r.data),
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/projects/${id}/start`),
    onSuccess: (_, id) => { qc.invalidateQueries({ queryKey: ['projects'] }); toast.success('Project started — tasks queued'); },
    onError: (err: any) => toast.error(err.response?.data?.error),
  });
  const pauseMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/projects/${id}/pause`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); toast.success('Project paused'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/projects/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); toast.success('Project deleted'); },
    onError: () => toast.error('Failed to delete project'),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{projects.length} projects</p>
        <div className="flex gap-2">
          <Link href="/projects/ideas" className="flex items-center gap-2 border border-border text-foreground px-3 py-2 rounded-md text-sm font-medium hover:bg-secondary">
            💡 CEO Ideas
          </Link>
          <Link href="/projects/templates" className="flex items-center gap-2 border border-border text-foreground px-3 py-2 rounded-md text-sm font-medium hover:bg-secondary">
            <BookTemplate className="w-4 h-4" /> Templates
          </Link>
          <Link href="/projects/new" className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-2 rounded-md text-sm font-medium hover:bg-primary/90">
            <Plus className="w-4 h-4" /> New Project
          </Link>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No projects yet</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map((p: any) => {
            const status = p.status.toLowerCase();
            const pct = p._count?.tasks > 0 ? Math.round((p.completedTaskCount ?? 0) / p._count.tasks * 100) : 0;
            return (
              <div key={p.id} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className={cn('w-2 h-2 rounded-full flex-shrink-0', STATUS_COLORS[status] ?? 'bg-gray-400')} />
                      <Link href={`/projects/${p.id}`} className="font-semibold text-sm hover:text-primary truncate">
                        {p.name}
                      </Link>
                      <span className="text-xs text-muted-foreground capitalize ml-1">{status}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{p.goal}</p>
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{p._count?.tasks ?? 0} tasks</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-1 bg-secondary rounded-full">
                        <div className="h-1 bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 ml-4">
                    {status === 'draft' && (
                      <button onClick={() => startMutation.mutate(p.id)} className="p-1.5 rounded text-green-400 hover:bg-green-400/10" title="Start">
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {status === 'active' && (
                      <button onClick={() => pauseMutation.mutate(p.id)} className="p-1.5 rounded text-yellow-400 hover:bg-yellow-400/10" title="Pause">
                        <Pause className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {status === 'completed' && <CheckCircle className="w-4 h-4 text-green-400 mt-1.5" />}
                    <button
                      onClick={() => { if (confirm(`Delete "${p.name}"?`)) deleteMutation.mutate(p.id); }}
                      className="p-1.5 rounded text-red-400 hover:bg-red-400/10"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
