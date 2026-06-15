import type { LLMSettings } from '../types';
import { resolveSpeedProfile, getProfileLimits } from './models';
import { fetchWithTimeout, LLM_CLOUD_CHAT_TIMEOUT_MS } from './timeout';

export interface ChatOptions {
  jsonMode?: boolean;
}

function requireApiKey(settings: LLMSettings): string {
  const key = settings.apiKey.trim();
  if (!key) throw new Error('API key is required. Add it in Settings → Cloud account.');
  return key;
}

export async function chatOpenAI(
  settings: LLMSettings,
  systemPrompt: string,
  userPrompt: string,
  options: ChatOptions = {},
): Promise<string> {
  const apiKey = requireApiKey(settings);
  const base = (settings.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const profile = resolveSpeedProfile(settings);
  const limits = getProfileLimits(profile, settings.provider);

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
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
    LLM_CLOUD_CHAT_TIMEOUT_MS,
    'chat',
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenAI.');
  return content;
}

export async function testOpenAIConnection(
  settings: LLMSettings,
): Promise<{ ok: boolean; message: string }> {
  try {
    await chatOpenAI(settings, 'Reply with OK only.', 'ping', { jsonMode: false });
    return { ok: true, message: `OpenAI connected. Model: ${settings.model}.` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'OpenAI connection failed.',
    };
  }
}
