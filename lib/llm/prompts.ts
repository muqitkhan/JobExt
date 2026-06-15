import type { JobPosting, ResumeChange, TailorResult } from '../types';
import { getProfileLimits } from './models';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Match `original` in `text` even when whitespace differs slightly. */
export function findOriginalSpan(text: string, original: string): { start: number; end: number } | null {
  const needle = original.trim();
  if (!needle) return null;

  const exact = text.indexOf(needle);
  if (exact !== -1) {
    return { start: exact, end: exact + needle.length };
  }

  const parts = needle.split(/\s+/).filter(Boolean).map(escapeRegex);
  if (parts.length === 0) return null;

  const pattern = new RegExp(parts.join('\\s+'), 'i');
  const match = pattern.exec(text);
  if (!match) return null;

  return { start: match.index, end: match.index + match[0].length };
}

export function applyChangeToText(text: string, change: ResumeChange): string {
  if (!change.accepted || !change.original.trim()) return text;

  const span = findOriginalSpan(text, change.original);
  if (!span) return text;

  return text.slice(0, span.start) + change.revised + text.slice(span.end);
}

const FAST_OUTPUT_SHAPE = `{"changes":[{"id":"c1","original":"exact phrase from RESUME","revised":"tweaked phrase","reason":"brief"}]}`;

export function buildTailorPrompt(
  job: JobPosting,
  resumeText: string,
  profile: 'fast' | 'quality',
): string {
  const limits = getProfileLimits(profile);

  if (profile === 'fast') {
    return `Match this resume to the job with at most ${limits.maxChanges} tiny phrase swaps.
Rules: copy "original" exactly from RESUME; "revised" must use different words; same layout/tone; no invented facts; JSON only.

JOB: ${job.title}
DESCRIPTION:
${job.description}

RESUME:
${resumeText}

${FAST_OUTPUT_SHAPE}`;
  }

  const outputShape = `{
  "changes": [
    {
      "id": "c1",
      "section": "Experience",
      "original": "exact phrase copied from RESUME",
      "revised": "same phrase with minimal wording tweak",
      "reason": "brief reason"
    }
  ],
  "fullText": "optional — omit unless changes cannot be expressed as phrases"
}`;

  return `Tailor this resume for the job below. Return up to ${limits.maxChanges} phrase-level edits.

Rules:
- Preserve the RESUME layout exactly: same sections, bullets, blank lines, line breaks, and order.
- Make surgical edits only. "original" must be copied verbatim from RESUME.
- Sound like the candidate wrote it — no buzzword stuffing or corporate filler.
- Never invent experience or credentials.
- Return ONLY valid JSON, no markdown fences.

JOB: ${job.title}${job.company ? ` @ ${job.company}` : ''}

JOB DESCRIPTION:
${job.description}

RESUME:
${resumeText}

JSON shape:
${outputShape}`;
}

export function buildSystemPrompt(profile: 'fast' | 'quality'): string {
  if (profile === 'fast') {
    return 'JobExt. Valid JSON only. Max 3 phrase edits. revised must differ from original. Omit fullText.';
  }
  return `You are JobExt. Valid JSON only. Small human-sounding phrase edits. Preserve resume layout and line breaks.`;
}

/** Try to salvage JSON from a messy model response without a second LLM call. */
export function repairTailorJson(raw: string): string {
  let jsonStr = raw.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();

  const start = jsonStr.indexOf('{');
  const end = jsonStr.lastIndexOf('}');
  if (start === -1 || end === -1) return jsonStr;

  jsonStr = jsonStr.slice(start, end + 1);
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
  return jsonStr;
}

export function parseTailorResponse(raw: string): TailorResult {
  let jsonStr = repairTailorJson(raw);

  const parsed = JSON.parse(jsonStr) as {
    changes?: Array<Partial<ResumeChange>>;
    fullText?: string;
  };

  const changes: ResumeChange[] = (parsed.changes ?? []).map((c, i) => ({
    id: c.id ?? `c${i + 1}`,
    section: c.section ?? 'General',
    original: c.original ?? '',
    revised: c.revised ?? '',
    reason: c.reason ?? '',
    accepted: true,
  }));

  const fullText = typeof parsed.fullText === 'string' ? parsed.fullText.trim() : '';

  return { changes, fullText };
}

export function parseTailorResponseWithRepair(raw: string): TailorResult {
  try {
    return parseTailorResponse(raw);
  } catch {
    const repaired = repairTailorJson(raw)
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'");
    return parseTailorResponse(repaired);
  }
}

export function applyChangesToText(baseText: string, changes: ResumeChange[]): string {
  let text = baseText;
  for (const change of changes) {
    text = applyChangeToText(text, change);
  }
  return text;
}

export function buildFullTextFromChanges(
  originalText: string,
  changes: ResumeChange[],
): string {
  return applyChangesToText(originalText, changes);
}

export function countApplicableChanges(text: string, changes: ResumeChange[]): number {
  return changes.filter((c) => c.original.trim() && findOriginalSpan(text, c.original) !== null).length;
}

export function isNoOpChange(change: ResumeChange): boolean {
  const original = change.original.trim();
  const revised = change.revised.trim();
  if (!original || !revised) return true;
  if (original === revised) return true;
  if (original.toLowerCase() === revised.toLowerCase()) return true;
  return false;
}

/** Detects crude keyword appends (original + bare keyword list or "with X and Y"). */
export function isKeywordDumpChange(change: ResumeChange): boolean {
  const original = change.original.trim();
  const revised = change.revised.trim();
  if (!original || !revised || original === revised) return false;

  const origCore = original.replace(/[.,;]+$/, '').trim();

  if (!revised.toLowerCase().startsWith(origCore.toLowerCase())) {
    return false;
  }

  const tail = revised.slice(origCore.length).trim();
  if (!tail) return false;

  if (/^—\s*.+/.test(tail)) return true;
  if (/^with\s+[\w.+#/-]+(\s+and\s+[\w.+#/-]+)*\.?$/i.test(tail)) return true;
  if (/^,\s*[\w.+#/-]+(\s*,\s*[\w.+#/-]+)+\.?$/.test(tail)) return true;

  return false;
}

export function finalizeTailorResult(originalText: string, result: TailorResult): TailorResult {
  const substantive = result.changes.filter((c) => !isNoOpChange(c));

  const matching = substantive.filter(
    (c) => c.original.trim() && findOriginalSpan(originalText, c.original) !== null,
  );
  const appliedText = buildFullTextFromChanges(originalText, matching);

  const fullTextCandidate = result.fullText?.trim() ?? '';
  const fullTextDiffers =
    fullTextCandidate.length > 20 && fullTextCandidate !== originalText.trim();

  if (matching.length > 0) {
    return {
      changes: matching,
      fullText: appliedText,
    };
  }

  if (fullTextDiffers) {
    return {
      fullText: fullTextCandidate,
      changes: [
        {
          id: 'full',
          section: 'Resume',
          original: originalText,
          revised: fullTextCandidate,
          reason: 'Full tailored resume from AI',
          accepted: true,
        },
      ],
    };
  }

  if (substantive.length === 0 && result.changes.length > 0) {
    throw new Error(
      'AI returned identical text (no real edits). Retry or pick a different local model in Settings.',
    );
  }

  if (result.changes.length === 0) {
    throw new Error('AI returned no edits. Try again or switch to a larger model in settings.');
  }

  throw new Error(
    'AI edits could not be matched to your resume. Re-upload and retry, or pick a different model.',
  );
}