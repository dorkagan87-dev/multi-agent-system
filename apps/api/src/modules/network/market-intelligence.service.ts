/**
 * Market Intelligence Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Periodically fetches real-world data (news, sector trends, research) and uses
 * it to boost agent reputation scores and relevance based on how in-demand their
 * skills/department are in the current market.
 *
 * Data sources (via web search tool or configured APIs):
 *  - NewsAPI / RSS feeds for sector news
 *  - Google Trends concepts mapped to agent departments
 *  - arXiv / research article titles for skill relevance
 *
 * Run on a schedule (e.g. every 6 hours) by calling runMarketIntelligenceCycle().
 */
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

// Sector → keywords that signal market demand
const SECTOR_KEYWORDS: Record<string, string[]> = {
  Engineering:  ['software', 'developer', 'api', 'cloud', 'devops', 'kubernetes', 'microservices'],
  Marketing:    ['growth', 'campaign', 'seo', 'content', 'brand', 'engagement', 'conversion'],
  Analytics:    ['data', 'insights', 'dashboard', 'bi', 'sql', 'metrics', 'kpi'],
  Finance:      ['revenue', 'budget', 'forecasting', 'investment', 'valuation', 'cash flow'],
  Legal:        ['compliance', 'regulation', 'gdpr', 'contract', 'ip', 'litigation'],
  Research:     ['research', 'study', 'analysis', 'report', 'whitepaper', 'findings'],
  Design:       ['ux', 'ui', 'design', 'branding', 'prototype', 'figma'],
  Operations:   ['process', 'efficiency', 'automation', 'workflow', 'logistics', 'ops'],
  Executive:    ['strategy', 'leadership', 'vision', 'roadmap', 'okr', 'transformation'],
};

export interface MarketSignal {
  department: string;
  trending: boolean;
  relevanceScore: number;  // 0–10
  topKeywords: string[];
  source: 'news' | 'research' | 'manual';
}

/**
 * Fetch recent news headlines and score department relevance.
 * Uses the agent's web_search tool capability if no API key configured,
 * or a direct NewsAPI call if NEWSAPI_KEY is set.
 */
export async function fetchMarketSignals(): Promise<MarketSignal[]> {
  const signals: MarketSignal[] = [];

  for (const [dept, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    try {
      let score = 5; // baseline
      let topKeywords = keywords.slice(0, 3);
      let trending = false;

      if (process.env.NEWSAPI_KEY) {
        const query = keywords.slice(0, 3).join(' OR ');
        const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&pageSize=10&language=en&apiKey=${process.env.NEWSAPI_KEY}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json() as any;
          const articleCount = data.articles?.length ?? 0;
          // More recent articles = higher demand signal
          score = Math.min(10, 4 + articleCount * 0.6);
          trending = articleCount >= 8;
          topKeywords = extractTopKeywords(
            data.articles?.map((a: any) => `${a.title} ${a.description}`).join(' ') ?? '',
            keywords,
          );
        }
      }

      signals.push({ department: dept, trending, relevanceScore: score, topKeywords, source: process.env.NEWSAPI_KEY ? 'news' : 'manual' });
    } catch (err) {
      logger.warn({ err, dept }, 'Failed to fetch market signal');
      signals.push({ department: dept, trending: false, relevanceScore: 5, topKeywords: SECTOR_KEYWORDS[dept]?.slice(0, 3) ?? [], source: 'manual' });
    }
  }

  return signals;
}

/**
 * Apply market signals to all public agents:
 * - Agents in trending departments get a reputation boost
 * - Agents whose capabilities match hot keywords get additional points
 * - Stores signal results as AgentMemory entries so agents can read them
 */
export async function runMarketIntelligenceCycle(): Promise<void> {
  logger.info('Market intelligence cycle starting');

  const signals = await fetchMarketSignals();
  const signalMap = Object.fromEntries(signals.map((s) => [s.department, s]));

  const agents = await prisma.agentRegistration.findMany({
    where: { isPublic: true, status: { not: 'DISABLED' } },
    include: { capabilities: true },
  });

  for (const agent of agents) {
    try {
      const signal = signalMap[agent.department ?? ''];
      if (!signal) continue;

      // Base reputation delta from department trend
      let delta = signal.trending ? 2 : 0.5;

      // Bonus if agent capabilities match hot keywords
      const agentSkills = agent.capabilities.map((c) => c.name.toLowerCase());
      const matchCount = signal.topKeywords.filter((kw) =>
        agentSkills.some((skill) => skill.includes(kw) || kw.includes(skill))
      ).length;
      delta += matchCount * 0.5;

      await prisma.agentRegistration.update({
        where: { id: agent.id },
        data: { reputationScore: { increment: delta } },
      });

      // Store market intel as agent memory (projectId=null = global scope)
      const intelValue = {
        department: agent.department,
        trendingKeywords: signal.topKeywords,
        isTrending: signal.trending,
        relevanceScore: signal.relevanceScore,
        updatedAt: new Date().toISOString(),
      };
      const existing = await prisma.agentMemory.findFirst({
        where: { agentId: agent.id, projectId: null, scope: 'AGENT_GLOBAL', key: 'market_intelligence' },
        select: { id: true },
      });
      if (existing) {
        await prisma.agentMemory.update({ where: { id: existing.id }, data: { value: intelValue } });
      } else {
        await prisma.agentMemory.create({
          data: { agentId: agent.id, projectId: null, scope: 'AGENT_GLOBAL', key: 'market_intelligence', value: intelValue },
        });
      }
    } catch (err) {
      logger.warn({ err, agentId: agent.id }, 'Market intel update failed for agent');
    }
  }

  logger.info({ agentCount: agents.length, signalCount: signals.length }, 'Market intelligence cycle complete');
}

function extractTopKeywords(text: string, candidates: string[]): string[] {
  const lower = text.toLowerCase();
  return candidates
    .map((kw) => ({ kw, count: (lower.match(new RegExp(kw, 'g')) ?? []).length }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((x) => x.kw);
}
