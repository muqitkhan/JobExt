import { describe, expect, it, vi } from 'vitest';
import type { JobPosting, LLMSettings } from '@/lib/types';
import { mockResume } from './helpers';

vi.mock('@/lib/llm/ollama', () => ({
  chatOllama: vi.fn(),
  chatOllamaMicro: vi.fn(),
  warmOllamaModel: vi.fn().mockResolvedValue(undefined),
  testOllamaConnection: vi.fn().mockResolvedValue({ ok: true, message: 'ok' }),
  OllamaOriginBlockedError: class extends Error {},
}));

vi.mock('@/lib/llm/openai-compatible', () => ({
  chatOpenAICompatible: vi.fn(),
}));

import { chatOllamaMicro } from '@/lib/llm/ollama';
import { tailorResume } from '@/lib/llm';

const settings: LLMSettings = {
  provider: 'ollama',
  apiKey: '',
  baseUrl: 'http://127.0.0.1:11434',
  model: 'qwen2.5:3b',
  temperature: 0.1,
  maxTokens: 400,
  speedProfile: 'fast',
  useManualEndpoint: false,
};

const job: JobPosting = {
  title: 'Engineer',
  company: 'Acme',
  location: 'Remote',
  description: 'TypeScript React Node required. Build APIs.',
  source: 'test',
  url: 'https://example.com/job',
};

const resume = mockResume({
  format: 'txt',
  fileName: 'resume.txt',
  plainText: 'SUMMARY\nDeveloper with JavaScript experience.\n\nSKILLS\nJavaScript',
  sections: [],
});

describe('tailorResume', () => {
  it('returns micro-edited changes from local Ollama path', async () => {
    vi.mocked(chatOllamaMicro).mockResolvedValue(
      '{"r":"TypeScript-focused developer with hands-on React and Node experience."}',
    );

    const result = await tailorResume(job, resume, settings, 'quick');
    expect(result.changes.length).toBeGreaterThanOrEqual(1);
    expect(result.changes[0].accepted).toBe(true);
    expect(result.fullText.toLowerCase()).toMatch(/typescript|react/);
  });

  it('falls back to template rephrases when Ollama returns keyword dumps', async () => {
    vi.mocked(chatOllamaMicro).mockResolvedValue(
      '{"r":"Developer with JavaScript experience, TypeScript, React"}',
    );

    const result = await tailorResume(job, resume, settings, 'quick');
    expect(result.changes.length).toBeGreaterThanOrEqual(1);
    expect(result.fullText.length).toBeGreaterThan(20);
    expect(
      result.changes.some(
        (c) =>
          c.reason.includes('Rephrased') ||
          c.reason.includes('Aligned') ||
          c.reason.includes('X–Y–Z'),
      ),
    ).toBe(true);
  });
});
