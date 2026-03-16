'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api-client';
import { useRouter } from 'next/navigation';
import { Search, Star, Bot, Zap } from 'lucide-react';
import { PROVIDER_ICONS } from '../../../lib/utils';

// Curated marketplace templates — these are pre-configured agent archetypes
// users can deploy as a starting point
const MARKETPLACE_TEMPLATES = [
  { id: 'ceo-agent', name: 'CEO Agent', role: 'Chief Executive', provider: 'anthropic', model: 'claude-opus-4-6', department: 'Executive', description: 'Strategic planning, team coordination, and high-level decision making. Delegates tasks to specialist agents.', capabilities: ['strategy', 'planning', 'leadership'], rating: 4.9, deploys: 1842 },
  { id: 'dev-agent', name: 'Senior Developer', role: 'Software Engineer', provider: 'anthropic', model: 'claude-sonnet-4-6', department: 'Engineering', description: 'Writes, reviews, and debugs code. Specializes in TypeScript, Python, and system design.', capabilities: ['python', 'typescript', 'code-review'], rating: 4.8, deploys: 3201 },
  { id: 'analyst-agent', name: 'Data Analyst', role: 'Business Analyst', provider: 'openai', model: 'gpt-4o', department: 'Analytics', description: 'Analyzes data, generates reports, creates visualizations, and provides business insights.', capabilities: ['data-analysis', 'sql', 'visualization'], rating: 4.7, deploys: 2156 },
  { id: 'marketing-agent', name: 'Marketing Strategist', role: 'Marketing Lead', provider: 'openai', model: 'gpt-4o', department: 'Marketing', description: 'Content creation, campaign planning, SEO strategy, and market research.', capabilities: ['content', 'seo', 'research'], rating: 4.6, deploys: 1623 },
  { id: 'legal-agent', name: 'Legal Advisor', role: 'Legal Counsel', provider: 'anthropic', model: 'claude-opus-4-6', department: 'Legal', description: 'Contract review, compliance checking, and legal research. Does not replace licensed attorneys.', capabilities: ['contracts', 'compliance', 'research'], rating: 4.5, deploys: 892 },
  { id: 'finance-agent', name: 'Financial Controller', role: 'Finance', provider: 'openai', model: 'gpt-4o', department: 'Finance', description: 'Financial modeling, budget analysis, forecasting, and reporting.', capabilities: ['financial-modeling', 'excel', 'forecasting'], rating: 4.7, deploys: 1104 },
  { id: 'researcher-agent', name: 'Research Specialist', role: 'Researcher', provider: 'google', model: 'gemini-1.5-pro', department: 'Research', description: 'Deep web research, competitive analysis, and summarizing complex topics.', capabilities: ['web-research', 'summarization', 'analysis'], rating: 4.8, deploys: 2780 },
  { id: 'pm-agent', name: 'Project Manager', role: 'PM', provider: 'anthropic', model: 'claude-sonnet-4-6', department: 'Operations', description: 'Task decomposition, timeline management, progress tracking, and cross-team coordination.', capabilities: ['planning', 'coordination', 'reporting'], rating: 4.6, deploys: 1455 },
];

const DEPARTMENTS = ['All', 'Executive', 'Engineering', 'Analytics', 'Marketing', 'Legal', 'Finance', 'Research', 'Operations'];

export default function MarketplacePage() {
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('All');
  const router = useRouter();

  const filtered = MARKETPLACE_TEMPLATES.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase());
    const matchesDept = dept === 'All' || t.department === dept;
    return matchesSearch && matchesDept;
  });

  const deployTemplate = (template: typeof MARKETPLACE_TEMPLATES[0]) => {
    // Pre-fill the new agent form via URL params
    const params = new URLSearchParams({
      name: template.name,
      modelId: template.model,
      provider: template.provider,
      jobTitle: template.role,
      department: template.department,
    });
    router.push(`/agents/new?${params}`);
  };

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents..."
            className="w-full bg-card border border-border rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {DEPARTMENTS.map((d) => (
            <button
              key={d}
              onClick={() => setDept(d)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium ${dept === d ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'}`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} agent templates available</p>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((template) => (
          <div key={template.id} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 hover:border-primary/50 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-xl">
                  {PROVIDER_ICONS[template.provider] ?? '🤖'}
                </div>
                <div>
                  <p className="font-semibold text-sm">{template.name}</p>
                  <p className="text-xs text-muted-foreground">{template.role}</p>
                </div>
              </div>
              <span className="text-xs bg-secondary px-2 py-0.5 rounded">{template.department}</span>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">{template.description}</p>

            <div className="flex flex-wrap gap-1">
              {template.capabilities.map((c) => (
                <span key={c} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">{c}</span>
              ))}
            </div>

            <div className="flex items-center justify-between mt-auto pt-2 border-t border-border">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Star className="w-3 h-3 text-yellow-400" />{template.rating}</span>
                <span className="flex items-center gap-1"><Zap className="w-3 h-3" />{template.deploys.toLocaleString()} deploys</span>
              </div>
              <button
                onClick={() => deployTemplate(template)}
                className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90"
              >
                Deploy
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
