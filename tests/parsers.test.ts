import { describe, expect, it } from 'vitest';
import { splitIntoSections, sectionsToPlainText } from '@/lib/parsers/sections';
import { detectFormat } from '@/lib/parsers/index';
import { buildDownloadFileName } from '@/lib/exporters/index';
import { parseTailorResponse, buildFullTextFromChanges } from '@/lib/llm/prompts';
import { buildDisplayText } from '@/lib/diff/highlight';
import type { ResumeChange } from '@/lib/types';

describe('splitIntoSections', () => {
  it('splits resume by section headers', () => {
    const text = 'SUMMARY\nExperienced developer\n\nEXPERIENCE\nBuilt apps';
    const sections = splitIntoSections(text);
    expect(sections.length).toBeGreaterThanOrEqual(2);
    expect(sections.some((s) => s.name.toLowerCase().includes('summary'))).toBe(true);
  });

  it('returns General for unstructured text', () => {
    const sections = splitIntoSections('Just some text without headers');
    expect(sections).toEqual([{ name: 'General', content: 'Just some text without headers' }]);
  });
});

describe('sectionsToPlainText', () => {
  it('round-trips sections', () => {
    const sections = [
      { name: 'Skills', content: 'TypeScript' },
      { name: 'General', content: 'Hello' },
    ];
    const text = sectionsToPlainText(sections);
    expect(text).toContain('Skills');
    expect(text).toContain('TypeScript');
  });
});

describe('detectFormat', () => {
  it('detects docx and pdf', () => {
    expect(detectFormat('resume.docx')).toBe('docx');
    expect(detectFormat('resume.pdf')).toBe('pdf');
    expect(detectFormat('resume.txt')).toBe('txt');
    expect(detectFormat('resume.rtf')).toBe('rtf');
    expect(detectFormat('resume.exe')).toBeNull();
  });
});

describe('buildDownloadFileName', () => {
  it('appends date to basename', () => {
    const name = buildDownloadFileName('John_Resume.docx');
    expect(name).toMatch(/^John_Resume_\d{4}-\d{2}-\d{2}\.docx$/);
  });
});

describe('parseTailorResponse', () => {
  it('parses JSON from LLM response', () => {
    const raw = `{"changes":[{"id":"c1","section":"Skills","original":"JS","revised":"TypeScript","reason":"match"}],"fullText":"Skills\\nTypeScript"}`;
    const result = parseTailorResponse(raw);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].revised).toBe('TypeScript');
    expect(result.fullText).toContain('TypeScript');
  });

  it('extracts JSON from markdown fences', () => {
    const raw = '```json\n{"changes":[],"fullText":"Hello"}\n```';
    const result = parseTailorResponse(raw);
    expect(result.fullText).toBe('Hello');
  });
});

describe('diff highlight', () => {
  it('highlights changed words without altering layout', () => {
    const original = 'Built web apps';
    const changes: ResumeChange[] = [
      {
        id: 'c1',
        section: 'Experience',
        original: 'web apps',
        revised: 'React apps',
        reason: 'match',
        accepted: true,
      },
    ];
    const final = buildFullTextFromChanges(original, changes);
    expect(final).toBe('Built React apps');
    const { parts, displayText } = buildDisplayText(original, changes, false);
    expect(displayText).toBe('Built React apps');
    expect(parts.some((p) => p.added)).toBe(true);
    expect(parts.some((p) => p.removed)).toBe(false);
    expect(parts.map((p) => p.value).join('')).toBe(displayText);
  });

  it('preserves line breaks in the display output', () => {
    const original = 'SUMMARY\nHello\n\nSKILLS\nJavaScript';
    const changes: ResumeChange[] = [
      {
        id: 'c1',
        section: 'Skills',
        original: 'JavaScript',
        revised: 'TypeScript',
        reason: 'match',
        accepted: true,
      },
    ];
    const { parts, displayText } = buildDisplayText(original, changes, false);
    expect(displayText).toBe('SUMMARY\nHello\n\nSKILLS\nTypeScript');
    expect(parts.map((p) => p.value).join('')).toBe(displayText);
  });

  it('shows removed and added text in review mode', () => {
    const original = 'Built web apps';
    const changes: ResumeChange[] = [
      {
        id: 'c1',
        section: 'Experience',
        original: 'web apps',
        revised: 'React apps',
        reason: 'match',
        accepted: true,
      },
    ];
    const { parts } = buildDisplayText(original, changes, true);
    expect(parts.some((p) => p.added)).toBe(true);
    expect(parts.some((p) => p.removed)).toBe(true);
  });
});
