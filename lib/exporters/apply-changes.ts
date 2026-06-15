import { findOriginalSpan } from '../llm/prompts';
import type { ResumeChange } from '../types';

function normalizeForMatch(text: string): string {
  return text
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u2011/g, '-')
    .replace(/\u00A0/g, ' ');
}

function anchorOriginal(plainText: string, original: string): string | null {
  const span = findOriginalSpan(plainText, original);
  if (span) return plainText.slice(span.start, span.end);

  const parts = original.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const pattern = parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
    const match = new RegExp(pattern, 'i').exec(plainText);
    if (match) return plainText.slice(match.index, match.index + match[0].length);
  }

  return null;
}

/** Re-anchor change originals to text actually present in plainText before preserve export. */
export function resolveChangesForExport(
  plainText: string,
  changes: ResumeChange[],
  options?: { aggressive?: boolean },
): ResumeChange[] {
  return changes.map((change) => {
    if (!change.accepted || !change.original.trim()) return change;

    const anchored = anchorOriginal(plainText, change.original);
    if (anchored) {
      if (anchored === change.original) return change;
      return { ...change, original: anchored };
    }

    if (!options?.aggressive) return change;

    const normPlain = normalizeForMatch(plainText);
    const normOrig = normalizeForMatch(change.original);
    const normSpan = findOriginalSpan(normPlain, normOrig);
    if (!normSpan) return change;

    const matchedNorm = normPlain.slice(normSpan.start, normSpan.end);
    const fallback = anchorOriginal(plainText, matchedNorm);
    if (!fallback) return change;
    if (fallback === change.original) return change;
    return { ...change, original: fallback };
  });
}
