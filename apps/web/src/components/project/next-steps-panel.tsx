'use client';
import { useRouter } from 'next/navigation';
import { cn } from '../../lib/utils';
import {
  FlaskConical, Code2, Lightbulb, Factory, CheckCircle2,
  TrendingUp, Truck, ArrowRight, Rocket, ChevronRight,
} from 'lucide-react';

// ── Pipeline definition ───────────────────────────────────────────────────────

export const PIPELINE_PHASES = [
  {
    id: 'rnd',
    label: 'R&D',
    icon: FlaskConical,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10 border-violet-500/30',
    activeBg: 'bg-violet-500/20 border-violet-500',
    keywords: ['research', 'r&d', 'study', 'investigate', 'discover', 'analysis', 'data collection', 'feasibility', 'industry', 'market research', 'necessity'],
    description: 'Research, data gathering & feasibility studies',
    nextSuggestion: 'You have solid research. Time to develop a working product.',
    suggestedGoal: (prev: string) => `Based on the research findings, develop an MVP or prototype that addresses the key opportunities identified. Focus on core functionality and architecture.\n\nContext from previous phase:\n${prev.slice(0, 200)}`,
  },
  {
    id: 'develop',
    label: 'Develop',
    icon: Code2,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/30',
    activeBg: 'bg-blue-500/20 border-blue-500',
    keywords: ['develop', 'build', 'engineer', 'code', 'architect', 'software', 'mvp', 'engineering', 'technical', 'implementation', 'core product'],
    description: 'Building, coding & engineering the product',
    nextSuggestion: 'Development is done. Now push creative boundaries and differentiate.',
    suggestedGoal: (prev: string) => `Innovate on top of the developed product. Identify unique features, creative improvements, and differentiators that make this stand out in the market.\n\nContext from previous phase:\n${prev.slice(0, 200)}`,
  },
  {
    id: 'innovate',
    label: 'Innovate',
    icon: Lightbulb,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10 border-yellow-500/30',
    activeBg: 'bg-yellow-500/20 border-yellow-500',
    keywords: ['innovate', 'innovation', 'ideate', 'concept', 'creative', 'prototype', 'ux design', 'interface', 'idea', 'opportunity', 'differenti'],
    description: 'Innovation, ideation & creative differentiation',
    nextSuggestion: 'Great ideas locked in. Time to produce at scale.',
    suggestedGoal: (prev: string) => `Produce the final product at scale. Set up production pipelines, deployment infrastructure, and operational processes.\n\nContext from previous phase:\n${prev.slice(0, 200)}`,
  },
  {
    id: 'produce',
    label: 'Produce',
    icon: Factory,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10 border-orange-500/30',
    activeBg: 'bg-orange-500/20 border-orange-500',
    keywords: ['produce', 'production', 'manufacture', 'deploy', 'launch', 'release', 'ship', 'rollout', 'operational', 'infrastructure'],
    description: 'Production, deployment & operations',
    nextSuggestion: 'Product is live. Validate it works as expected before scaling.',
    suggestedGoal: (prev: string) => `Run a validation and QA phase. Collect user feedback, run tests, measure KPIs, and confirm the product meets its acceptance criteria before full-scale distribution.\n\nContext from previous phase:\n${prev.slice(0, 200)}`,
  },
  {
    id: 'validate',
    label: 'Validate',
    icon: CheckCircle2,
    color: 'text-green-400',
    bg: 'bg-green-500/10 border-green-500/30',
    activeBg: 'bg-green-500/20 border-green-500',
    keywords: ['validate', 'test', 'qa', 'quality', 'verify', 'feedback', 'pilot', 'user testing', 'compliance', 'legal', 'review'],
    description: 'QA, testing & validation',
    nextSuggestion: 'Validated and ready. Build the go-to-market strategy.',
    suggestedGoal: (prev: string) => `Develop a comprehensive sales strategy. Define target segments, pricing, sales channels, and revenue projections to bring the product to customers.\n\nContext from previous phase:\n${prev.slice(0, 200)}`,
  },
  {
    id: 'sales',
    label: 'Sales',
    icon: TrendingUp,
    color: 'text-pink-400',
    bg: 'bg-pink-500/10 border-pink-500/30',
    activeBg: 'bg-pink-500/20 border-pink-500',
    keywords: ['sales', 'sell', 'revenue', 'go-to-market', 'gtm', 'market strategy', 'pitch', 'customer', 'pricing', 'commercial'],
    description: 'Go-to-market, pricing & sales strategy',
    nextSuggestion: 'Sales strategy is ready. Scale with a full distribution plan.',
    suggestedGoal: (prev: string) => `Execute the distribution plan. Set up supply chains, partner networks, digital distribution channels, and marketing campaigns to reach customers at scale.\n\nContext from previous phase:\n${prev.slice(0, 200)}`,
  },
  {
    id: 'distribution',
    label: 'Distribution',
    icon: Truck,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10 border-cyan-500/30',
    activeBg: 'bg-cyan-500/20 border-cyan-500',
    keywords: ['distribut', 'scale', 'supply chain', 'channel', 'marketing', 'campaign', 'reach', 'global', 'partner', 'ship'],
    description: 'Distribution, scaling & market reach',
    nextSuggestion: 'Full cycle complete! Start a new R&D cycle for v2.',
    suggestedGoal: (prev: string) => `Start an R&D cycle for the next version. Analyze what worked, gather market signals, and identify the next opportunity to build on this success.\n\nContext from previous phase:\n${prev.slice(0, 200)}`,
  },
] as const;

