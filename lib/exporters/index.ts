import type { ParsedResume, ResumeChange } from '../types';
import { applyChangeToText, buildFullTextFromChanges } from '../llm/prompts';
import { resolveChangesForExport } from './apply-changes';

export function exportText(text: string, format: 'txt' | 'rtf'): ArrayBuffer {
  const encoder = new TextEncoder();
  if (format === 'txt') {
    return encoder.encode(text).buffer as ArrayBuffer;
  }
  const rtf = `{\\rtf1\\ansi\\deff0 ${text.replace(/\n/g, '\\par ')}}`;
  return encoder.encode(rtf).buffer as ArrayBuffer;
}

export function buildDownloadFileName(originalFileName: string): string {
  const dot = originalFileName.lastIndexOf('.');
  const base = dot > 0 ? originalFileName.slice(0, dot) : originalFileName;
  const ext = dot > 0 ? originalFileName.slice(dot) : '';
  const date = new Date().toISOString().slice(0, 10);
  return `${base}_${date}${ext}`;
}

function acceptedChanges(changes: ResumeChange[]): ResumeChange[] {
  return changes.filter((c) => c.accepted && c.original.trim());
}

async function exportPlainFallback(
  text: string,
  original: ParsedResume,
): Promise<ArrayBuffer> {
  switch (original.format) {
    case 'docx': {
      const { exportDocx } = await import('./docx');
      return exportDocx(text, original);
    }
    case 'pdf': {
      const { exportPdf } = await import('./pdf');
      return exportPdf(text, original);
    }
    case 'txt':
    case 'rtf':
      return exportText(text, original.format);
  }
}

async function exportPreserveWithFallback(
  resume: ParsedResume,
  changes: ResumeChange[],
  tailoredText: string,
): Promise<ArrayBuffer> {
  const resolved = resolveChangesForExport(resume.plainText, changes);

  switch (resume.format) {
    case 'docx': {
      const { exportDocxPreserve } = await import('./preserve-docx');
      let result = await exportDocxPreserve(resume.sourceBytes, resolved, resume.plainText);

      if (result.appliedCount === 0 && changes.length > 0) {
        const aggressive = resolveChangesForExport(resume.plainText, changes, { aggressive: true });
        result = await exportDocxPreserve(resume.sourceBytes, aggressive, resume.plainText);
      }

      if (result.appliedCount === 0 && changes.length > 0) {
        console.warn('[JobExt] DOCX preserve export applied 0 edits; falling back to plain export.');
        return exportPlainFallback(tailoredText, resume);
      }
      return result.buffer;
    }
    case 'pdf': {
      if (resume.pdfTextRuns && resume.pdfTextRuns.length > 0 && changes.length > 0) {
        const { exportPdfPreserve } = await import('./preserve-pdf');
        let result = await exportPdfPreserve(resume.sourceBytes, resume.pdfTextRuns, resolved);

        if (result.appliedCount === 0) {
          const aggressive = resolveChangesForExport(resume.plainText, changes, { aggressive: true });
          result = await exportPdfPreserve(resume.sourceBytes, resume.pdfTextRuns, aggressive);
        }

        if (result.appliedCount === 0) {
          console.warn('[JobExt] PDF preserve export applied 0 edits; falling back to plain export.');
          return exportPlainFallback(tailoredText, resume);
        }
        return result.buffer;
      }
      return exportPlainFallback(tailoredText, resume);
    }
    case 'txt':
    case 'rtf': {
      const { exportTextPreserve } = await import('./preserve-text');
      return exportTextPreserve(resume, changes);
    }
  }
}

/** Export tailored resume in the same format/layout as the original upload. */
export async function exportResume(
  resume: ParsedResume,
  changes: ResumeChange[],
): Promise<{ buffer: ArrayBuffer; fileName: string }> {
  const fileName = buildDownloadFileName(resume.fileName);
  const applied = acceptedChanges(changes);
  let text = resume.plainText;
  for (const c of applied) {
    text = applyChangeToText(text, c);
  }
  if (!text.trim()) {
    text = buildFullTextFromChanges(resume.plainText, applied);
  }

  let buffer: ArrayBuffer;

  try {
    buffer = await exportPreserveWithFallback(resume, applied, text);
  } catch {
    buffer = await exportPlainFallback(text, resume);
  }

  return { buffer, fileName };
}
