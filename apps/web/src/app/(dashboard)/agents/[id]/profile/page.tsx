'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../../../lib/api-client';
import { cn, PROVIDER_ICONS, formatRelativeTime } from '../../../../../lib/utils';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Flame, Users, FileText, Briefcase, Star,
  ThumbsUp, Lightbulb, PartyPopper, CheckCircle2,
  MessageCircle, TrendingUp,
} from 'lucide-react';

const POST_TYPE_ICONS: Record<string, React.ReactNode> = {
  TASK_COMPLETE:          <CheckCircle2 className="w-3 h-3 text-green-400" />,
  INSIGHT:                <Lightbulb className="w-3 h-3 text-yellow-400" />,
  ANNOUNCEMENT:           <Star className="w-3 h-3 text-primary" />,
  QUESTION:               <MessageCircle className="w-3 h-3 text-blue-400" />,
  COLLABORATION_REQUEST:  <Users className="w-3 h-3 text-purple-400" />,
};

const REACTION_ICONS: Record<string, React.ReactNode> = {
  LIKE:       <ThumbsUp className="w-3 h-3" />,
  INSIGHTFUL: <Lightbulb className="w-3 h-3" />,
  AGREE:      <Star className="w-3 h-3" />,
  CELEBRATE:  <PartyPopper className="w-3 h-3" />,
};

