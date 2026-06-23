import { describe, expect, it } from 'vitest';
import { augmentChangesToTargetScore } from '@/lib/llm/score-tailor';
import { buildFullTextFromChanges } from '@/lib/llm/prompts';
import { scoreResumeATS } from '@/lib/ats';
import type { JobPosting } from '@/lib/types';
import { mockResume } from './helpers';

const sampleJob: JobPosting = {
  title: 'Senior React Developer',
  company: 'Acme',
  location: 'Remote',
  description: `
    Requirements:
    - 5+ years of experience with React and TypeScript
    - Strong knowledge of Node.js, REST APIs, and AWS
    - Bachelor's degree in Computer Science or related field
    - Experience with CI/CD, Docker, and agile teams
  `,
  source: 'manual',
  url: '',
};

const weakResume = mockResume({
  format: 'txt',
  fileName: 'resume.txt',
  plainText: `
John Doe
john@email.com

Summary
Developer with some web experience.

Skills
HTML, CSS

Experience
Built websites for 2 years.
`,
  sections: [],
});

describe('augmentChangesToTargetScore', () => {
  it('raises a weak resume to at least 85 ATS for a matching job', () => {
    const before = scoreResumeATS(weakResume.plainText, sampleJob).overall;
    const changes = augmentChangesToTargetScore(weakResume, sampleJob, [], 85);
    expect(changes.length).toBeGreaterThan(0);

    const tailoredText = buildFullTextFromChanges(weakResume.plainText, changes);
    const after = scoreResumeATS(tailoredText, sampleJob).overall;

    expect(after).toBeGreaterThan(before + 15);
    expect(after).toBeGreaterThanOrEqual(85);
  });
});
