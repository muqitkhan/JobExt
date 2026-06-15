import type { LLMSettings } from '../types';
import { resolveSpeedProfile, getProfileLimits } from './models';
import { fetchWithTimeout, LLM_CHAT_TIMEOUT_MS } from './timeout';
import type { ChatOptions } from './openai-cloud';

function normalizeBaseUrl(url: string): string {
  const trimmed = url.replace(/\/$/, '');
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}

export async function testOpenAICompatibleConnection(
  settings: LLMSettings,
): Promise<{ ok: boolean; message: string }> {
  try {
    const base = normalizeBaseUrl(settings.baseUrl);
    const res = await fetch(`${base}/models`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      return { ok: false, message: `API returned ${res.status}. Check base URL.` };
    }
    return { ok: true, message: `Connected to OpenAI-compatible API at ${base}` };
  } catch {
    return {
      ok: false,
      message: 'Cannot reach API. Check LM Studio or your local server is running.',
    };
  }
}

export async function chatOpenAICompatible(
  settings: LLMSettings,
  systemPrompt: string,
  userPrompt: string,
  options: ChatOptions = {},
): Promise<string> {
  const base = normalizeBaseUrl(settings.baseUrl);
  const profile = resolveSpeedProfile(settings);
  const limits = getProfileLimits(profile, settings.provider);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (settings.apiKey.trim()) {
    headers.Authorization = `Bearer ${settings.apiKey.trim()}`;
  }

  const body: Record<string, unknown> = {
    model: settings.model,
    temperature: settings.temperature,
    max_tokens: Math.min(settings.maxTokens, limits.maxOutputTokens),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  };

  if (options.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetchWithTimeout(
    `${base}/chat/completions`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    },
    LLM_CHAT_TIMEOUT_MS,
    'chat',
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from API.');
  return content;
}
