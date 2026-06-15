import type { LLMSettings } from '../types';
import { DEFAULT_LLM_SETTINGS } from '../types';
import { isCloudProvider } from '@/lib/llm/cloud-providers';

const SETTINGS_KEY = 'jobext_llm_settings';
const SETUP_KEY = 'jobext_setup_complete';

type StoredSettings = Partial<LLMSettings> & {
  backend?: string;
  cloudEnabled?: boolean;
};

function normalizeSettings(stored: StoredSettings | undefined): LLMSettings {
  const merged: LLMSettings = { ...DEFAULT_LLM_SETTINGS, ...stored };

  if (!stored?.provider && stored?.backend) {
    merged.provider = stored.backend as LLMSettings['provider'];
  }

  if (stored?.cloudEnabled && !merged.apiKey && stored.provider && isCloudProvider(stored.provider)) {
    merged.provider = stored.provider;
  }

  if (!merged.apiKey) merged.apiKey = '';

  if (isCloudProvider(merged.provider) && !merged.apiKey.trim()) {
    merged.provider = 'ollama';
  }

  return merged;
}

export async function getLLMSettings(): Promise<LLMSettings> {
  const result = await browser.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(result[SETTINGS_KEY] as StoredSettings | undefined);
}

export async function saveLLMSettings(settings: LLMSettings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function isSetupComplete(): Promise<boolean> {
  const settings = await getLLMSettings();
  if (isCloudProvider(settings.provider)) {
    return Boolean(settings.apiKey.trim() && settings.model.trim());
  }
  const result = await browser.storage.local.get(SETUP_KEY);
  return Boolean(result[SETUP_KEY]);
}

export async function setSetupComplete(complete: boolean): Promise<void> {
  await browser.storage.local.set({ [SETUP_KEY]: complete });
}

export function getConnectionMode(settings: LLMSettings): 'local' | 'cloud' {
  return isCloudProvider(settings.provider) ? 'cloud' : 'local';
}
