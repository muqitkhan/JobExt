import type { ParsedResume, ResumeChange } from '../types';
import { applyChangeToText } from '../llm/prompts';

function decodeSource(resume: ParsedResume): string {
  try {
    return new TextDecoder('utf-8').decode(resume.sourceBytes);
  } catch {
    return resume.plainText;
  }
}

export function exportTextPreserve(resume: ParsedResume, changes: ResumeChange[]): ArrayBuffer {
  let text = decodeSource(resume);

  for (const change of changes.filter((c) => c.accepted && c.original.trim())) {
    text = applyChangeToText(text, change);
  }

  if (resume.format === 'rtf' && !text.startsWith('{\\rtf')) {
    text = `{\\rtf1\\ansi\\deff0 ${text.replace(/\n/g, '\\par ')}}`;
  }

  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}
