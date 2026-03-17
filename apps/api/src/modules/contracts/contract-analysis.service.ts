import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../utils/logger';

const client = new Anthropic();

export interface ClauseItem {
  name: string;
  plainEnglish: string;
  risk: 'low' | 'medium' | 'high';
}

export interface RedFlagItem {
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
}

export interface AnalysisResult {
  riskScore: number;
  summary: string;
  clauses: ClauseItem[];
  redFlags: RedFlagItem[];
  missingClauses: string[];
}

const SYSTEM_PROMPT = 'You are a contract risk analyst. Return ONLY valid JSON.';

function buildUserPrompt(text: string): string {
  return `Analyze this contract and return JSON with:
riskScore (0-100),
summary (2-3 sentences plain English),
clauses (array: name, plainEnglish, risk: low/medium/high),
redFlags (array: title, description, severity: low/medium/high),
missingClauses (array of strings)

Contract text:
${text}`;
}

function trimText(rawText: string): string {
  if (rawText.length <= 15000) return rawText;
  return (
    rawText.slice(0, 7500) +
    '\n\n...[middle section omitted for length]...\n\n' +
    rawText.slice(-7500)
  );
}

function parseClaudeResponse(text: string): AnalysisResult {
  // Strip markdown code fences if Claude wraps the JSON
  const clean = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  return JSON.parse(clean) as AnalysisResult;
}

async function callClaude(text: string): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(text) }],
  });
  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected Claude response type');
  return block.text;
}

export async function analyzeContract(rawText: string): Promise<AnalysisResult> {
  const text = trimText(rawText);

  let responseText: string;
  try {
    responseText = await callClaude(text);
  } catch (err) {
    logger.error({ err }, '[ContractAnalysis] Claude API call failed');
    throw err;
  }

  try {
    return parseClaudeResponse(responseText);
  } catch (parseErr) {
    logger.warn({ parseErr }, '[ContractAnalysis] First JSON parse failed — retrying');

    let retryText: string;
    try {
      retryText = await callClaude(text);
    } catch (retryApiErr) {
      logger.error({ retryApiErr }, '[ContractAnalysis] Claude API call failed on retry');
      throw retryApiErr;
    }

    try {
      return parseClaudeResponse(retryText);
    } catch (retryParseErr) {
      logger.error({ retryParseErr }, '[ContractAnalysis] JSON parse failed on retry');
      throw new Error('INVALID_JSON');
    }
  }
}
