import type { LLMSettings } from '../types';
import { chatOllama } from './ollama';
import { chatOpenAICompatible } from './openai-compatible';
import { chatOpenAI } from './openai-cloud';
import { chatAnthropic } from './anthropic';
import { chatGemini } from './gemini';
import { isCloudProvider } from './cloud-providers';
import type { ChatOptions } from './openai-cloud';

export type { ChatOptions };

export async function chatLLM(
  settings: LLMSettings,
  systemPrompt: string,
  userPrompt: string,
  options: ChatOptions = {},
): Promise<string> {
  switch (settings.provider) {
    case 'ollama':
      return chatOllama(settings, systemPrompt, userPrompt);
    case 'openai':
      return chatOpenAI(settings, systemPrompt, userPrompt, options);
    case 'anthropic':
      return chatAnthropic(settings, systemPrompt, userPrompt, options);
    case 'gemini':
      return chatGemini(settings, systemPrompt, userPrompt, options);
    case 'openai-compatible':
      return chatOpenAICompatible(settings, systemPrompt, userPrompt, options);
    default:
      throw new Error(`Unknown AI provider: ${settings.provider}`);
  }
}

export function usesJsonMode(settings: LLMSettings): boolean {
  if (isCloudProvider(settings.provider)) return true;
  return settings.provider === 'ollama';
}
