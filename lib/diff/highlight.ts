import { diffWords } from 'diff';
import type { ResumeChange } from '../types';
import { buildFullTextFromChanges, findOriginalSpan } from '../llm/prompts';

export interface DiffPart {
  value: string;
  added?: boolean;
  removed?: boolean;
}

export function computeWordDiff(original: string, revised: string): DiffPart[] {
  return diffWords(original, revised);
}

export function computeChangeDiff(change: ResumeChange): DiffPart[] {
  if (!change.accepted) {
    return [{ value: change.original }];
  }
  return diffWords(change.original, change.revised);
}

type LocatedChange = {
  change: ResumeChange;
  span: { start: number; end: number };
};

function locateChanges(originalText: string, changes: ResumeChange[]): LocatedChange[] {
  const located: LocatedChange[] = [];

  for (const change of changes) {
    if (!change.original.trim()) continue;
    const span = findOriginalSpan(originalText, change.original);
    if (!span) continue;
    located.push({ change, span });
  }

  located.sort((a, b) => a.span.start - b.span.start);

  const nonOverlapping: LocatedChange[] = [];
  let lastEnd = -1;
  for (const item of located) {
    if (item.span.start >= lastEnd) {
      nonOverlapping.push(item);
      lastEnd = item.span.end;
    }
  }

  return nonOverlapping;
}

function buildReviewParts(originalText: string, located: LocatedChange[]): DiffPart[] {
  const parts: DiffPart[] = [];
  let cursor = 0;

  for (const { change, span } of located) {
    if (span.start > cursor) {
      parts.push({ value: originalText.slice(cursor, span.start) });
    }
    parts.push({ value: originalText.slice(span.start, span.end), removed: true });
    parts.push({ value: change.revised, added: true });
    cursor = span.end;
  }

  if (cursor < originalText.length) {
    parts.push({ value: originalText.slice(cursor) });
  }

  return parts.length > 0 ? parts : [{ value: originalText }];
}

function buildAppliedParts(displayText: string, located: LocatedChange[]): DiffPart[] {
  let offset = 0;
  const regions: { start: number; end: number }[] = [];

  for (const { change, span } of located) {
    if (!change.accepted) continue;
    const start = span.start + offset;
    const end = start + change.revised.length;
    regions.push({ start, end });
    offset += change.revised.length - (span.end - span.start);
  }

  if (regions.length === 0) {
    return [{ value: displayText }];
  }

  const parts: DiffPart[] = [];
  let cursor = 0;

  for (const region of regions) {
    if (region.start > cursor) {
      parts.push({ value: displayText.slice(cursor, region.start) });
    }
    parts.push({ value: displayText.slice(region.start, region.end), added: true });
    cursor = region.end;
  }

  if (cursor < displayText.length) {
    parts.push({ value: displayText.slice(cursor) });
  }

  return parts;
}

export function buildDisplayText(
  originalText: string,
  changes: ResumeChange[],
  showRejected: boolean,
): { parts: DiffPart[]; displayText: string } {
  const accepted = changes.filter((c) => c.accepted);
  const displayText = buildFullTextFromChanges(originalText, accepted);

  if (changes.length === 1 && changes[0].id === 'full') {
    const parts = showRejected
      ? diffWords(originalText, displayText)
      : [{ value: displayText }];
    return { parts, displayText };
  }

  const located = locateChanges(originalText, changes);

  if (located.length === 0) {
    return { parts: [{ value: displayText }], displayText };
  }

  const parts = showRejected
    ? buildReviewParts(originalText, located)
    : buildAppliedParts(displayText, located);

  return { parts, displayText };
}

export function getFinalText(originalText: string, changes: ResumeChange[]): string {
  return buildFullTextFromChanges(originalText, changes.filter((c) => c.accepted));
}
