import type { JobPosting, ParsedResume, ResumeChange } from '../types';
import { extractJobKeywords, containsTerm } from '../ats/keywords';
import { extractEditableSpans } from './compress';
import { extractTopJobTerms } from './micro';

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
    if (out.length >= 4) break;
  }

  return out;
}

/**
 * Sentence-level rephrase templates — used only when the local LLM call fails.
 * Integrates job terms into natural phrasing instead of appending keyword lists.
 */
export function rephraseSpanForJob(
  text: string,
  keywords: string[],
  jobTitle: string,
): string | null {
  const trimmed = text.trim();
  if (!trimmed || keywords.length === 0) return null;

  const k1 = keywords[0];
  const k2 = keywords[1];
  const roleWord = titleTerms({ title: jobTitle } as JobPosting)[0] ?? k1;

  const yearsMatch = trimmed.match(
    /(\d+\+?\s*years?)(?:\s+of)?\s+(experience|expertise)?/i,
  );
  if (yearsMatch && k1 && !containsTerm(trimmed, k1)) {
    const replacement = yearsMatch[2]
      ? `${yearsMatch[1]} of ${k1} ${yearsMatch[2]}`
      : `${yearsMatch[1]} of ${k1} experience`;
    return trimmed.replace(yearsMatch[0], replacement);
  }

  const usingMatch = trimmed.match(/\busing\s+([^,.;]+)/i);
  if (usingMatch && k1 && !containsTerm(usingMatch[1], k1)) {
    return trimmed.replace(usingMatch[0], `using ${k1} and ${usingMatch[1].trim()}`);
  }

  const verbMatch = trimmed.match(/\b(built|developed|designed|delivered|led)\s+([^,.;]+)/i);
  if (verbMatch && k1 && !containsTerm(verbMatch[2], k1)) {
    return trimmed.replace(
      verbMatch[0],
      `${verbMatch[1]} ${verbMatch[2].trim()} with ${k1}`,
    );
  }

  const engineerMatch = trimmed.match(
    /^(.*?)\b(engineer|developer|architect)\b(.*)$/i,
  );
  if (engineerMatch && roleWord && !containsTerm(trimmed, roleWord)) {
    const focus = roleWord.charAt(0).toUpperCase() + roleWord.slice(1);
    return trimmed.replace(
      engineerMatch[2],
      `${focus}-focused ${engineerMatch[2].toLowerCase()}`,
    );
  }

  const colonIdx = trimmed.indexOf(':');
  if (colonIdx > 0 && colonIdx < 40) {
    const head = trimmed.slice(0, colonIdx + 1);
    const rest = trimmed.slice(colonIdx + 1).trim();
    const toAdd = keywords.filter((k) => !containsTerm(rest, k)).slice(0, 2);
    if (toAdd.length > 0) {
      if (rest) {
        const joiner = toAdd.length === 1 ? toAdd[0] : `${toAdd[0]} and ${toAdd[1]}`;
        return `${head} ${rest}, including ${joiner}`;
      }
      return `${head} ${toAdd.join(', ')}`;
    }
  }

  const base = stripEndPunct(trimmed);
  if (k1 && k2) {
    return `${base}, with ${k1} and ${k2}.`;
  }
  if (k1) {
    return `${base}, with ${k1}.`;
  }

  return null;
}

function applyRephrase(text: string, keywords: string[], jobTitle: string): string | null {
  const revised = rephraseSpanForJob(text, keywords, jobTitle);
  if (!revised) return null;
  if (revised.trim().toLowerCase() === text.trim().toLowerCase()) return null;
  if (revised.length > 320) return revised.slice(0, 320);
  return revised;
}

/**
 * Rule-based edits — instant, no LLM. Rephrases phrases for role fit, not keyword dumps.
 */
export function buildInstantEdits(resume: ParsedResume, job: JobPosting): ResumeChange[] {
  const spans = extractEditableSpans(resume, 6);
  const changes: ResumeChange[] = [];
  let n = 1;

  for (const span of spans) {
    const keywords = keywordsForSpan(span.text, job);
    if (keywords.length === 0) continue;

    const revised = applyRephrase(span.text, keywords, job.title);
    if (!revised) continue;

    changes.push({
      id: `i${n++}`,
      section: span.section,
      original: span.text,
      revised,
      reason: 'Rephrased for role fit',
      accepted: true,
    });

    if (changes.length >= 2) break;
  }

  return changes;
}

/** Always produces at least one edit when job + resume exist. */
export function buildGuaranteedEdits(resume: ParsedResume, job: JobPosting): ResumeChange[] {
  const instant = buildInstantEdits(resume, job);
  if (instant.length > 0) return instant;

  const spans = extractEditableSpans(resume, 3);
  const keywords = extractTopJobTerms(job, 5);
  const span = spans[0];
  if (!span) return [];

  if (keywords.length > 0) {
    const revised = applyRephrase(span.text, keywords, job.title);
    if (revised) {
      return [
        {
          id: 'g1',
          section: span.section,
          original: span.text,
          revised,
          reason: 'Aligned phrasing with job posting',
          accepted: true,
        },
      ];
    }
  }

  const title = job.title.trim();
  if (title.length > 2 && !containsTerm(span.text, title)) {
    const base = stripEndPunct(span.text);
    const rolePhrase = title.replace(/\b(engineer|developer|manager)\b/i, '').trim() || title;
    const revised = `${base} targeting ${rolePhrase} opportunities.`;
    return [
      {
        id: 'g1',
        section: span.section,
        original: span.text,
        revised: revised.slice(0, 320),
        reason: 'Referenced target role',
        accepted: true,
      },
    ];
  }

  return [];
}
