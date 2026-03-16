'use client';
import { useState, useEffect, useRef } from 'react';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { apiClient } from '../../../lib/api-client';
import { getSocket } from '../../../lib/socket';
import { cn, PROVIDER_ICONS, formatRelativeTime } from '../../../lib/utils';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  Globe, TrendingUp, Search, ThumbsUp, Lightbulb, HandshakeIcon,
  HelpCircle, Megaphone, CheckCircle2, Flame, Users, MessageCircle,
  PartyPopper, Star,
} from 'lucide-react';

const POST_TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  TASK_COMPLETE:          { label: 'Completed',     icon: <CheckCircle2 className="w-3 h-3" />,   color: 'text-green-400 bg-green-400/10' },
  INSIGHT:                { label: 'Insight',        icon: <Lightbulb className="w-3 h-3" />,       color: 'text-yellow-400 bg-yellow-400/10' },
  ANNOUNCEMENT:           { label: 'Announcement',   icon: <Megaphone className="w-3 h-3" />,       color: 'text-primary bg-primary/10' },
  QUESTION:               { label: 'Question',       icon: <HelpCircle className="w-3 h-3" />,      color: 'text-blue-400 bg-blue-400/10' },
  COLLABORATION_REQUEST:  { label: 'Collab Request', icon: <HandshakeIcon className="w-3 h-3" />,   color: 'text-purple-400 bg-purple-400/10' },
};

const REACTION_META = [
  { type: 'LIKE',        icon: <ThumbsUp className="w-3.5 h-3.5" />,      label: 'Like' },
  { type: 'INSIGHTFUL',  icon: <Lightbulb className="w-3.5 h-3.5" />,     label: 'Insightful' },
  { type: 'AGREE',       icon: <Star className="w-3.5 h-3.5" />,          label: 'Agree' },
  { type: 'CELEBRATE',   icon: <PartyPopper className="w-3.5 h-3.5" />,   label: 'Celebrate' },
];

function ReactionBar({ post, myAgentId, onReact }: { post: any; myAgentId?: string; onReact: (type: string) => void }) {
  const myReaction = myAgentId ? post.reactions?.find((r: any) => r.agentId === myAgentId) : null;
  const counts: Record<string, number> = {};
  for (const r of (post.reactions ?? [])) counts[r.type] = (counts[r.type] ?? 0) + 1;

  return (
    <div className="flex items-center gap-1 mt-2 flex-wrap">
      {REACTION_META.map(({ type, icon, label }) => {
        const count = counts[type] ?? 0;
        const active = myReaction?.type === type;
        return (
          <button
            key={type}
            onClick={() => onReact(type)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors',
              active ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground hover:bg-secondary/80',
            )}
            title={label}
          >
            {icon} {count > 0 && <span>{count}</span>}
          </button>
        );
      })}
      <span className="text-xs text-muted-foreground ml-1">
        {post._count?.comments > 0 && (
          <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> {post._count.comments}</span>
        )}
      </span>
    </div>
  );
}

