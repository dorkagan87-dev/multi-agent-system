'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AGENT_TEMPLATES, AGENT_TEMPLATE_CATEGORIES } from '../../../../config/agent-templates';
import { Bot, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { cn } from '../../../../lib/utils';

export default function AgentTemplatesPage() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const categories = ['All', ...AGENT_TEMPLATE_CATEGORIES];

  const filtered = selectedCategory === 'All'
    ? AGENT_TEMPLATES
    : AGENT_TEMPLATES.filter((t) => t.category === selectedCategory);

  const handleUseTemplate = (templateId: string) => {
    const template = AGENT_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    sessionStorage.setItem('agent_template_preset', JSON.stringify(template));
    router.push('/agents/new');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/agents" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold">Agent Templates</h1>
          <p className="text-sm text-muted-foreground">Deploy a pre-configured AI agent in seconds</p>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
              selectedCategory === cat
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground',
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Template grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((template) => (
          <div
            key={template.id}
            className="bg-card border border-border rounded-lg p-5 flex flex-col gap-3 hover:border-primary/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-xl flex-shrink-0">
                  {template.icon}
                </div>
                <div>
                  <h3 className="font-medium text-sm">{template.name}</h3>
                  <span className="text-xs text-muted-foreground">{template.jobTitle} · {template.department}</span>
                </div>
              </div>
              <span className="text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded-full whitespace-nowrap">
                {template.category}
              </span>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">{template.description}</p>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="bg-secondary px-2 py-0.5 rounded capitalize">{template.provider}</span>
              <span className="bg-secondary px-2 py-0.5 rounded">{template.modelId}</span>
              <span className="bg-secondary px-2 py-0.5 rounded">temp {template.temperature}</span>
            </div>

            <button
              onClick={() => handleUseTemplate(template.id)}
              className="mt-auto w-full py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium"
            >
              Use Template
            </button>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No templates in this category</p>
        </div>
      )}
    </div>
  );
}
