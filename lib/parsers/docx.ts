import mammoth from 'mammoth';
import type { ParsedResume } from '../types';
import { splitIntoSections } from './sections';

type ParsedResumeContent = Omit<ParsedResume, 'sourceBytes'>;

export async function parseDocx(buffer: ArrayBuffer, fileName: string): Promise<ParsedResumeContent> {
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  const plainText = result.value.trim();
  return {
    format: 'docx',
    fileName,
    plainText,
    sections: splitIntoSections(plainText),
  };
}
