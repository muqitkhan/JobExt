import { describe, expect, it } from 'vitest';
import {
  extractEditableSpans,
  buildCompressedDigest,
  anchorChangesToResume,
} from '@/lib/llm/compress';
import { mockResume } from './helpers';

const sampleResume = mockResume({
  format: 'txt',
  fileName: 'resume.txt',
  plainText: `MUQIT ASIF KHAN
email@example.com

PROFESSIONAL SUMMARY
Full Stack engineer with JavaScript and React experience.

TECHNICAL SKILLS
Languages: JavaScript, TypeScript`,
  sections: [
    { name: 'PROFESSIONAL SUMMARY', content: 'Full Stack engineer with JavaScript and React experience.' },
    { name: 'TECHNICAL SKILLS', content: 'Languages: JavaScript, TypeScript' },
  ],
});

describe('compress', () => {
  it('extracts short editable spans from resume sections', () => {
    const spans = extractEditableSpans(sampleResume, 5);
    expect(spans.length).toBeGreaterThanOrEqual(2);
    expect(spans[0].text).toContain('JavaScript');
  });

  it('builds a compact digest for the LLM', () => {
    const spans = extractEditableSpans(sampleResume, 3);
    const digest = buildCompressedDigest(spans);
    expect(digest).toMatch(/\[s1\]/);
    expect(digest.length).toBeLessThan(sampleResume.plainText.length);
  });

  it('anchors LLM changes back to exact resume substrings', () => {
    const spans = extractEditableSpans(sampleResume, 3);
    const anchored = anchorChangesToResume(
      [
        {
          id: 'c1',
          section: 'Summary',
          original: spans[0].text.toLowerCase(),
          revised: 'Updated phrase with TypeScript',
          reason: 'match job',
          accepted: true,
        },
      ],
      spans,
      sampleResume.plainText,
    );
    expect(anchored[0].original).toBe(spans[0].text);
  });
});
