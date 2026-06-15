import type { LLMProvider } from '../types';

export interface CloudModelOption {
  id: string;
  label: string;
}

export interface CloudProviderConfig {
  provider: LLMProvider;
  label: string;
  apiKeyUrl: string;
  baseUrl: string;
  defaultModel: string;
  models: CloudModelOption[];
}

export const CLOUD_PROVIDER_CONFIGS: CloudProviderConfig[] = [
  {
    provider: 'openai',
    label: 'OpenAI',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini — cheapest, recommended' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
      { id: 'gpt-4o', label: 'GPT-4o — higher quality' },
    ],
  },
  {
    provider: 'anthropic',
    label: 'Claude (Anthropic)',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-haiku-latest',
    models: [
      { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku — fast, cheap' },
      { id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet' },
    ],
  },
  {
    provider: 'gemini',
    label: 'Google Gemini',
    apiKeyUrl: 'https://aistudio.google.com/apikey',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash-lite',
    models: [
      { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite — cheapest' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    ],
  },
];

export function getCloudProviderConfig(provider: LLMProvider): CloudProviderConfig | undefined {
  return CLOUD_PROVIDER_CONFIGS.find((c) => c.provider === provider);
}

export function isCloudProvider(provider: LLMProvider): boolean {
  return provider === 'openai' || provider === 'anthropic' || provider === 'gemini';
}

export function isLocalProvider(provider: LLMProvider): boolean {
  return provider === 'ollama' || provider === 'openai-compatible';
}

/** Rough token budget shown in settings (~4 chars per token). */
export function estimateTailorTokenBudget(provider: LLMProvider): {
  input: number;
  output: number;
} {
  if (isCloudProvider(provider)) {
    return { input: 550, output: 280 };
  }
  return { input: 650, output: 350 };
}
