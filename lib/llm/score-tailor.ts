import type { JobPosting, ParsedResume, ResumeChange } from '../types';
import { scoreResumeATS } from '../ats/score';
import { containsTerm } from '../ats/keywords';
import { splitIntoSections } from '../parsers/sections';
import { extractEditableSpans } from './compress';
import { rephraseSpanForJob } from './instant-tailor';
import { buildFullTextFromChanges, isKeywordDumpChange, isNoOpChange } from './prompts';
import { buildXyzBullet } from './tailor-guidance';

const DEFAULT_TARGET_SCORE = 85;
const MAX_SCORE_EDITS = 12;

function resumeAt(plainText: string, resume: ParsedResume): ParsedResume {
  return { ...resume, plainText, sections: splitIntoSections(plainText) };
}

function isUsableChange(change: ResumeChange): boolean {
  if (isNoOpChange(change)) return false;
  return !isKeywordDumpChange(change);
}

function dedupeByOriginal(changes: ResumeChange[]): ResumeChange[] {
  const seen = new Set<string>();
  const out: ResumeChange[] = [];
  for (const change of changes) {
    const key = change.original.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(change);
  }
  return out;
}

function tryXyzEdit(
  span: { text: string; section: string },
  job: JobPosting,
  missing: string[],
  id: string,
): ResumeChange | null {
  const terms = missing.filter((t) => !containsTerm(span.text, t)).slice(0, 6);
  if (terms.length === 0) return null;

  const revised = buildXyzBullet(span.text, terms, {
    jobTitle: job.title,
    section: span.section,
  });
  if (revised.trim() === span.text.trim()) return null;

  return {
    id,
    section: span.section,
    original: span.text,
    revised,
    reason: `X–Y–Z: ${terms.slice(0, 3).join(', ')}`,
    accepted: true,
  };
}

function trySkillsContextEdit(
  plain: string,
  job: JobPosting,
  missing: string[],
): ResumeChange | null {
  const sections = splitIntoSections(plain);
  const skills = sections.find((s) => /skills|competencies|technical/i.test(s.name));
  if (!skills) return null;

  const body = skills.content.trim();
  if (body.length < 2) return null;

  return tryXyzEdit({ text: body, section: skills.name }, job, missing, 'sk-xyz');
}

function marginalScore(plain: string, job: JobPosting, changes: ResumeChange[], extra: ResumeChange): number {
  const next = buildFullTextFromChanges(plain, [...changes, extra]);
  return scoreResumeATS(next, job).overall;
}

/**
 * Greedy edits that close ATS gaps until target score (default 85) or no gains remain.
 * Uses missing keywords from the same rubric shown in the UI.
 */
export function buildScoreDrivenEdits(
  resume: ParsedResume,
  job: JobPosting,
  targetScore = DEFAULT_TARGET_SCORE,
  seedChanges: ResumeChange[] = [],
): ResumeChange[] {
  const applied: ResumeChange[] = [...seedChanges];
  let working = buildFullTextFromChanges(resume.plainText, applied);

  for (let round = 0; round < MAX_SCORE_EDITS; round++) {
    const current = scoreResumeATS(working, job);
    if (current.overall >= targetScore) break;

    const missing = current.missingKeywords;
    if (missing.length === 0) break;

    let best: { change: ResumeChange; score: number } | null = null;

    const skillsChange = trySkillsContextEdit(working, job, missing);
    if (skillsChange && isUsableChange(skillsChange)) {
      const score = marginalScore(resume.plainText, job, applied, skillsChange);
      if (score > current.overall) {
        best = { change: skillsChange, score };
      }
    }

    const spans = extractEditableSpans(resumeAt(working, resume), 12);
    for (const span of spans) {
      const terms = missing.filter((term) => !containsTerm(working, term)).slice(0, 8);
      if (terms.length === 0) continue;

      const candidates: ResumeChange[] = [];

      const xyz = tryXyzEdit(span, job, terms, `xyz-${round}-${span.id}`);
      if (xyz) candidates.push(xyz);

      const revised = rephraseSpanForJob(span.text, terms, job.title, span.section);
      if (revised && revised.trim() !== span.text.trim()) {
        candidates.push({
          id: `sd-${round}-${span.id}`,
          section: span.section,
          original: span.text,
          revised,
          reason: `X–Y–Z alignment: ${terms.slice(0, 3).join(', ')}`,
          accepted: true,
        });
      }

      for (const change of candidates) {
        if (!isUsableChange(change)) continue;
        const score = marginalScore(resume.plainText, job, applied, change);
        if (score > current.overall && (!best || score > best.score)) {
          best = { change, score };
        }
      }
    }

    if (!best) break;

    applied.push(best.change);
    working = buildFullTextFromChanges(resume.plainText, applied);
  }

  return applied.slice(seedChanges.length);
}

export function augmentChangesToTargetScore(
  resume: ParsedResume,
  job: JobPosting,
  changes: ResumeChange[],
  targetScore = DEFAULT_TARGET_SCORE,
): ResumeChange[] {
  const usable = dedupeByOriginal(changes.filter(isUsableChange).map((c) => ({ ...c, accepted: true })));
  const driven = buildScoreDrivenEdits(resume, job, targetScore, usable);
  return dedupeByOriginal([...usable, ...driven]);
}

export function scoreAfterChanges(
  resume: ParsedResume,
  job: JobPosting,
  changes: ResumeChange[],
): number {
  const text = buildFullTextFromChanges(resume.plainText, changes.filter((c) => c.accepted));
  return scoreResumeATS(text, job).overall;
}
