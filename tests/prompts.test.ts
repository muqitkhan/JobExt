import { describe, expect, it } from 'vitest';
import {
  applyChangeToText,
  finalizeTailorResult,
  findOriginalSpan,
  isNoOpChange,
  isKeywordDumpChange,
} from '@/lib/llm/prompts';
import { trimResumeForPrompt } from '@/lib/llm/truncate';
import { mockResume } from './helpers';

describe('findOriginalSpan', () => {
  it('matches exact and flexible whitespace', () => {
    const text = 'SKILLS\nJavaScript,  React';
    expect(findOriginalSpan(text, 'JavaScript, React')).toEqual({ start: 7, end: 25 });
  });
});

describe('applyChangeToText', () => {
  it('applies a change when whitespace differs', () => {
    const text = 'Developer with JavaScript experience';
    const updated = applyChangeToText(text, {
      id: 'c1',
      section: 'Skills',
      original: 'JavaScript',
      revised: 'TypeScript',
      reason: 'match',
      accepted: true,
    });
    expect(updated).toBe('Developer with TypeScript experience');
  });
});

describe('finalizeTailorResult', () => {
  it('uses fullText when phrase edits do not match', () => {
    const original = 'SUMMARY\nDeveloper with JavaScript.';
    const result = finalizeTailorResult(original, {
      changes: [
        {
          id: 'c1',
          section: 'Summary',
          original: 'not in resume',
          revised: 'ignored',
          reason: 'x',
          accepted: true,
        },
      ],
      fullText: 'SUMMARY\nDeveloper with TypeScript and React.',
    });

    expect(result.fullText).toContain('TypeScript');
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].id).toBe('full');
  });

  it('prefers matching phrase edits over fullText', () => {
    const original = 'SUMMARY\nDeveloper with JavaScript.';
    const result = finalizeTailorResult(original, {
      changes: [
        {
          id: 'c1',
          section: 'Summary',
          original: 'JavaScript',
          revised: 'TypeScript',
          reason: 'match',
          accepted: true,
        },
        {
          id: 'c2',
          section: 'Summary',
          original: 'not in resume',
          revised: 'ignored',
          reason: 'x',
          accepted: true,
        },
      ],
      fullText: 'SUMMARY\nCompletely rewritten resume body.',
    });

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].id).toBe('c1');
    expect(result.fullText).toBe('SUMMARY\nDeveloper with TypeScript.');
  });

  it('filters no-op changes where revised equals original', () => {
    const original = 'SUMMARY\nDeveloper with JavaScript.';
    expect(() =>
      finalizeTailorResult(original, {
        changes: [
          {
            id: 'c1',
            section: 'Summary',
            original: 'JavaScript',
            revised: 'JavaScript',
            reason: 'noop',
            accepted: true,
          },
        ],
        fullText: original,
      }),
    ).toThrow(/identical text/i);
  });
});

describe('isNoOpChange', () => {
  it('detects identical and case-only changes', () => {
    expect(
      isNoOpChange({
        id: '1',
        section: 'S',
        original: 'foo',
        revised: 'foo',
        reason: '',
        accepted: true,
      }),
    ).toBe(true);
    expect(
      isNoOpChange({
        id: '2',
        section: 'S',
        original: 'Foo',
        revised: 'foo',
        reason: '',
        accepted: true,
      }),
    ).toBe(true);
  });
});

describe('isKeywordDumpChange', () => {
  it('detects comma-appended keyword lists', () => {
    expect(
      isKeywordDumpChange({
        id: '1',
        section: 'S',
        original: 'Built web apps using JavaScript',
        revised: 'Built web apps using JavaScript, TypeScript, React',
        reason: '',
        accepted: true,
      }),
    ).toBe(true);
  });

  it('detects "with X and Y" appends', () => {
    expect(
      isKeywordDumpChange({
        id: '2',
        section: 'S',
        original: 'Led engineering team',
        revised: 'Led engineering team with TypeScript and React.',
        reason: '',
        accepted: true,
      }),
    ).toBe(true);
  });

  it('allows natural rephrases that embed terms', () => {
    expect(
      isKeywordDumpChange({
        id: '3',
        section: 'S',
        original: 'Engineer with 4+ years of experience',
        revised: 'Engineer with 4+ years of TypeScript experience',
        reason: '',
        accepted: true,
      }),
    ).toBe(false);
  });
});

describe('trimResumeForPrompt', () => {
  it('uses plainText so LLM originals match apply step', () => {
    const resume = mockResume({
      format: 'txt',
      fileName: 'r.txt',
      plainText: 'SUMMARY\nHello\n\nSKILLS\nJavaScript',
      sections: [{ name: 'SUMMARY', content: 'Hello' }],
    });

    expect(trimResumeForPrompt(resume, 5000)).toBe(resume.plainText);
  });
});
