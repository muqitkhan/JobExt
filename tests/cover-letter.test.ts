import { describe, expect, it } from 'vitest';
import { jobNeedsCoverLetter } from '@/lib/llm/cover-letter';

describe('jobNeedsCoverLetter', () => {
  it('detects explicit cover letter requests', () => {
    expect(jobNeedsCoverLetter('Please submit a cover letter with your application.')).toBe(true);
    expect(jobNeedsCoverLetter('Motivation letter required.')).toBe(true);
  });

  it('returns false when not mentioned', () => {
    expect(jobNeedsCoverLetter('Upload your resume and portfolio only.')).toBe(false);
  });
});
