import { findOriginalSpan } from '../llm/prompts';

export function splitResumeLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split('\n');
}

export function collapseForMatch(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function linesEquivalent(a: string, b: string): boolean {
  const aTrim = a.trim();
  const bTrim = b.trim();
  if (!aTrim || !bTrim) return false;

  if (collapseForMatch(aTrim) === collapseForMatch(bTrim)) return true;
  if (findOriginalSpan(aTrim, bTrim) || findOriginalSpan(bTrim, aTrim)) return true;

  const ca = collapseForMatch(aTrim);
  const cb = collapseForMatch(bTrim);
  return ca.length >= 8 && cb.length >= 8 && (ca.includes(cb) || cb.includes(ca));
}

/** Map source line index → tailored replacement when text differs. */
export function buildTailoredLineMap(
  originalPlain: string,
  tailoredPlain: string,
): Map<number, string> {
  const origLines = splitResumeLines(originalPlain);
  const tailoredLines = splitResumeLines(tailoredPlain);
  const replacements = new Map<number, string>();

  const limit = Math.max(origLines.length, tailoredLines.length);
  for (let i = 0; i < limit; i++) {
    const orig = origLines[i] ?? '';
    const tailored = tailoredLines[i] ?? orig;
    if (!orig.trim() || !tailored.trim()) continue;
    if (collapseForMatch(orig) === collapseForMatch(tailored)) continue;
    replacements.set(i, tailored.trim());
  }

  return replacements;
}

/** Align block texts (e.g. DOCX paragraphs) to resume lines and return tailored replacements. */
export function alignBlocksToTailored(
  blockTexts: string[],
  originalPlain: string,
  tailoredPlain: string,
): Map<number, string> {
  const origLines = splitResumeLines(originalPlain);
  const tailoredLines = splitResumeLines(tailoredPlain);
  const replacements = new Map<number, string>();

  let lineCursor = 0;
  for (let blockIdx = 0; blockIdx < blockTexts.length; blockIdx++) {
    const block = blockTexts[blockIdx]?.trim() ?? '';
    if (!block) continue;

    let matched = false;
    while (lineCursor < origLines.length) {
      const orig = origLines[lineCursor];
      if (!orig.trim()) {
        lineCursor++;
        continue;
      }
      if (linesEquivalent(block, orig)) {
        const tailored = (tailoredLines[lineCursor] ?? orig).trim();
        if (tailored && !linesEquivalent(block, tailored)) {
          replacements.set(blockIdx, tailored);
        }
        lineCursor++;
        matched = true;
        break;
      }
      lineCursor++;
    }

    if (!matched) {
      let bestIdx = -1;
      let bestScore = 0;
      for (let i = 0; i < origLines.length; i++) {
        const orig = origLines[i]?.trim() ?? '';
        if (!orig) continue;
        if (!linesEquivalent(block, orig)) continue;
        const score = Math.min(block.length, orig.length);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        const tailored = (tailoredLines[bestIdx] ?? origLines[bestIdx]).trim();
        if (tailored && !linesEquivalent(block, tailored)) {
          replacements.set(blockIdx, tailored);
        }
      }
    }
  }

  return replacements;
}
