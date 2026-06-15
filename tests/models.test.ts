import { describe, expect, it } from 'vitest';
import { isSmallModel, resolveSpeedProfile, MODEL_PRESETS } from '@/lib/llm/models';
import { modelMatchesInstalled } from '@/lib/llm/discovery';
import { trimJobDescription, trimResumeForPrompt } from '@/lib/llm/truncate';
import { DEFAULT_LLM_SETTINGS } from '@/lib/types';
import { mockResume } from './helpers';

describe('isSmallModel', () => {
  it('detects common 2-4B model names', () => {
    expect(isSmallModel('qwen2.5:3b')).toBe(true);
    expect(isSmallModel('llama3.2:3b')).toBe(true);
    expect(isSmallModel('phi3.5:latest')).toBe(true);
    expect(isSmallModel('llama3.1:8b')).toBe(false);
  });
});

describe('resolveSpeedProfile', () => {
  it('uses fast for auto mode (optimized for slow machines)', () => {
    expect(
      resolveSpeedProfile({ ...DEFAULT_LLM_SETTINGS, model: 'qwen2.5:3b', speedProfile: 'auto' }),
    ).toBe('fast');
    expect(
      resolveSpeedProfile({ ...DEFAULT_LLM_SETTINGS, model: 'llama3.1:8b', speedProfile: 'auto' }),
    ).toBe('fast');
  });

  it('respects quality override', () => {
    expect(
      resolveSpeedProfile({ ...DEFAULT_LLM_SETTINGS, model: 'qwen2.5:3b', speedProfile: 'quality' }),
    ).toBe('quality');
  });
});

describe('trimJobDescription', () => {
  it('truncates long descriptions', () => {
    const long = 'a'.repeat(5000);
    const trimmed = trimJobDescription(long, 1000);
    expect(trimmed.length).toBeLessThanOrEqual(1100);
  });

  it('prefers requirements section', () => {
    const desc = 'Intro fluff. '.repeat(50) + 'Requirements: Python, React. ' + 'x'.repeat(3000);
    const trimmed = trimJobDescription(desc, 500);
    expect(trimmed.toLowerCase()).toContain('requirements');
  });
});

describe('trimResumeForPrompt', () => {
  it('prioritizes experience and skills', () => {
    const resume = mockResume({
      format: 'txt',
      fileName: 'r.txt',
      plainText: 'Education\nBS\nExperience\nBuilt apps\nSkills\nTypeScript',
      sections: [
        { name: 'Education', content: 'BS Computer Science' },
        { name: 'Experience', content: 'Built web applications' },
        { name: 'Skills', content: 'TypeScript, React' },
      ],
    });
    const trimmed = trimResumeForPrompt(resume, 200, 'fast');
    expect(trimmed.toLowerCase()).toContain('experience');
  });
});

describe('MODEL_PRESETS', () => {
  it('includes qwen as best 2-4B default', () => {
    const qwen = MODEL_PRESETS.find((p) => p.id === 'qwen2.5-3b');
    expect(qwen).toBeDefined();
    expect(qwen?.speedProfile).toBe('fast');
  });
});

describe('modelMatchesInstalled', () => {
  it('matches model name variants', () => {
    const installed = ['qwen2.5:3b-instruct-q4_K_M'];
    expect(modelMatchesInstalled(installed, 'qwen2.5:3b')).toBe(true);
    expect(modelMatchesInstalled(installed, 'llama3.1:8b')).toBe(false);
  });
});
