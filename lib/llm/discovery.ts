import type { LLMProvider } from '../types';

export interface DiscoveredBackend {
  provider: LLMProvider;
  baseUrl: string;
  label: string;
  models: string[];
  /** False when Ollama rejects extension-origin POST /api/pull (403). */
  ollamaPullAllowed?: boolean;
}

export const OLLAMA_ENDPOINTS = [
  'http://127.0.0.1:11434',
  'http://localhost:11434',
] as const;

export const OPENAI_COMPAT_ENDPOINTS = [
  'http://127.0.0.1:1234/v1',
  'http://localhost:1234/v1',
  'http://127.0.0.1:8080/v1',
  'http://localhost:8080/v1',
] as const;

export const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download';
export const LM_STUDIO_DOWNLOAD_URL = 'https://lmstudio.ai';

async function fetchOllamaModels(baseUrl: string): Promise<string[]> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
    method: 'GET',
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { models?: Array<{ name: string }> };
  return data.models?.map((m) => m.name) ?? [];
}

async function fetchOpenAIModels(baseUrl: string): Promise<string[]> {
  const normalized = baseUrl.replace(/\/$/, '');
  const res = await fetch(`${normalized}/models`, {
    method: 'GET',
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { data?: Array<{ id: string }> };
  return data.data?.map((m) => m.id) ?? [];
}

export async function discoverOllama(): Promise<DiscoveredBackend | null> {
  for (const baseUrl of OLLAMA_ENDPOINTS) {
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) continue;
      const models = await fetchOllamaModels(baseUrl);
      const { probeOllamaExtensionAccess } = await import('./ollama');
      const pullAllowed = await probeOllamaExtensionAccess(baseUrl);
      return {
        provider: 'ollama',
        baseUrl,
        label: 'Ollama on this computer',
        models,
        ollamaPullAllowed: pullAllowed,
      };
    } catch {
      // try next endpoint
    }
  }
  return null;
}

export async function discoverOpenAICompatible(): Promise<DiscoveredBackend | null> {
  for (const baseUrl of OPENAI_COMPAT_ENDPOINTS) {
    try {
      const models = await fetchOpenAIModels(baseUrl);
      if (models.length > 0) {
        return {
          provider: 'openai-compatible',
          baseUrl,
          label: 'LM Studio / OpenAI-compatible server',
          models,
        };
      }
    } catch {
      // try next
    }
  }
  return null;
}

export async function discoverBackends(): Promise<DiscoveredBackend[]> {
  const [ollama, openai] = await Promise.all([discoverOllama(), discoverOpenAICompatible()]);
  const found: DiscoveredBackend[] = [];
  if (ollama) found.push(ollama);
  if (openai) found.push(openai);
  return found;
}

export async function listModelsForBackend(
  provider: LLMProvider,
  baseUrl: string,
): Promise<string[]> {
  if (provider === 'ollama') {
    return fetchOllamaModels(baseUrl);
  }
  return fetchOpenAIModels(baseUrl);
}

export function modelMatchesInstalled(installed: string[], model: string): boolean {
  const target = model.toLowerCase();
  return installed.some((m) => {
    const name = m.toLowerCase();
    return (
      name === target ||
      name.startsWith(`${target}:`) ||
      name.startsWith(`${target}-`) ||
      target.startsWith(`${name}:`) ||
      target.startsWith(`${name}-`)
    );
  });
}
