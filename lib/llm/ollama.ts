import type { LLMSettings } from '../types';
import { resolveSpeedProfile, getProfileLimits, getLocalMicroLimits } from './models';
import {
  getOllamaFixInstructions,
  isOllamaOriginBlocked,
} from './ollama-origins';
import {
  fetchWithTimeout,
  LLM_CHAT_TIMEOUT_MS,
  LLM_QUICK_TIMEOUT_MS,
} from './timeout';

export class OllamaOriginBlockedError extends Error {
  readonly code = 'OLLAMA_ORIGINS_BLOCKED' as const;

  constructor() {
    super(getOllamaFixInstructions());
    this.name = 'OllamaOriginBlockedError';
  }
}

export interface PullProgress {
  status: string;
  percent?: number;
  message: string;
}

export async function probeOllamaExtensionAccess(baseUrl: string): Promise<boolean> {
  const base = baseUrl.replace(/\/$/, '');
  try {
    const res = await fetchWithTimeout(
      `${base}/api/pull`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '__jobext_access_probe__', stream: true }),
      },
      LLM_QUICK_TIMEOUT_MS,
      'quick',
    );
    if (isOllamaOriginBlocked(res.status)) return false;
    // Any non-403 means the extension origin is allowed (model may not exist).
    return true;
  } catch {
    return false;
  }
}

export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  const base = baseUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/api/tags`, { method: 'GET' });
  if (!res.ok) throw new Error(`Could not list models (${res.status})`);
  const data = (await res.json()) as { models?: Array<{ name: string }> };
  return data.models?.map((m) => m.name) ?? [];
}

export async function pullOllamaModel(
  baseUrl: string,
  model: string,
  onProgress: (progress: PullProgress) => void,
): Promise<void> {
  const base = baseUrl.replace(/\/$/, '');
  const res = await fetchWithTimeout(`${base}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model, stream: true }),
  });

  if (!res.ok) {
    const err = await res.text();
    if (isOllamaOriginBlocked(res.status)) {
      throw new OllamaOriginBlockedError();
    }
    throw new Error(`Download failed (${res.status}): ${err}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response stream from Ollama.');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      const data = JSON.parse(line) as {
        status?: string;
        total?: number;
        completed?: number;
        digest?: string;
      };

      if (data.status === 'success') {
        onProgress({ status: 'success', percent: 100, message: 'Download complete' });
        return;
      }

      if (data.status === 'downloading' && data.total && data.completed !== undefined) {
        const percent = Math.round((data.completed / data.total) * 100);
        onProgress({
          status: 'downloading',
          percent,
          message: `Downloading… ${percent}%`,
        });
      } else if (data.status) {
        onProgress({
          status: data.status,
          message: data.status.replace(/_/g, ' '),
        });
      }
    }
  }
}

export async function testOllamaConnection(settings: LLMSettings): Promise<{ ok: boolean; message: string }> {
  try {
    const base = settings.baseUrl.replace(/\/$/, '');
    const res = await fetch(`${base}/api/tags`, { method: 'GET' });
    if (!res.ok) {
      return { ok: false, message: `Ollama returned ${res.status}. Is Ollama running?` };
    }
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    const models = data.models?.map((m) => m.name) ?? [];
    const hasModel = models.some((m) => m === settings.model || m.startsWith(`${settings.model}:`));
    const profile = resolveSpeedProfile(settings);
    const profileNote = profile === 'fast' ? ' Fast profile active.' : '';
    if (!hasModel && models.length > 0) {
      return {
        ok: true,
        message: `Connected. Model "${settings.model}" not found. Available: ${models.slice(0, 5).join(', ')}.${profileNote}`,
      };
    }
    return { ok: true, message: `Connected to Ollama. Model: ${settings.model}.${profileNote}` };
  } catch {
    return {
      ok: false,
      message: 'Cannot reach Ollama. Install from ollama.com and run: ollama serve',
    };
  }
}

export async function warmOllamaModel(settings: LLMSettings): Promise<void> {
  const base = settings.baseUrl.replace(/\/$/, '');
  await fetchWithTimeout(
    `${base}/api/generate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.model,
        prompt: ' ',
        stream: false,
        keep_alive: '10m',
        options: { num_predict: 1, num_ctx: 512 },
      }),
    },
    8_000,
    'quick',
  ).catch(() => undefined);
}

async function ollamaChat(
  settings: LLMSettings,
  systemPrompt: string,
  userPrompt: string,
  options: { numPredict: number; numCtx: number; timeoutMs: number; jsonMode?: boolean },
): Promise<string> {
  const base = settings.baseUrl.replace(/\/$/, '');

  const body: Record<string, unknown> = {
    model: settings.model,
    stream: false,
    keep_alive: '10m',
    options: {
      temperature: settings.temperature,
      num_predict: options.numPredict,
      num_ctx: options.numCtx,
      top_k: 20,
      top_p: 0.9,
    },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  };

  if (options.jsonMode !== false) {
    body.format = 'json';
  }

  const res = await fetchWithTimeout(
    `${base}/api/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    options.timeoutMs,
    'chat',
  );

  if (!res.ok) {
    const errText = await res.text();
    if (isOllamaOriginBlocked(res.status)) {
      throw new OllamaOriginBlockedError();
    }
    throw new Error(`Ollama error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as { message?: { content?: string } };
  const content = data.message?.content;
  if (!content) throw new Error('Empty response from Ollama.');
  return content;
}

export async function chatOllamaMicro(
  settings: LLMSettings,
  systemPrompt: string,
  userPrompt: string,
  jsonMode = true,
): Promise<string> {
  const micro = getLocalMicroLimits();
  return ollamaChat(settings, systemPrompt, userPrompt, {
    numPredict: micro.maxOutputTokens,
    numCtx: micro.ollamaNumCtx,
    timeoutMs: micro.spanTimeoutMs,
    jsonMode,
  });
}

export async function chatOllama(
  settings: LLMSettings,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const profile = resolveSpeedProfile(settings);
  const limits = getProfileLimits(profile, settings.provider);
  const numPredict = Math.min(settings.maxTokens, limits.maxOutputTokens);

  return ollamaChat(settings, systemPrompt, userPrompt, {
    numPredict,
    numCtx: limits.ollamaNumCtx,
    timeoutMs: LLM_CHAT_TIMEOUT_MS,
    jsonMode: profile === 'fast',
  });
}
