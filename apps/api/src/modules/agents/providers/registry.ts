import { OpenAIProvider } from './openai.provider';
import { AnthropicProvider } from './anthropic.provider';
import { GoogleProvider } from './google.provider';
import { MistralProvider } from './mistral.provider';
import { CohereProvider } from './cohere.provider';
import type { IAgentProvider, IAgentImporter } from './provider.interface';

export type ProviderKey = 'openai' | 'anthropic' | 'google' | 'mistral' | 'cohere' | 'custom';

const providers: Record<string, IAgentProvider & Partial<IAgentImporter>> = {
  openai: new OpenAIProvider(),
  anthropic: new AnthropicProvider(),
  google: new GoogleProvider(),
  mistral: new MistralProvider(),
  cohere: new CohereProvider(),
};

export function getProvider(key: ProviderKey): IAgentProvider & Partial<IAgentImporter> {
  const p = providers[key];
  if (!p) throw new Error(`Unknown provider: ${key}`);
  return p;
}

export function getImporter(key: ProviderKey): IAgentImporter | null {
  const p = providers[key];
  if (!p || !('listImportableAgents' in p)) return null;
  return p as IAgentImporter;
}
