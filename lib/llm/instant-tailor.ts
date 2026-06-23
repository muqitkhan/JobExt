import type { JobPosting, ParsedResume, ResumeChange } from '../types';
import { extractJobKeywords, containsTerm } from '../ats/keywords';
import { extractEditableSpans } from './compress';
import { extractTopJobTerms } from './micro';
import { buildXyzBullet } from './tailor-guidance';

function stripEndPunct(text: string): string {
  return text.trim().replace(/[.,;]+$/, '');
}

function titleTerms(job: JobPosting): string[] {
  return job.title
    .split(/[\s,/|&+-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2);
}

function keywordsForSpan(spanText: string, job: JobPosting): string[] {
  const fromJob = extractJobKeywords(job)
    .sort((a, b) => b.weight - a.weight)
    .map((t) => t.term);

  const combined = [...fromJob, ...titleTerms(job), ...extractTopJobTerms(job, 10)];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const term of combined) {
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    if (containsTerm(spanText, term)) continue;
    seen.add(key);
    out.push(term);
    if (out.length >= 6) break;
  }

  return out;
}

/**
 * X–Y–Z rephrase for template fallback — weaves missing keywords with business context.
 */
export function rephraseSpanForJob(
  text: string,
  keywords: string[],
  jobTitle: string,
  section = '',
): string | null {
  const trimmed = text.trim();
  if (!trimmed || keywords.length === 0) return null;

  const xyz = buildXyzBullet(trimmed, keywords, { jobTitle, section });
  if (xyz !== trimmed && xyz.length >= 20) return xyz;

  const k1 = keywords[0];
  const verbMatch = trimmed.match(/\b(built|developed|designed|delivered|led)\s+([^,.;]+)/i);
  if (verbMatch && k1 && !containsTerm(verbMatch[2], k1)) {
    return buildXyzBullet(trimmed, keywords, { jobTitle, section });
  }

  const base = stripEndPunct(trimmed);
  if (k1) {
    return buildXyzBullet(base, keywords, { jobTitle, section });
  }

  return null;
}

function applyRephrase(
  text: string,
  keywords: string[],
  jobTitle: string,
  section: string,
): string | null {
  const revised = rephraseSpanForJob(text, keywords, jobTitle, section);
  if (!revised) return null;
  if (revised.trim().toLowerCase() === text.trim().toLowerCase()) return null;
  if (revised.length > 320) return revised.slice(0, 320);
  return revised;
}

/** Rule-based X–Y–Z edits — instant, no LLM. */
export function buildInstantEdits(resume: ParsedResume, job: JobPosting): ResumeChange[] {
  const spans = extractEditableSpans(resume, 8);
  const changes: ResumeChange[] = [];
  let n = 1;

  for (const span of spans) {
    const keywords = keywordsForSpan(span.text, job);
    if (keywords.length === 0) continue;

    const revised = applyRephrase(span.text, keywords, job.title, span.section);
    if (!revised) continue;

    changes.push({
      id: `i${n++}`,
      section: span.section,
      original: span.text,
      revised,
      reason: `X–Y–Z rewrite with ${keywords.slice(0, 3).join(', ')}`,
      accepted: true,
    });

    if (changes.length >= 6) break;
  }

  return changes;
}

/** Always produces at least one X–Y–Z edit when job + resume exist. */
export function buildGuaranteedEdits(resume: ParsedResume, job: JobPosting): ResumeChange[] {
  const instant = buildInstantEdits(resume, job);
  if (instant.length > 0) return instant;

  const spans = extractEditableSpans(resume, 3);
  const keywords = extractTopJobTerms(job, 6);
  const span = spans[0];
  if (!span) return [];

  if (keywords.length > 0) {
    const revised = applyRephrase(span.text, keywords, job.title, span.section);
    if (revised) {
      return [
        {
          id: 'g1',
          section: span.section,
          original: span.text,
          revised,
          reason: `X–Y–Z alignment: ${keywords.slice(0, 3).join(', ')}`,
          accepted: true,
        },
      ];
    }
  }

  const title = job.title.trim();
  if (title.length > 2) {
    const revised = buildXyzBullet(span.text, keywords.length > 0 ? keywords : [title], {
      jobTitle: title,
      section: span.section,
    });
    if (revised !== span.text) {
      return [
        {
          id: 'g1',
          section: span.section,
          original: span.text,
          revised: revised.slice(0, 320),
          reason: 'X–Y–Z role alignment',
          accepted: true,
        },
      ];
    }
  }

  return [];
}
