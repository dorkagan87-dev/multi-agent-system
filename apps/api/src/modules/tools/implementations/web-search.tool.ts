import axios from 'axios';

export async function webSearchTool(input: Record<string, unknown>): Promise<string> {
  const query = input.query as string;
  const maxResults = (input.maxResults as number) ?? 5;
  if (!query) throw new Error('query is required');

  // Try providers in order of quality, use whichever key is configured
  if (process.env.TAVILY_API_KEY) {
    return tavilySearch(query, maxResults);
  }
  if (process.env.BRAVE_SEARCH_API_KEY) {
    return braveSearch(query, maxResults);
  }
  if (process.env.SERPER_API_KEY) {
    return serperSearch(query, maxResults);
  }

  // Free fallback: DuckDuckGo (limited but no key required)
  return duckduckgoSearch(query);
}

async function tavilySearch(query: string, maxResults: number): Promise<string> {
  const resp = await axios.post(
    'https://api.tavily.com/search',
    { query, max_results: maxResults, search_depth: 'basic', include_answer: true },
    { headers: { Authorization: `Bearer ${process.env.TAVILY_API_KEY}` }, timeout: 15000 }
  );
  const data = resp.data;
  const lines: string[] = [];
  if (data.answer) lines.push(`Answer: ${data.answer}\n`);
  for (const r of (data.results ?? []).slice(0, maxResults)) {
    lines.push(`[${r.title}](${r.url})\n${r.content?.slice(0, 300) ?? ''}`);
  }
  return lines.join('\n\n') || `No results found for: "${query}"`;
}

async function braveSearch(query: string, maxResults: number): Promise<string> {
  const resp = await axios.get('https://api.search.brave.com/res/v1/web/search', {
    params: { q: query, count: maxResults },
    headers: { 'Accept': 'application/json', 'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY },
    timeout: 15000,
  });
  const results = resp.data?.web?.results ?? [];
  if (!results.length) return `No results found for: "${query}"`;
  return results.slice(0, maxResults)
    .map((r: any) => `[${r.title}](${r.url})\n${r.description ?? ''}`)
    .join('\n\n');
}

async function serperSearch(query: string, maxResults: number): Promise<string> {
  const resp = await axios.post(
    'https://google.serper.dev/search',
    { q: query, num: maxResults },
    { headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 }
  );
  const data = resp.data;
  const lines: string[] = [];
  if (data.answerBox?.answer) lines.push(`Answer: ${data.answerBox.answer}\n`);
  for (const r of (data.organic ?? []).slice(0, maxResults)) {
    lines.push(`[${r.title}](${r.link})\n${r.snippet ?? ''}`);
  }
  return lines.join('\n\n') || `No results found for: "${query}"`;
}

async function duckduckgoSearch(query: string): Promise<string> {
  try {
    const resp = await axios.get('https://api.duckduckgo.com/', {
      params: { q: query, format: 'json', no_html: 1, skip_disambig: 1 },
      timeout: 10000,
    });
    const data = resp.data;
    const lines: string[] = [];
    if (data.AbstractText) lines.push(`Summary: ${data.AbstractText}`);
    if (data.Answer) lines.push(`Answer: ${data.Answer}`);
    for (const t of (data.RelatedTopics ?? []).slice(0, 5)) {
      if (t.Text) lines.push(`- ${t.Text}`);
    }
    if (lines.length > 0) return lines.join('\n');
  } catch {
    // fall through to guidance message
  }

  // No results — guide the agent to use its own knowledge rather than failing
  return `Web search returned no results for: "${query}". Use your training knowledge to answer this query as best you can, citing that this is based on your knowledge rather than live data.`;
}
