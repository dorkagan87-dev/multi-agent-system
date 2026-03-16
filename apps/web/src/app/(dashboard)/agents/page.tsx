'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api-client';
import Link from 'next/link';
import { Plus, Bot, Circle, Trash2, Power } from 'lucide-react';
import { cn, STATUS_COLORS, PROVIDER_ICONS } from '../../../lib/utils';
import toast from 'react-hot-toast';

export default function AgentsPage() {
  const qc = useQueryClient();
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => apiClient.get('/agents').then((r) => r.data),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiClient.post(`/agents/${id}/${enabled ? 'enable' : 'disable'}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agents'] }); toast.success('Agent updated'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/agents/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agents'] }); toast.success('Agent removed'); },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{agents.length} agents registered</p>
        <Link href="/agents/new" className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-2 rounded-md text-sm font-medium hover:bg-primary/90">
          <Plus className="w-4 h-4" /> Register Agent
        </Link>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading agents...</div>
      ) : agents.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No agents registered yet</p>
          <p className="text-sm mt-1">Register your first AI agent to get started</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {agents.map((agent: any) => (
            <div key={agent.id} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-lg">
                  {agent.avatarUrl ? <img src={agent.avatarUrl} className="rounded-full" alt="" /> : PROVIDER_ICONS[agent.provider.toLowerCase()] ?? '🤖'}
                </div>
                <div>
                  <Link href={`/agents/${agent.id}`} className="font-medium hover:text-primary text-sm">
                    {agent.name}
                  </Link>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className={cn('w-1.5 h-1.5 rounded-full', STATUS_COLORS[agent.status.toLowerCase()] ?? 'bg-gray-400')} />
                    <span className="text-xs text-muted-foreground capitalize">{agent.status.toLowerCase()}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{agent.modelId}</span>
                    {agent.jobTitle && <><span className="text-xs text-muted-foreground">·</span><span className="text-xs text-muted-foreground">{agent.jobTitle}</span></>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleMutation.mutate({ id: agent.id, enabled: agent.status === 'DISABLED' })}
                  className={cn('p-1.5 rounded-md text-xs', agent.status === 'DISABLED' ? 'text-green-400 hover:bg-green-400/10' : 'text-yellow-400 hover:bg-yellow-400/10')}
                  title={agent.status === 'DISABLED' ? 'Enable' : 'Disable'}
                >
                  <Power className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => { if (confirm('Remove agent?')) deleteMutation.mutate(agent.id); }}
                  className="p-1.5 rounded-md text-red-400 hover:bg-red-400/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