// ── Phase inference ───────────────────────────────────────────────────────────

export function inferPhase(name: string, goal: string): number {
  const text = `${name} ${goal}`.toLowerCase();
  const scores = PIPELINE_PHASES.map((phase) => ({
    score: phase.keywords.filter((kw) => text.includes(kw)).length,
  }));
  const best = scores.reduce((max, s, i) => (s.score > scores[max].score ? i : max), 0);
  return scores[best].score > 0 ? best : 0; // default R&D if no match
}

// ── Component ─────────────────────────────────────────────────────────────────

interface NextStepsPanelProps {
  project: { id: string; name: string; goal: string; status: string };
  tasks: Array<{ outputSummary?: string }>;
}

export function NextStepsPanel({ project, tasks }: NextStepsPanelProps) {
  const router = useRouter();
  const currentPhaseIdx = inferPhase(project.name, project.goal);
  const currentPhase = PIPELINE_PHASES[currentPhaseIdx];
  const nextPhaseIdx = (currentPhaseIdx + 1) % PIPELINE_PHASES.length;
  const nextPhase = PIPELINE_PHASES[nextPhaseIdx];
  const isLastPhase = currentPhaseIdx === PIPELINE_PHASES.length - 1;

  // Collect output context from completed tasks
  const outputContext = tasks
    .filter((t) => t.outputSummary)
    .map((t) => t.outputSummary)
    .join('\n')
    .slice(0, 400);

  const handleLaunchNext = () => {
    const params = new URLSearchParams({
      name: `${project.name} — ${nextPhase.label}`,
      goal: nextPhase.suggestedGoal(outputContext || project.goal),
      phase: nextPhase.id,
    });
    router.push(`/projects/new?${params.toString()}`);
  };

  const handleJumpTo = (phaseIdx: number) => {
    const phase = PIPELINE_PHASES[phaseIdx];
    const params = new URLSearchParams({
      name: `${project.name} — ${phase.label}`,
      goal: phase.suggestedGoal(outputContext || project.goal),
      phase: phase.id,
    });
    router.push(`/projects/new?${params.toString()}`);
  };

  return (
    <div className="border border-green-500/30 bg-green-500/5 rounded-xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
          <Rocket className="w-4 h-4 text-green-400" />
        </div>
        <div>
          <h3 className="font-semibold text-sm text-green-400">Project Complete — What's Next?</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{currentPhase.nextSuggestion}</p>
        </div>
      </div>

      {/* Pipeline progress */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Your Pipeline</p>
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {PIPELINE_PHASES.map((phase, i) => {
            const Icon = phase.icon;
            const isDone = i < currentPhaseIdx;
            const isCurrent = i === currentPhaseIdx;
            const isNext = i === nextPhaseIdx && !isLastPhase;
            return (
              <div key={phase.id} className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => i > currentPhaseIdx && handleJumpTo(i)}
                  disabled={i <= currentPhaseIdx}
                  className={cn(
                    'flex flex-col items-center gap-1 px-2.5 py-2 rounded-lg border text-xs font-medium transition-all',
                    isCurrent && `${phase.activeBg} ${phase.color}`,
                    isDone && 'bg-secondary/50 border-green-500/20 text-green-400 opacity-70',
                    !isCurrent && !isDone && `${phase.bg} text-muted-foreground hover:text-foreground`,
                    isNext && 'ring-1 ring-offset-1 ring-offset-background ring-current opacity-100',
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{phase.label}</span>
                  {isDone && <span className="text-[9px] text-green-400">✓</span>}
                  {isCurrent && <span className="text-[9px] opacity-70">current</span>}
                  {isNext && <span className="text-[9px] text-yellow-400">next →</span>}
                </button>
                {i < PIPELINE_PHASES.length - 1 && (
                  <ChevronRight className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Next phase card */}
      <div className={cn('rounded-lg border p-4 space-y-3', nextPhase.bg)}>
        <div className="flex items-center gap-2">
          {(() => { const Icon = nextPhase.icon; return <Icon className={cn('w-4 h-4', nextPhase.color)} />; })()}
          <span className={cn('text-sm font-semibold', nextPhase.color)}>
            Next: {nextPhase.label} Phase
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{nextPhase.description}</p>
        <div className="bg-background/40 rounded p-2.5 text-xs text-muted-foreground font-mono leading-relaxed max-h-20 overflow-hidden relative">
          <span className="text-foreground/80">{nextPhase.suggestedGoal(outputContext || project.goal).slice(0, 180)}...</span>
          <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-background/60 to-transparent" />
        </div>
        <button
          onClick={handleLaunchNext}
          className={cn(
            'flex items-center gap-2 w-full justify-center py-2 rounded-lg text-sm font-semibold transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          <Rocket className="w-4 h-4" />
          Launch {nextPhase.label} Project
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Skip to any phase */}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Or jump directly to:</p>
        <div className="flex flex-wrap gap-2">
          {PIPELINE_PHASES.filter((_, i) => i !== currentPhaseIdx && i !== nextPhaseIdx).map((phase, _, arr) => {
            const phaseIdx = PIPELINE_PHASES.findIndex((p) => p.id === phase.id);
            const Icon = phase.icon;
            return (
              <button
                key={phase.id}
                onClick={() => handleJumpTo(phaseIdx)}
                className={cn(
                  'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors',
                  phase.bg, phase.color, 'hover:opacity-80',
                )}
              >
                <Icon className="w-3 h-3" />
                {phase.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