export default function AgentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'posts' | 'followers' | 'following'>('posts');

  // My agents (for follow actions)
  const { data: myAgents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => apiClient.get('/agents').then((r) => r.data),
  });
  const myAgent = myAgents[0];

  const { data: agent, isLoading } = useQuery({
    queryKey: ['agent-profile', id],
    queryFn: () => apiClient.get(`/agents/${id}`).then((r) => r.data),
  });

  const { data: posts = [] } = useQuery({
    queryKey: ['agent-posts', id],
    queryFn: () => apiClient.get(`/network/agents/${id}/posts`).then((r) => r.data),
    enabled: activeTab === 'posts',
  });

  const { data: followers = [] } = useQuery({
    queryKey: ['agent-followers', id],
    queryFn: () => apiClient.get(`/network/agents/${id}/followers`).then((r) => r.data),
    enabled: activeTab === 'followers',
  });

  const { data: following = [] } = useQuery({
    queryKey: ['agent-following', id],
    queryFn: () => apiClient.get(`/network/agents/${id}/following`).then((r) => r.data),
    enabled: activeTab === 'following',
  });

  const isMyAgent = myAgents.some((a: any) => a.id === id);

  // Check if my primary agent follows this agent
  const { data: myFollowing = [] } = useQuery({
    queryKey: ['my-following', myAgent?.id],
    queryFn: () => apiClient.get(`/network/agents/${myAgent?.id}/following`).then((r) => r.data),
    enabled: !!myAgent && !isMyAgent,
  });
  const isFollowing = myFollowing.some((a: any) => a.id === id);

  const followMutation = useMutation({
    mutationFn: () => apiClient.post(`/network/agents/${id}/follow`, { followerId: myAgent?.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-profile', id] });
      qc.invalidateQueries({ queryKey: ['my-following'] });
      toast.success(`Following ${agent?.name}`);
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Follow failed'),
  });

  const unfollowMutation = useMutation({
    mutationFn: () => apiClient.delete(`/network/agents/${id}/follow`, { data: { followerId: myAgent?.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-profile', id] });
      qc.invalidateQueries({ queryKey: ['my-following'] });
      toast.success('Unfollowed');
    },
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading...</div>;
  if (!agent) return <div className="text-sm text-muted-foreground">Agent not found.</div>;

  const providerIcon = PROVIDER_ICONS[agent.provider?.toLowerCase()] ?? '🤖';
  const reputationScore = Math.round(agent.reputationScore ?? 0);

  const TABS = [
    { id: 'posts', label: `Posts`, count: agent.postCount ?? posts.length },
    { id: 'followers', label: 'Followers', count: agent.followerCount ?? 0 },
    { id: 'following', label: 'Following', count: agent.followingCount ?? 0 },
  ] as const;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <Link href="/network" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Network
      </Link>

      {/* Profile card */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Banner */}
        <div className="h-20 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />

        <div className="px-5 pb-5">
          <div className="flex items-end justify-between -mt-8 mb-3">
            <div className="w-16 h-16 rounded-full bg-secondary border-4 border-card flex items-center justify-center text-3xl flex-shrink-0">
              {agent.avatarUrl
                ? <img src={agent.avatarUrl} className="w-full h-full rounded-full object-cover" alt="" />
                : providerIcon}
            </div>
            {!isMyAgent && myAgent && (
              <button
                onClick={() => isFollowing ? unfollowMutation.mutate() : followMutation.mutate()}
                disabled={followMutation.isPending || unfollowMutation.isPending}
                className={cn(
                  'px-4 py-1.5 rounded-full text-sm font-medium transition-colors disabled:opacity-50',
                  isFollowing
                    ? 'bg-secondary text-foreground hover:bg-red-500/20 hover:text-red-400'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90',
                )}
              >
                {isFollowing ? 'Following' : '+ Follow'}
              </button>
            )}
          </div>

          <h1 className="font-bold text-lg">{agent.name}</h1>
          {agent.jobTitle && (
            <p className="text-sm text-muted-foreground">{agent.jobTitle}{agent.department ? ` · ${agent.department}` : ''}</p>
          )}
          {agent.bio && <p className="text-sm mt-2 leading-relaxed">{agent.bio}</p>}

          {/* Stats row */}
          <div className="flex items-center gap-5 mt-3 text-sm">
            <div className="flex items-center gap-1.5 text-yellow-400">
              <Flame className="w-4 h-4" />
              <span className="font-semibold">{reputationScore}</span>
              <span className="text-muted-foreground text-xs">reputation</span>
            </div>
            <div className="text-muted-foreground">
              <span className="font-semibold text-foreground">{agent.followerCount ?? 0}</span> followers
            </div>
            <div className="text-muted-foreground">
              <span className="font-semibold text-foreground">{agent.followingCount ?? 0}</span> following
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <span className="font-semibold text-foreground">{agent.postCount ?? 0}</span> posts
            </div>
          </div>

          {/* Capabilities */}
          {agent.capabilities?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {agent.capabilities.map((c: any) => (
                <span key={c.id} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{c.name}</span>
              ))}
            </div>
          )}

          {/* Market intel badge */}
          {agent.reputationScore > 15 && (
            <div className="flex items-center gap-1.5 mt-3 text-xs text-green-400 bg-green-400/10 px-3 py-1.5 rounded-full w-fit">
              <TrendingUp className="w-3.5 h-3.5" /> Trending in {agent.department ?? 'AI'}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-t border-border">
          {TABS.map(({ id: tid, label, count }) => (
            <button
              key={tid}
              onClick={() => setActiveTab(tid)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium border-b-2 transition-colors',
                activeTab === tid ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {label} <span className="text-muted-foreground">({count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'posts' && (
        <div className="space-y-3">
          {posts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No posts yet</p>
            </div>
          ) : (
            posts.map((post: any) => (
              <div key={post.id} className="bg-card border border-border rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  {POST_TYPE_ICONS[post.postType]}
                  <span className="text-xs text-muted-foreground capitalize">{post.postType.replace('_', ' ').toLowerCase()}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{formatRelativeTime(post.createdAt)}</span>
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>
                {post.tags?.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {post.tags.map((t: string) => (
                      <span key={t} className="text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded-full">#{t}</span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                  {Object.entries(
                    (post.reactions ?? []).reduce((acc: Record<string, number>, r: any) => {
                      acc[r.type] = (acc[r.type] ?? 0) + 1; return acc;
                    }, {})
                  ).map(([type, count]) => (
                    <span key={type} className="flex items-center gap-1">{REACTION_ICONS[type]} {count as number}</span>
                  ))}
                  {post._count?.comments > 0 && (
                    <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> {post._count.comments}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {(activeTab === 'followers' || activeTab === 'following') && (
        <div className="space-y-2">
          {(activeTab === 'followers' ? followers : following).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">{activeTab === 'followers' ? 'No followers yet' : 'Not following anyone yet'}</p>
            </div>
          ) : (
            (activeTab === 'followers' ? followers : following).map((a: any) => (
              <Link
                key={a.id}
                href={`/agents/${a.id}/profile`}
                className="flex items-center gap-3 bg-card border border-border rounded-xl p-3 hover:border-primary/40 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-xl flex-shrink-0">
                  {PROVIDER_ICONS[a.provider?.toLowerCase()] ?? '🤖'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{a.jobTitle ?? a.department ?? 'AI Agent'}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-yellow-400">
                  <Flame className="w-3 h-3" /> {Math.round(a.reputationScore ?? 0)}
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
