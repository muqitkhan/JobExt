import type { LLMSettings, LLMProvider } from '../types';
import { isCloudProvider } from './cloud-providers';

export type SpeedProfile = 'auto' | 'fast' | 'quality';

export interface ModelPreset {
  id: string;
  label: string;
  model: string;
  ollamaPull: string;
  paramsB: number;
  speedProfile: SpeedProfile;
  temperature: number;
  maxTokens: number;
  why: string;
}

/** Curated presets — Qwen 2.5 3B is the best 2–4B pick for JobExt (speed + JSON + rewriting). */
export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: 'qwen2.5-3b',
    label: 'Qwen 2.5 3B — best 2–4B pick',
    model: 'qwen2.5:3b',
    ollamaPull: 'qwen2.5:3b',
    paramsB: 3,
    speedProfile: 'fast',
    temperature: 0.1,
    maxTokens: 400,
    why: 'Top instruction-following in the 3B class, reliable JSON output, and strong keyword alignment. Best balance of speed and quality under 2 minutes.',
  },
  {
    id: 'phi3.5-mini',
    label: 'Phi-3.5 Mini 3.8B',
    model: 'phi3.5:latest',
    ollamaPull: 'phi3.5',
    paramsB: 3.8,
    speedProfile: 'fast',
    temperature: 0.1,
    maxTokens: 400,
    why: 'Efficient Microsoft model with good reasoning. Slightly slower than Qwen 3B but strong at structured edits.',
  },
  {
    id: 'llama3.2-3b',
    label: 'Llama 3.2 3B',
    model: 'llama3.2:3b',
    ollamaPull: 'llama3.2:3b',
    paramsB: 3,
    speedProfile: 'fast',
    temperature: 0.15,
    maxTokens: 400,
    why: 'Well-supported in Ollama and predictable. JSON can be less consistent than Qwen — use Fast Speed Profile.',
  },
  {
    id: 'gemma2-2b',
    label: 'Gemma 2 2B (fastest, lower quality)',
    model: 'gemma2:2b',
    ollamaPull: 'gemma2:2b',
    paramsB: 2,
    speedProfile: 'fast',
    temperature: 0.1,
    maxTokens: 350,
    why: 'Fastest option but weaker at long JSON. Use only if you need sub-60s runs and can accept fewer/simpler edits.',
  },
  {
    id: 'llama3.1-8b',
    label: 'Llama 3.1 8B (quality)',
    model: 'llama3.1:8b',
    ollamaPull: 'llama3.1:8b',
    paramsB: 8,
    speedProfile: 'quality',
    temperature: 0.3,
    maxTokens: 4096,
    why: 'Higher quality edits when speed is less critical. Expect 2–5 minutes on typical hardware.',
  },
];

const SMALL_MODEL_RE =
  /(?:^|[/:])(gemma2:2b|llama3\.2:3b|qwen2\.5:3b|phi3(?:\.5)?|smollm|tinyllama|2b|3b|4b)(?:[^a-z0-9]|$)/i;

export function isSmallModel(model: string): boolean {
  return SMALL_MODEL_RE.test(model);
}

export function resolveSpeedProfile(settings: LLMSettings): 'fast' | 'quality' {
  if (settings.speedProfile === 'quality') return 'quality';
  // fast + auto both use the lightweight profile (better on slow machines)
  return 'fast';
}

export function getPresetById(id: string): ModelPreset | undefined {
  return MODEL_PRESETS.find((p) => p.id === id);
}

export function applyPresetToSettings(
  preset: ModelPreset,
  current: LLMSettings,
): LLMSettings {
  return {
    ...current,
    model: preset.model,
    speedProfile: preset.speedProfile,
    temperature: preset.temperature,
    maxTokens: preset.maxTokens,
  };
}

export const CLOUD_FAST_LIMITS = {
  maxJobChars: 750,
  maxResumeChars: 1100,
  maxChanges: 3,
  maxOutputTokens: 280,
  ollamaNumCtx: 2048,
} as const;

export const LOCAL_MICRO_LIMITS = {
  maxJobKeywords: 8,
  maxSpans: 1,
  maxSpanChars: 180,
  maxChanges: 2,
  maxOutputTokens: 80,
  ollamaNumCtx: 768,
  /** One phrase rewrite — then instant template fallback */
  spanTimeoutMs: 28_000,
} as const;

export const FAST_PROFILE_LIMITS = {
  maxJobChars: 500,
  maxResumeChars: 800,
  maxChanges: 2,
  maxOutputTokens: 120,
  ollamaNumCtx: 1024,
} as const;

export const QUALITY_PROFILE_LIMITS = {
  maxJobChars: 8000,
  maxResumeChars: 12000,
  maxChanges: 20,
  maxOutputTokens: 4096,
  ollamaNumCtx: 8192,
} as const;

export function getLocalMicroLimits() {
  return LOCAL_MICRO_LIMITS;
}

export function getProfileLimits(
  profile: 'fast' | 'quality',
  provider?: LLMProvider,
) {
  if (provider && isCloudProvider(provider)) {
    return CLOUD_FAST_LIMITS;
  }
  return profile === 'fast' ? FAST_PROFILE_LIMITS : QUALITY_PROFILE_LIMITS;
}
