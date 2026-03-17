'use client';
import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  FileText,
  Send,
  Loader2,
  ArrowLeft,
  Info,
} from 'lucide-react';
import { apiClient } from '../../../../lib/api-client';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ClauseItem {
  name: string;
  plainEnglish: string;
  risk: 'low' | 'medium' | 'high';
}

interface RedFlagItem {
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
}

interface ContractDetail {
  id: string;
  filename: string;
  status: 'PENDING' | 'ANALYZING' | 'DONE' | 'FAILED';
  createdAt: string;
  analysis: {
    riskScore: number;
    summary: string;
    clauses: ClauseItem[];
    redFlags: RedFlagItem[];
    missingClauses: string[];
  } | null;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ChatHistory {
  id: string;
  messages: ChatMessage[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const RISK_BADGE: Record<string, string> = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-red-100 text-red-700',
};

const SEVERITY_ICON: Record<string, React.ReactNode> = {
  low: <Info className="h-4 w-4 text-blue-500" />,
  medium: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
  high: <AlertCircle className="h-4 w-4 text-red-500" />,
};

function RiskGauge({ score }: { score: number }) {
  const color = score <= 33 ? '#16a34a' : score <= 66 ? '#ca8a04' : '#dc2626';
  const label = score <= 33 ? 'Low Risk' : score <= 66 ? 'Medium Risk' : 'High Risk';
  const bg = score <= 33 ? 'bg-green-50 border-green-200' : score <= 66 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200';

  return (
    <div className={`flex flex-col items-center justify-center rounded-xl border p-6 ${bg}`}>
      <svg viewBox="0 0 100 60" className="w-36">
        {/* Track */}
        <path d="M10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#e5e7eb" strokeWidth="10" strokeLinecap="round" />
        {/* Fill */}
        <path
          d="M10 50 A 40 40 0 0 1 90 50"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * 125.6} 125.6`}
        />
        {/* Score text */}
        <text x="50" y="55" textAnchor="middle" fontSize="18" fontWeight="700" fill={color}>
          {score}
        </text>
      </svg>
      <p className="mt-1 text-sm font-semibold" style={{ color }}>{label}</p>
      <p className="text-xs text-muted-foreground mt-0.5">Risk Score out of 100</p>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const [chatInput, setChatInput] = useState('');
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);

  const { data: contract, isLoading, isError } = useQuery<ContractDetail>({
    queryKey: ['contract', id],
    queryFn: () => apiClient.get(`/contracts/${id}`).then((r) => r.data),
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status === 'PENDING' || status === 'ANALYZING' ? 3000 : false;
    },
  });

  const { data: chatHistory } = useQuery<ChatHistory>({
    queryKey: ['contract-chat', id],
    queryFn: () => apiClient.get(`/contracts/${id}/chat`).then((r) => r.data),
    enabled: contract?.status === 'DONE',
  });

  useEffect(() => {
    if (chatHistory?.messages) {
      setLocalMessages(chatHistory.messages);
    }
  }, [chatHistory]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [localMessages]);

  const sendMessage = useMutation({
    mutationFn: (message: string) =>
      apiClient.post(`/contracts/${id}/chat`, { message }).then((r) => r.data as ChatMessage),
    onMutate: (message) => {
      const userMsg: ChatMessage = { role: 'user', content: message, timestamp: new Date().toISOString() };
      setLocalMessages((prev) => [...prev, userMsg]);
    },
    onSuccess: (assistantMsg) => {
      setLocalMessages((prev) => [...prev, assistantMsg]);
    },
  });

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const msg = chatInput.trim();
    if (!msg || sendMessage.isPending) return;
    setChatInput('');
    sendMessage.mutate(msg);
  }

  // ── Loading / Error states ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !contract) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="h-8 w-8 text-red-500" />
        <p className="text-sm text-muted-foreground">Contract not found or access denied.</p>
        <button onClick={() => router.push('/analyze')} className="text-sm text-primary hover:underline">
          Back to contracts
        </button>
      </div>
    );
  }

  if (contract.status === 'FAILED') {
    return (
      <div className="max-w-3xl mx-auto">
        <button onClick={() => router.push('/analyze')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <p className="font-medium text-red-700">Analysis Failed</p>
          <p className="text-sm text-red-600 mt-1">Claude could not parse this contract. Please try uploading again.</p>
        </div>
      </div>
    );
  }

  if (contract.status === 'PENDING' || contract.status === 'ANALYZING') {
    return (
      <div className="max-w-3xl mx-auto">
        <button onClick={() => router.push('/analyze')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="rounded-xl border border-border bg-card p-10 text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="font-medium">Analyzing "{contract.filename}"…</p>
          <p className="text-sm text-muted-foreground">Claude is reading your contract. This usually takes 15–30 seconds.</p>
        </div>
      </div>
    );
  }

  const analysis = contract.analysis!;

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div>
        <button onClick={() => router.push('/analyze')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to contracts
        </button>
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-muted-foreground shrink-0" />
          <h1 className="text-xl font-semibold truncate">{contract.filename}</h1>
        </div>
      </div>

      {/* Risk score + summary */}
      <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4">
        <RiskGauge score={analysis.riskScore} />
        <div className="rounded-xl border border-border bg-card p-6 flex flex-col justify-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Summary</p>
          <p className="text-sm leading-relaxed">{analysis.summary}</p>
        </div>
      </div>

      {/* Red Flags */}
      {analysis.redFlags.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold mb-3">
            <ShieldAlert className="h-4 w-4 text-red-500" /> Red Flags ({analysis.redFlags.length})
          </h2>
          <div className="space-y-3">
            {analysis.redFlags.map((flag, i) => (
              <div key={i} className="rounded-lg border border-border bg-card px-4 py-3">
                <div className="flex items-start gap-2">
                  {SEVERITY_ICON[flag.severity]}
                  <div>
                    <p className="text-sm font-medium">{flag.title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{flag.description}</p>
                  </div>
                  <span className={`ml-auto shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${RISK_BADGE[flag.severity]}`}>
                    {flag.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Missing Clauses */}
      {analysis.missingClauses.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold mb-3">
            <AlertTriangle className="h-4 w-4 text-yellow-500" /> Missing Clauses
          </h2>
          <ul className="rounded-xl border border-border bg-card divide-y divide-border">
            {analysis.missingClauses.map((clause, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 shrink-0" />
                {clause}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Clause Breakdown */}
      {analysis.clauses.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold mb-3">
            <CheckCircle2 className="h-4 w-4 text-blue-500" /> Clause Breakdown ({analysis.clauses.length})
          </h2>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-1/4">Clause</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Plain English</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-20">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {analysis.clauses.map((clause, i) => (
                  <tr key={i} className="bg-card">
                    <td className="px-4 py-3 font-medium align-top">{clause.name}</td>
                    <td className="px-4 py-3 text-muted-foreground align-top">{clause.plainEnglish}</td>
                    <td className="px-4 py-3 align-top">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${RISK_BADGE[clause.risk]}`}>
                        {clause.risk}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Chat */}
      <section>
        <h2 className="text-sm font-semibold mb-3">Ask a Question</h2>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Message history */}
          <div className="max-h-96 overflow-y-auto p-4 space-y-4">
            {localMessages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Ask anything about this contract — clauses, obligations, risks, or next steps.
              </p>
            ) : (
              localMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap
                      ${msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-muted text-foreground rounded-bl-sm'}`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))
            )}
            {sendMessage.isPending && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-2.5">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-border p-3">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about this contract…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              disabled={sendMessage.isPending}
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || sendMessage.isPending}
              className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
