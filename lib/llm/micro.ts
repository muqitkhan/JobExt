import type { JobPosting } from '../types';
import { extractJobKeywords } from '../ats/keywords';
import type { EditableSpan } from './compress';
import { TAILOR_WRITING_RULES, formatMissingKeywordsBlock } from './tailor-guidance';

const MICRO_SYSTEM_PROMPT = `You rewrite resume lines for job fit. Same facts only — never invent employers, dates, or metrics.
${TAILOR_WRITING_RULES}
JSON only.`;

/** Top job terms for micro prompts — keeps local LLM input tiny. */
export function extractTopJobTerms(job: JobPosting, max = 8): string[] {
  const fromTitle = job.title
    .split(/[\s,/|&+-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2);

  const weighted = extractJobKeywords(job)
    .sort((a, b) => b.weight - a.weight)
    .map((t) => t.term);

  const seen = new Set<string>();
  const out: string[] = [];

  for (const term of [...fromTitle, ...weighted]) {
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
    if (out.length >= max) break;
  }

  return out;
}

export function buildSingleSpanPrompt(
  jobTitle: string,
  keywords: string[],
  span: EditableSpan,
  missingKeywords: string[] = keywords,
): string {
  const themes = keywords.slice(0, 6).join(', ');
  const missing = formatMissingKeywordsBlock(missingKeywords.slice(0, 8));
  const phrase = span.text.length > 180 ? `${span.text.slice(0, 177)}…` : span.text;
  return `Rephrase this resume line for a "${jobTitle}" role using X–Y–Z accomplishment format.

Rules:
- X: strong action verb + project/outcome; Y: quantifiable evidence from the ORIGINAL only; Z: actions, tech, methods
- Keep the same facts (years, tools, scope) — do not invent employers or credentials
- Weave missing keywords in the Z clause with business context — NOT comma-separated lists or "with X and Y" appends
- The revised line must read as if a human editor rewrote it

Themes to reflect: ${themes}
Missing keywords (require what/how/business result): ${missing}

Original:
${phrase}

Return JSON only: {"r":"rephrased line"}`;
}

export function buildMicroBatchPrompt(
  jobTitle: string,
  keywords: string[],
  digest: string,
  missingKeywords: string[] = keywords,
): string {
  const themes = keywords.slice(0, 6).join(', ');
  const missing = formatMissingKeywordsBlock(missingKeywords.slice(0, 8));
  return `Rephrase up to 2 resume lines for a "${jobTitle}" role using X–Y–Z format.

Rules: same facts only; X–Y–Z accomplishments; weave missing keywords with business context — not keyword lists; copy originals exactly from below.

Themes: ${themes}
Missing keywords: ${missing}

${digest}

{"changes":[{"id":"c1","original":"from above","revised":"human-sounding X–Y–Z rewrite","reason":"brief"}]}`;
}

export { MICRO_SYSTEM_PROMPT };

export function parseMicroRevision(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end > start) {
      const parsed = JSON.parse(trimmed.slice(start, end + 1)) as {
        r?: string;
        revised?: string;
        changes?: Array<{ revised?: string; r?: string; original?: string }>;
      };
      const fromChange = parsed.changes?.[0]?.revised ?? parsed.changes?.[0]?.r;
      const value = (parsed.r ?? parsed.revised ?? fromChange ?? '').trim();
      if (value) return value.replace(/^["']|["']$/g, '');
    }
  } catch {
    // fall through
  }

  const quoted = trimmed.match(/"r"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (quoted?.[1]) return quoted[1].replace(/\\"/g, '"').trim();

  const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1];
  if (last && last.length >= 12 && last.length <= 280 && !last.startsWith('{')) {
    return last;
  }

  return null;
}
