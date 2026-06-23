import { describe, expect, it } from 'vitest';
import {
  parseMicroRevision,
  extractTopJobTerms,
  buildSingleSpanPrompt,
} from '@/lib/llm/micro';
import type { JobPosting } from '@/lib/types';

describe('parseMicroRevision', () => {
  it('parses compact r field', () => {
    expect(parseMicroRevision('{"r":"TypeScript developer"}')).toBe('TypeScript developer');
  });

  it('parses revised field', () => {
    expect(parseMicroRevision('{"revised":"React engineer"}')).toBe('React engineer');
  });
});

describe('buildSingleSpanPrompt', () => {
  it('asks for semantic rephrase not keyword lists', () => {
    const prompt = buildSingleSpanPrompt('React Developer', ['TypeScript', 'React'], {
      id: 's1',
      section: 'Summary',
      text: 'Built apps using JavaScript',
    });
    expect(prompt).toMatch(/X–Y–Z|comma-separated lists/i);
    expect(prompt).toMatch(/React Developer/);
  });
});

describe('extractTopJobTerms', () => {
  it('pulls title and requirement terms', () => {
    const job: JobPosting = {
      title: 'Senior React Engineer',
      company: 'Co',
      location: 'Remote',
      description: 'Requirements: TypeScript, Node.js, PostgreSQL. Build APIs.',
      source: 'test',
      url: '',
    };
    const terms = extractTopJobTerms(job, 6);
    expect(terms.some((t) => /react|typescript|node/i.test(t))).toBe(true);
  });
});
