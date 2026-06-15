import { describe, expect, it } from 'vitest';
import {
  buildInstantEdits,
  buildGuaranteedEdits,
  rephraseSpanForJob,
} from '@/lib/llm/instant-tailor';
import { isKeywordDumpChange } from '@/lib/llm/prompts';
import { extractMicroSpans } from '@/lib/llm/compress';
import type { JobPosting } from '@/lib/types';
import { mockResume } from './helpers';

const job: JobPosting = {
  title: 'React Developer',
  company: 'Co',
  location: 'Remote',
  description: 'Requirements: TypeScript, React, Node.js. 3+ years experience.',
  source: 'test',
  url: '',
};

const longSummaryResume = mockResume({
  format: 'txt',
  fileName: 'r.txt',
  plainText: `MUQIT ASIF KHAN
email@test.com

PROFESSIONAL SUMMARY
Full Stack and AI Engineer with 4+ years of experience building web applications using JavaScript and modern frameworks across cloud platforms.

TECHNICAL SKILLS
Languages: JavaScript`,
  sections: [
    {
      name: 'PROFESSIONAL SUMMARY',
      content:
        'Full Stack and AI Engineer with 4+ years of experience building web applications using JavaScript and modern frameworks across cloud platforms.',
    },
    { name: 'TECHNICAL SKILLS', content: 'Languages: JavaScript' },
  ],
});

describe('extractMicroSpans', () => {
  it('extracts spans from long summary paragraphs', () => {
    const spans = extractMicroSpans(longSummaryResume);
    expect(spans.length).toBeGreaterThan(0);
  });
});

describe('rephraseSpanForJob', () => {
  it('weaves job terms into sentence structure instead of appending lists', () => {
    const original =
      'Full Stack and AI Engineer with 4+ years of experience building web applications using JavaScript';
    const revised = rephraseSpanForJob(original, ['TypeScript', 'React'], job.title);
    expect(revised).toBeTruthy();
    expect(revised).not.toMatch(/, TypeScript, React/);
    expect(revised!.toLowerCase()).toMatch(/typescript|react/);
    expect(
      isKeywordDumpChange({
        id: '1',
        section: 'S',
        original,
        revised: revised!,
        reason: '',
        accepted: true,
      }),
    ).toBe(false);
  });
});

describe('buildInstantEdits', () => {
  it('rephrases phrases with job-relevant wording', () => {
    const edits = buildInstantEdits(longSummaryResume, job);
    expect(edits.length).toBeGreaterThan(0);
    for (const edit of edits) {
      expect(edit.revised).not.toBe(edit.original);
      expect(
        isKeywordDumpChange({
          ...edit,
          id: 'x',
        }),
      ).toBe(false);
    }
    const combined = edits.map((e) => e.revised).join(' ');
    expect(combined.toLowerCase()).toMatch(/typescript|react|node/);
  });
});

describe('buildGuaranteedEdits', () => {
  it('always returns at least one edit when job has a title', () => {
    const edits = buildGuaranteedEdits(longSummaryResume, job);
    expect(edits.length).toBeGreaterThan(0);
    expect(edits[0].original.length).toBeGreaterThan(10);
    expect(edits[0].revised).not.toBe(edits[0].original);
  });
});
