import type { LLMSettings } from '../types';
import { resolveSpeedProfile, getProfileLimits } from './models';
import { fetchWithTimeout, LLM_CLOUD_CHAT_TIMEOUT_MS } from './timeout';
import type { ChatOptions } from './openai-cloud';

function requireApiKey(settings: LLMSettings): string {
  const key = settings.apiKey.trim();
  if (!key) throw new Error('API key is required. Add it in Settings → Cloud account.');
  return key;
}

export async function chatAnthropic(
  settings: LLMSettings,
  systemPrompt: string,
  userPrompt: string,
  options: ChatOptions = {},
): Promise<string> {
  const apiKey = requireApiKey(settings);
  const profile = resolveSpeedProfile(settings);
  const limits = getProfileLimits(profile, settings.provider);

  const userContent = options.jsonMode
    ? `${userPrompt}\n\nRespond with valid JSON only.`
    : userPrompt;

  const res = await fetchWithTimeout(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: Math.min(settings.maxTokens, limits.maxOutputTokens),
        temperature: settings.temperature,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    },
    LLM_CLOUD_CHAT_TIMEOUT_MS,
    'chat',
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = data.content?.find((c) => c.type === 'text')?.text;
  if (!text) throw new Error('Empty response from Claude.');
  return text;
}

export async function testAnthropicConnection(
  settings: LLMSettings,
): Promise<{ ok: boolean; message: string }> {
  try {
    await chatAnthropic(settings, 'Reply with OK only.', 'ping');
    return { ok: true, message: `Claude connected. Model: ${settings.model}.` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Claude connection failed.',
    };
  }
}
