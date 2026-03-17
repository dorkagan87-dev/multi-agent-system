'use client';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api-client';
import { Bot, FolderOpen, CheckCircle, XCircle, Activity, Coins, Play } from 'lucide-react';
import { useRealtimeDashboard } from '../../../hooks/use-realtime-dashboard';
import { LiveActivityFeed } from '../../../components/live-activity-feed';
import { CEOStatusPanel } from '../../../components/ceo-status-panel';

export default function DashboardPage() {
  const { data: stats, refetch } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => apiClient.get('/dashboard/stats').then((r) => r.data),
    refetchInterval: 30_000,
  });

  // Subscribe to real-time updates
  useRealtimeDashboard(() => refetch());

  const cards = [
    { label: 'Registered Agents', value: stats?.totalAgents ?? 0, sub: `${stats?.activeAgents ?? 0} active`, icon: Bot, color: 'text-blue-400' },
    { label: 'Active Projects', value: stats?.activeProjects ?? 0, sub: `${stats?.totalProjects ?? 0} total`, icon: FolderOpen, color: 'text-green-400' },
    { label: 'Completed Today', value: stats?.completedTasksToday ?? 0, sub: 'tasks', icon: CheckCircle, color: 'text-emerald-400' },
    { label: 'Running Now', value: stats?.runningTasks ?? 0, sub: 'tasks in execution', icon: Activity, color: 'text-yellow-400' },
    { label: 'Failed Today', value: stats?.failedTasksToday ?? 0, sub: 'tasks', icon: XCircle, color: 'text-red-400' },
    { label: 'Tokens Used', value: (stats?.tokensUsedToday ?? 0).toLocaleString(), sub: 'today', icon: Coins, color: 'text-purple-400' },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="text-2xl font-bold mt-1">{c.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{c.sub}</p>
              </div>
              <c.icon className={`w-5 h-5 ${c.color}`} />
            </div>
          </div>
        ))}
      </div>

      {/* Queue stats */}
      {stats?.queue && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Play className="w-4 h-4 text-primary" /> Task Queue
          </h3>
          <div className="flex gap-6 text-sm">
            <Stat label="Waiting" value={stats.queue.waiting ?? 0} />
            <Stat label="Active" value={stats.queue.active ?? 0} />
            <Stat label="Completed" value={stats.queue.completed ?? 0} />
            <Stat label="Failed" value={stats.queue.failed ?? 0} />
          </div>
        </div>
      )}

      {/* CEO + Live Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CEOStatusPanel />
        <LiveActivityFeed />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
