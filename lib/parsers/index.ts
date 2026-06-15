import type { ParsedResume, ResumeFormat } from '../types';
import { splitIntoSections } from './sections';
import { cloneArrayBuffer } from '../utils/buffer';

type ParsedResumeContent = Omit<ParsedResume, 'sourceBytes'>;

function stripRtf(rtf: string): string {
  return rtf
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\line/g, '\n')
    .replace(/\\tab/g, '\t')
    .replace(/\\[a-z]+\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseText(buffer: ArrayBuffer, fileName: string, format: 'txt' | 'rtf'): ParsedResumeContent {
  const decoder = new TextDecoder('utf-8');
  const raw = decoder.decode(buffer);
  const plainText = format === 'rtf' ? stripRtf(raw) : raw.trim();

  return {
    format,
    fileName,
    plainText,
    sections: splitIntoSections(plainText),
  };
}

export function detectFormat(fileName: string, mimeType?: string): ResumeFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.docx') || mimeType?.includes('wordprocessingml')) return 'docx';
  if (lower.endsWith('.pdf') || mimeType === 'application/pdf') return 'pdf';
  if (lower.endsWith('.txt') || mimeType === 'text/plain') return 'txt';
  if (lower.endsWith('.rtf') || mimeType === 'application/rtf') return 'rtf';
  return null;
}

export async function parseResume(
  buffer: ArrayBuffer,
  fileName: string,
  mimeType?: string,
): Promise<ParsedResume> {
  const format = detectFormat(fileName, mimeType);
  if (!format) {
    throw new Error('Unsupported file format. Please upload DOCX, PDF, TXT, or RTF.');
  }

  // Clone before parsers that may detach the buffer (pdf.js, mammoth).
  const sourceBytes = cloneArrayBuffer(buffer);

  let parsed: ParsedResumeContent;
  switch (format) {
    case 'docx': {
      const { parseDocx } = await import('./docx');
      parsed = await parseDocx(buffer, fileName);
      break;
    }
    case 'pdf': {
      const { parsePdf } = await import('./pdf');
      parsed = await parsePdf(buffer, fileName);
      break;
    }
    case 'txt':
    case 'rtf':
      parsed = parseText(buffer, fileName, format);
      break;
  }

  return { ...parsed, sourceBytes };
}
