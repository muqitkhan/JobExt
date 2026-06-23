import { describe, expect, it } from 'vitest';
import { buildXyzBullet, getMissingKeywords } from '@/lib/llm/tailor-guidance';
import type { JobPosting } from '@/lib/types';

const job: JobPosting = {
  title: 'Senior React Developer',
  company: 'Acme',
  location: 'Remote',
  description: 'React, TypeScript, Node.js, AWS. 5+ years.',
  source: 'test',
  url: '',
};

describe('buildXyzBullet', () => {
  it('weaves missing keywords with action verb and Z clause', () => {
    const original = 'Built customer dashboards for 2 years using JavaScript';
    const revised = buildXyzBullet(original, ['React', 'TypeScript'], {
      jobTitle: job.title,
      section: 'Experience',
    });

    expect(revised.toLowerCase()).toMatch(/built/);
    expect(revised.toLowerCase()).toMatch(/react/);
    expect(revised.toLowerCase()).toMatch(/typescript/);
    expect(revised).toMatch(/by implementing|by applying/i);
    expect(revised).not.toMatch(/, React, TypeScript/);
  });

  it('uses summary framing for profile sections', () => {
    const original = 'Developer with 4+ years building web apps';
    const revised = buildXyzBullet(original, ['React', 'AWS'], {
      jobTitle: job.title,
      section: 'PROFESSIONAL SUMMARY',
    });

    expect(revised.toLowerCase()).toMatch(/senior react developer|react/);
    expect(revised).toMatch(/by applying/i);
  });

  it('contextualizes skills instead of comma-appending', () => {
    const original = 'Languages: JavaScript, HTML';
    const revised = buildXyzBullet(original, ['TypeScript', 'React'], {
      section: 'TECHNICAL SKILLS',
    });

    expect(revised.toLowerCase()).toMatch(/typescript|react/);
    expect(revised).not.toMatch(/, TypeScript, React\.?$/);
  });
});

describe('getMissingKeywords', () => {
  it('returns ATS missing keywords for resume vs job', () => {
    const resume = 'Summary\nWeb developer.\nSkills\nHTML';
    const missing = getMissingKeywords(job, resume, 8);
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.some((k) => /react|typescript/i.test(k))).toBe(true);
  });
});
