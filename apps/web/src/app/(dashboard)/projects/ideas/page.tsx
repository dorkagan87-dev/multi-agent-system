'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../../lib/api-client';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Lightbulb, Loader2, Rocket, Clock, BarChart3, ArrowLeft } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import Link from 'next/link';

const COMPLEXITY_COLORS = {
  low: 'text-green-400 bg-green-400/10',
  medium: 'text-yellow-400 bg-yellow-400/10',
  high: 'text-red-400 bg-red-400/10',
};

export default function IdeaBoardPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [seedTopic, setSeedTopic] = useState('');
  const [ideas, setIdeas] = useState<any[]>([]);

  const generateMutation = useMutation({
    mutationFn: (data: { seedTopic?: string }) => apiClient.post('/sector/ideas', data),
    onSuccess: (res) => {
      setIdeas(res.data.ideas);
      toast.success(`${res.data.ideas.length} ideas generated!`);
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'No active agent available. Register an agent first.'),
  });

  const launchMutation = useMutation({
    mutationFn: async (idea: any) => {
      // Create project with the idea's goal
      const project = await apiClient.post('/projects', {
        name: idea.title,
        goal: idea.goal,
        description: `Business Impact: ${idea.businessImpact}`,
      });
      return project.data;
    },
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project created! Start it to let the CEO plan everything.');
      router.push(`/projects/${project.id}`);
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Failed to create project'),
  });

  const launchWithTasks = useMutation({
    mutationFn: async (idea: any) => {
      // Create project + all suggested tasks
      const project = await apiClient.post('/projects', {
        name: idea.title,
        goal: idea.goal,
        description: `Business Impact: ${idea.businessImpact}`,
      });
      for (const task of (idea.suggestedTasks ?? [])) {
        await apiClient.post(`/projects/${project.data.id}/tasks`, {
          title: task.title,
          description: task.description,
          priority: task.priority?.toUpperCase() ?? 'MEDIUM',
        });
      }
      return project.data;
    },
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project + tasks created! Press Start to run autonomously.');
      router.push(`/projects/${project.id}`);
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/projects" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h2 className="font-bold flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-yellow-400" /> CEO Idea Board
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Your CEO agent generates project ideas tailored to your sector and team — no input needed, or guide it with a topic.
          </p>
        </div>
      </div>

      {/* Generate input */}
      <div className="bg-card border border-border rounded-xl p-4 flex gap-3">
        <input
          value={seedTopic}
          onChange={(e) => setSeedTopic(e.target.value)}
          placeholder="Optional: focus area (e.g. 'reduce customer churn', 'Q2 growth') — or leave blank for CEO to choose"
          className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          onKeyDown={(e) => e.key === 'Enter' && generateMutation.mutate({ seedTopic: seedTopic || undefined })}
        />
        <button
          onClick={() => generateMutation.mutate({ seedTopic: seedTopic || undefined })}
          disabled={generateMutation.isPending}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {generateMutation.isPending
            ? <><Loader2 className="w-4 h-4 animate-spin" /> CEO is thinking...</>
            : <><Lightbulb className="w-4 h-4" /> Generate Ideas</>
          }
        </button>
      </div>

      {/* Loading state */}
      {generateMutation.isPending && (
        <div className="text-center py-12 text-muted-foreground">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
          <p className="font-medium text-sm">CEO is analyzing your company and sector...</p>
          <p className="text-xs mt-1">Generating tailored project ideas based on your team's capabilities</p>
        </div>
      )}

      {/* Idea cards */}
      {ideas.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{ideas.length} ideas ready — click to launch</p>
          <div className="grid gap-4">
            {ideas.map((idea, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-5 hover:border-primary/40 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm">{idea.title}</h3>
                      <span className={cn('text-xs px-2 py-0.5 rounded capitalize font-medium', COMPLEXITY_COLORS[idea.complexity as keyof typeof COMPLEXITY_COLORS] ?? '')}>
                        {idea.complexity}
                      </span>
                      <span className="text-xs bg-secondary px-2 py-0.5 rounded">{idea.department}</span>
                    </div>

                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{idea.goal}</p>

                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <BarChart3 className="w-3 h-3 text-green-400" />
                        {idea.businessImpact}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        ~{idea.estimatedDays} days
                      </span>
                    </div>

                    {/* Task preview */}
                    {idea.suggestedTasks?.length > 0 && (
                      <div className="mt-3 space-y-1">
                        <p className="text-xs text-muted-foreground font-medium">Suggested tasks ({idea.suggestedTasks.length}):</p>
                        <div className="flex flex-wrap gap-1.5">
                          {idea.suggestedTasks.slice(0, 5).map((t: any, j: number) => (
                            <span key={j} className="text-xs bg-secondary px-2 py-0.5 rounded text-muted-foreground">
                              {t.title}
                            </span>
                          ))}
                          {idea.suggestedTasks.length > 5 && (
                            <span className="text-xs text-muted-foreground">+{idea.suggestedTasks.length - 5} more</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button
                      onClick={() => launchWithTasks.mutate(idea)}
                      disabled={launchWithTasks.isPending || launchMutation.isPending}
                      className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                    >
                      <Rocket className="w-3 h-3" /> Launch with Tasks
                    </button>
                    <button
                      onClick={() => launchMutation.mutate(idea)}
                      disabled={launchWithTasks.isPending || launchMutation.isPending}
                      className="text-xs border border-border px-3 py-1.5 rounded-lg hover:bg-secondary text-muted-foreground"
                      title="Create project and let CEO plan all tasks autonomously"
                    >
                      Let CEO Plan
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {ideas.length === 0 && !generateMutation.isPending && (
        <div className="text-center py-20 text-muted-foreground">
          <Lightbulb className="w-16 h-16 mx-auto mb-4 opacity-10" />
          <p className="font-medium">No ideas yet</p>
          <p className="text-sm mt-1">Press Generate — your CEO will create sector-specific project proposals based on your team's capabilities</p>
          <p className="text-xs mt-3 max-w-sm mx-auto opacity-70">You can also set your industry sector in Settings to get more targeted ideas</p>
        </div>
      )}
    </div>
  );
}
