import type { ParsedResume } from '../types';
import { splitIntoSections } from '../parsers/sections';
import { getLocalMicroLimits } from './models';
import { TAILOR_WRITING_RULES, formatMissingKeywordsBlock } from './tailor-guidance';

export interface EditableSpan {
  id: string;
  section: string;
  /** Exact substring from resume.plainText */
  text: string;
}

const BULLET_PREFIX = /^[\s•●▪\-*–—]+\s*/;
const MAX_LINE_CHARS = 240;

function findInPlain(plain: string, line: string): string | null {
  const trimmed = line.trim().replace(BULLET_PREFIX, '');
  if (!trimmed) return null;

  if (plain.includes(trimmed)) return trimmed;

  const idx = plain.indexOf(line.trim());
  if (idx !== -1) return line.trim();

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;

  const pattern = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  const re = new RegExp(pattern, 'i');
  const match = re.exec(plain);
  return match ? match[0] : null;
}

/** Split long lines into sentence-sized edit targets. */
function expandEditLines(lines: string[]): string[] {
  const out: string[] = [];

  for (const line of lines) {
    const core = line.replace(BULLET_PREFIX, '').trim();
    if (!core) continue;

    if (core.length <= MAX_LINE_CHARS) {
      out.push(core);
      continue;
    }

    const sentences = core.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length >= 12);
    if (sentences.length > 1) {
      for (const s of sentences) {
        if (s.length <= MAX_LINE_CHARS) out.push(s.trim());
        else out.push(s.trim().slice(0, MAX_LINE_CHARS));
      }
    } else {
      out.push(core.slice(0, MAX_LINE_CHARS));
    }
  }

  return out;
}

/**
 * Pull short, high-value phrases from the resume for a compact LLM prompt.
 * Edits are applied back to the full plainText (original upload format preserved).
 */
export function extractEditableSpans(resume: ParsedResume, maxSpans: number): EditableSpan[] {
  const plain = resume.plainText;
  const sections =
    resume.sections.length > 0 ? resume.sections : splitIntoSections(plain);

  const priority = [/summary|profile|objective/i, /skills|competencies/i, /experience|employment/i];
  const ordered = [...sections].sort((a, b) => {
    const rank = (name: string) => {
      const idx = priority.findIndex((p) => p.test(name));
      return idx === -1 ? priority.length : idx;
    };
    return rank(a.name) - rank(b.name);
  });

  const spans: EditableSpan[] = [];
  let n = 1;

  for (const section of ordered) {
    const rawLines = section.content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const lines = expandEditLines(rawLines);

    for (const core of lines) {
      if (core.length < 12) continue;
      if (/^https?:\/\//i.test(core) || /@/.test(core)) continue;

      const text = findInPlain(plain, core);
      if (!text) continue;

      spans.push({
        id: `s${n++}`,
        section: section.name,
        text,
      });

      if (spans.length >= maxSpans) return spans;
    }
  }

  if (spans.length === 0 && plain.trim().length >= 12) {
    const chunk = plain.trim().slice(0, MAX_LINE_CHARS);
    spans.push({ id: 's1', section: 'Resume', text: chunk });
  }

  return spans;
}

/** Phrases for local micro-edits — prefers shorter lines but allows full sentences. */
export function extractMicroSpans(resume: ParsedResume): EditableSpan[] {
  const { maxSpans, maxSpanChars } = getLocalMicroLimits();
  const spans = extractEditableSpans(resume, maxSpans + 4);

  const sorted = [...spans].sort((a, b) => a.text.length - b.text.length);
  const short = sorted.filter((s) => s.text.length <= maxSpanChars);
  const pool = short.length > 0 ? short : sorted;

  return pool.slice(0, maxSpans);
}

export function buildCompressedDigest(spans: EditableSpan[]): string {
  return spans.map((s) => `[${s.id}] ${s.text}`).join('\n');
}

export function buildCompressedTailorPrompt(
  jobTitle: string,
  jobDescription: string,
  digest: string,
  maxChanges: number,
  missingKeywords: string[] = [],
): string {
  const missing = formatMissingKeywordsBlock(missingKeywords.slice(0, 10));
  return `Rephrase resume lines for this job. Max ${maxChanges} edits.
Rules: copy "original" exactly from a PHRASE below; "revised" must be a natural X–Y–Z accomplishment rewrite (same facts, better role fit) — not a keyword list or comma-appended terms; no invented facts; JSON only.
${TAILOR_WRITING_RULES}
Missing keywords (weave with business context): ${missing}

JOB: ${jobTitle}
DESCRIPTION:
${jobDescription}

PHRASES (copy original verbatim):
${digest}

{"changes":[{"id":"c1","original":"phrase from above","revised":"human-sounding rewrite","reason":"brief"}]}`;
}

/** Map LLM changes onto full resume text using extracted spans. */
export function anchorChangesToResume(
  changes: import('../types').ResumeChange[],
  spans: EditableSpan[],
  plainText: string,
): import('../types').ResumeChange[] {
  const spanByText = new Map(spans.map((s) => [s.text.toLowerCase(), s]));

  return changes.map((c) => {
    const key = c.original.trim().toLowerCase();
    const span = spanByText.get(key);
    if (span) {
      return { ...c, original: span.text, section: span.section };
    }
    if (findInPlain(plainText, c.original)) {
      const anchored = findInPlain(plainText, c.original)!;
      return { ...c, original: anchored };
    }
    return c;
  });
}
