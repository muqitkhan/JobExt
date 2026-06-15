import { describe, expect, it } from 'vitest';
import { scoreResumeATS } from '@/lib/ats';
import type { JobPosting } from '@/lib/types';

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

const weakResume = `
John Doe
john@email.com

Summary
Developer with some web experience.

Skills
HTML, CSS

Experience
Built websites for 2 years.
`;

const strongResume = `
John Doe
john@email.com

Summary
Senior frontend engineer with React and TypeScript expertise.

Skills
React, TypeScript, Node.js, AWS, Docker, REST APIs, CI/CD, agile

Experience
Senior React Developer — 6 years building scalable web applications with React, TypeScript, and Node.js on AWS.
Deployed via Docker and CI/CD pipelines in agile teams.

Education
Bachelor of Science in Computer Science
`;

describe('scoreResumeATS', () => {
  it('scores a weak resume lower than a tailored-strong resume for same job', () => {
    const before = scoreResumeATS(weakResume, sampleJob);
    const after = scoreResumeATS(strongResume, sampleJob);
    expect(after.overall).toBeGreaterThan(before.overall);
    expect(after.overall - before.overall).toBeGreaterThanOrEqual(15);
  });

  it('uses the same rubric categories every time', () => {
    const a = scoreResumeATS(weakResume, sampleJob);
    const b = scoreResumeATS(weakResume, sampleJob);
    expect(a.overall).toBe(b.overall);
    expect(a.categories.map((c) => c.id)).toEqual(b.categories.map((c) => c.id));
  });

  it('reports missing keywords honestly', () => {
    const result = scoreResumeATS(weakResume, sampleJob);
    expect(result.missingKeywords.length).toBeGreaterThan(0);
    expect(result.missingKeywords.some((k) => k.includes('react') || k.includes('typescript'))).toBe(
      true,
    );
  });

  it('improves keyword match after resume aligns with job', () => {
    const before = scoreResumeATS(weakResume, sampleJob);
    const after = scoreResumeATS(strongResume, sampleJob);
    const beforeKw = before.categories.find((c) => c.id === 'keywords')!.score;
    const afterKw = after.categories.find((c) => c.id === 'keywords')!.score;
    expect(afterKw).toBeGreaterThan(beforeKw);
  });

  it('returns grade from overall score', () => {
    const result = scoreResumeATS(strongResume, sampleJob);
    expect(['Poor', 'Fair', 'Good', 'Strong', 'Excellent']).toContain(result.grade);
    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThanOrEqual(100);
  });
});