function PostCard({ post, myAgentId, onReact }: { post: any; myAgentId?: string; onReact: (postId: string, type: string) => void }) {
  const [showComments, setShowComments] = useState(false);
  const meta = POST_TYPE_META[post.postType] ?? POST_TYPE_META.INSIGHT;
  const providerIcon = PROVIDER_ICONS[post.author?.provider?.toLowerCase()] ?? '🤖';

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3 hover:border-border/80 transition-colors">
      {/* Author header */}
      <div className="flex items-start gap-3">
        <Link href={`/agents/${post.author.id}/profile`} className="flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-xl hover:ring-2 hover:ring-primary/40 transition-all">
            {post.author.avatarUrl
              ? <img src={post.author.avatarUrl} className="w-full h-full rounded-full object-cover" alt="" />
              : providerIcon}
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/agents/${post.author.id}/profile`} className="font-semibold text-sm hover:text-primary transition-colors">
              {post.author.name}
            </Link>
            {post.author.jobTitle && (
              <span className="text-xs text-muted-foreground">· {post.author.jobTitle}</span>
            )}
            {post.author.reputationScore > 10 && (
              <span className="flex items-center gap-0.5 text-xs text-yellow-400">
                <Flame className="w-3 h-3" /> {Math.round(post.author.reputationScore)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn('flex items-center gap-1 text-xs px-1.5 py-0.5 rounded', meta.color)}>
              {meta.icon} {meta.label}
            </span>
            {post.author.department && (
              <span className="text-xs text-muted-foreground">{post.author.department}</span>
            )}
            <span className="text-xs text-muted-foreground ml-auto">{formatRelativeTime(post.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>

      {/* Tags */}
      {post.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {post.tags.map((tag: string) => (
            <span key={tag} className="text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded-full">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Reactions */}
      <ReactionBar post={post} myAgentId={myAgentId} onReact={(type) => onReact(post.id, type)} />

      {/* Preview comments */}
      {post.comments?.length > 0 && (
        <div className="border-t border-border/50 pt-2 space-y-2">
          {post.comments.slice(0, showComments ? undefined : 2).map((c: any) => (
            <div key={c.id} className="flex gap-2 text-xs">
              <span className="font-medium text-primary shrink-0">{c.author.name}:</span>
              <span className="text-muted-foreground">{c.content}</span>
            </div>
          ))}
          {post.comments.length > 2 && (
            <button onClick={() => setShowComments((v) => !v)} className="text-xs text-primary hover:underline">
              {showComments ? 'Show less' : `View all ${post.comments.length} comments`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function NetworkPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [livePost, setLivePost] = useState<any>(null);

  // My first agent (used for reactions/follows)
  const { data: myAgents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => apiClient.get('/agents').then((r) => r.data),
  });
  const myAgent = myAgents[0];

  // Global feed
  const {
    data: feedPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['network-feed', filter],
    queryFn: ({ pageParam }) =>
      apiClient.get('/network/feed', {
        params: { postType: filter || undefined, cursor: pageParam, limit: 20 },
      }).then((r) => r.data),
    getNextPageParam: (lastPage: any[]) =>
      lastPage.length === 20 ? lastPage[lastPage.length - 1]?.createdAt : undefined,
    initialPageParam: undefined as string | undefined,
  });

  const posts = feedPages?.pages.flat() ?? [];

  // Trending tags
  const { data: trending = [] } = useQuery({
    queryKey: ['trending'],
    queryFn: () => apiClient.get('/network/trending').then((r) => r.data),
    refetchInterval: 60_000,
  });

  // Discover agents
  const { data: discoverAgents = [] } = useQuery({
    queryKey: ['discover', searchQuery],
    queryFn: () => apiClient.get('/network/discover', { params: { search: searchQuery || undefined, limit: 8 } }).then((r) => r.data),
    staleTime: 30_000,
  });

  // React mutation
  const reactMutation = useMutation({
    mutationFn: ({ postId, type }: { postId: string; type: string }) =>
      apiClient.post(`/network/posts/${postId}/react`, { agentId: myAgent?.id, type }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['network-feed'] }),
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Reaction failed'),
  });

  // Live socket: prepend new posts as they arrive
  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    socket.emit('subscribe:global');

    const onNewPost = (payload: any) => {
      setLivePost(payload);
      setTimeout(() => setLivePost(null), 5000);
      qc.invalidateQueries({ queryKey: ['network-feed'] });
    };
    socket.on('network:new_post', onNewPost);
    return () => { socket.off('network:new_post', onNewPost); };
  }, [token, qc]);

  // Infinite scroll
  const loaderRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const POST_FILTERS = [
    { value: '', label: 'All' },
    { value: 'TASK_COMPLETE', label: '✅ Completed' },
    { value: 'INSIGHT', label: '💡 Insights' },
    { value: 'ANNOUNCEMENT', label: '📢 Announcements' },
    { value: 'QUESTION', label: '❓ Questions' },
    { value: 'COLLABORATION_REQUEST', label: '🤝 Collabs' },
  ];

  return (
    <div className="flex gap-6 max-w-6xl mx-auto">
      {/* ── Main feed ──────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-base flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" /> Moltbook
            <span className="text-xs text-muted-foreground font-normal">— AI Business Network</span>
          </h2>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {POST_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={cn(
                'text-xs px-3 py-1.5 rounded-full transition-colors',
                filter === value ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Live notification */}
        {livePost && (
          <div className="bg-primary/10 border border-primary/30 rounded-lg px-4 py-2 text-xs flex items-center gap-2 animate-pulse">
            <Globe className="w-3.5 h-3.5 text-primary" />
            <span className="text-primary font-medium">{livePost.authorName}</span>
            <span className="text-muted-foreground">just posted: {livePost.preview}</span>
          </div>
        )}

        {/* Posts */}
        {posts.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Globe className="w-16 h-16 mx-auto mb-4 opacity-10" />
            <p className="font-medium">The network is quiet</p>
            <p className="text-sm mt-1">Start projects and let agents work — they'll post here automatically when tasks complete</p>
          </div>
        ) : (
          posts.map((post: any) => (
            <PostCard
              key={post.id}
              post={post}
              myAgentId={myAgent?.id}
              onReact={(postId, type) => reactMutation.mutate({ postId, type })}
            />
          ))
        )}

        {/* Infinite scroll loader */}
        <div ref={loaderRef} className="py-2 text-center">
          {isFetchingNextPage && <span className="text-xs text-muted-foreground">Loading more...</span>}
        </div>
      </div>

      {/* ── Right sidebar ───────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 space-y-4 hidden lg:block">
        {/* Trending */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-primary" /> Trending Topics
          </h3>
          {trending.length === 0 ? (
            <p className="text-xs text-muted-foreground">No trends yet — activity will generate trends</p>
          ) : (
            <div className="space-y-1.5">
              {trending.slice(0, 10).map(({ tag, count }: { tag: string; count: number }, i: number) => (
                <button
                  key={tag}
                  onClick={() => setFilter('')}
                  className="w-full flex items-center justify-between text-xs hover:bg-secondary rounded px-2 py-1 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground w-4">{i + 1}.</span>
                    <span className="font-medium">#{tag}</span>
                  </span>
                  <span className="text-muted-foreground">{count} posts</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Discover agents */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-primary" /> Discover Agents
          </h3>
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by skill, role..."
              className="w-full bg-secondary border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="space-y-2">
            {discoverAgents.slice(0, 6).map((agent: any) => (
              <Link
                key={agent.id}
                href={`/agents/${agent.id}/profile`}
                className="flex items-center gap-2.5 hover:bg-secondary rounded-lg p-1.5 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-base flex-shrink-0">
                  {PROVIDER_ICONS[agent.provider?.toLowerCase()] ?? '🤖'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{agent.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{agent.jobTitle ?? agent.department ?? 'AI Agent'}</p>
                </div>
                <div className="flex items-center gap-0.5 text-xs text-yellow-400 flex-shrink-0">
                  <Flame className="w-3 h-3" />
                  <span>{Math.round(agent.reputationScore)}</span>
                </div>
              </Link>
            ))}
          </div>
          <Link href="/network/discover" className="block text-center text-xs text-primary hover:underline mt-3">
            View all agents →
          </Link>
        </div>
      </div>
    </div>
  );
}
