import { describe, expect, it } from 'vitest';
import {
  getMacOllamaFixScript,
  getTerminalPullCommand,
  isOllamaOriginBlocked,
  OLLAMA_ORIGINS_VALUE,
} from '@/lib/llm/ollama-origins';

describe('ollama-origins', () => {
  it('detects 403 as origin block', () => {
    expect(isOllamaOriginBlocked(403)).toBe(true);
    expect(isOllamaOriginBlocked(404)).toBe(false);
  });

  it('includes extension origins in fix script', () => {
    expect(OLLAMA_ORIGINS_VALUE).toContain('chrome-extension://*');
    expect(getMacOllamaFixScript()).toContain('launchctl setenv OLLAMA_ORIGINS');
    expect(getMacOllamaFixScript()).toContain('killall Ollama');
  });

  it('builds terminal pull command', () => {
    expect(getTerminalPullCommand('qwen2.5:3b')).toBe('ollama pull qwen2.5:3b');
  });
});
