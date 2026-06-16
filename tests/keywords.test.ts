import { describe, expect, it } from 'vitest';
import { extractJobKeywords } from '@/lib/ats/keywords';
import type { JobPosting } from '@/lib/types';

describe('extractJobKeywords', () => {
  it('canonicalizes duplicate skill synonyms in JD', () => {
    const job: JobPosting = {
      title: 'DevOps Engineer',
      company: 'Acme',
      location: 'Remote',
      description: 'Requirements: Kubernetes, K8s, and CI/CD pipelines.',
      source: 'manual',
      url: '',
    };
    const keywords = extractJobKeywords(job);
    const k8sEntries = keywords.filter((k) => k.term === 'kubernetes' || k.term === 'k8s');
    expect(k8sEntries.length).toBe(1);
  });

  it('extracts individual skills from years-of-experience phrases', () => {
    const job: JobPosting = {
      title: 'Engineer',
      company: 'Acme',
      location: 'Remote',
      description: '5+ years of experience with React and TypeScript required.',
      source: 'manual',
      url: '',
    };
    const keywords = extractJobKeywords(job);
    expect(keywords.some((k) => k.term === 'react')).toBe(true);
    expect(keywords.some((k) => k.term === 'typescript')).toBe(true);
    expect(keywords.some((k) => k.term.includes('react and typescript'))).toBe(false);
  });

  it('filters generic fluff from frequency extraction', () => {
    const job: JobPosting = {
      title: 'Engineer',
      company: 'Acme',
      location: 'Remote',
      description:
        'experience experience experience collaborative collaborative environment environment python python',
      source: 'manual',
      url: '',
    };
    const keywords = extractJobKeywords(job);
    expect(keywords.some((k) => k.term === 'experience')).toBe(false);
    expect(keywords.some((k) => k.term === 'collaborative')).toBe(false);
    expect(keywords.some((k) => k.term === 'python')).toBe(true);
  });
});
