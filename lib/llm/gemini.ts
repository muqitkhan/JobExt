import type { LLMSettings } from '../types';
import { resolveSpeedProfile, getProfileLimits } from './models';
import { fetchWithTimeout, LLM_CLOUD_CHAT_TIMEOUT_MS } from './timeout';
import type { ChatOptions } from './openai-cloud';

function requireApiKey(settings: LLMSettings): string {
  const key = settings.apiKey.trim();
  if (!key) throw new Error('API key is required. Add it in Settings → Cloud account.');
  return key;
}

export async function chatGemini(
  settings: LLMSettings,
  systemPrompt: string,
  userPrompt: string,
  options: ChatOptions = {},
): Promise<string> {
  const apiKey = requireApiKey(settings);
  const profile = resolveSpeedProfile(settings);
  const limits = getProfileLimits(profile, settings.provider);
  const model = settings.model;

  const generationConfig: Record<string, unknown> = {
    temperature: settings.temperature,
    maxOutputTokens: Math.min(settings.maxTokens, limits.maxOutputTokens),
  };

  if (options.jsonMode) {
    generationConfig.responseMimeType = 'application/json';
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig,
      }),
    },
    LLM_CLOUD_CHAT_TIMEOUT_MS,
    'chat',
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini.');
  return text;
}

export async function testGeminiConnection(
  settings: LLMSettings,
): Promise<{ ok: boolean; message: string }> {
  try {
    await chatGemini(settings, 'Reply with OK only.', 'ping');
    return { ok: true, message: `Gemini connected. Model: ${settings.model}.` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Gemini connection failed.',
    };
  }
}
