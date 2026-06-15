import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ParsedResume, PdfTextRun } from '../types';
import { splitIntoSections } from './sections';

type ParsedResumeContent = Omit<ParsedResume, 'sourceBytes'>;

let workerConfigured = false;

function configurePdfWorker(): void {
  if (workerConfigured) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
  workerConfigured = true;
}

function assertDomContext(): void {
  if (typeof document === 'undefined') {
    throw new Error(
      'PDF parsing cannot run in the extension background worker. Upload from the JobExt side panel.',
    );
  }
}

export async function parsePdf(buffer: ArrayBuffer, fileName: string): Promise<ParsedResumeContent> {
  assertDomContext();
  configurePdfWorker();

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: string[] = [];
  const pdfTextRuns: PdfTextRun[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageIndex = i - 1;
    const pageParts: string[] = [];

    for (const item of content.items) {
      if (!('str' in item) || !item.str) continue;
      const tx = item.transform;
      const fontSize = Math.max(Math.abs(tx[0] ?? 0), Math.abs(tx[3] ?? 0), 10);
      pdfTextRuns.push({
        pageIndex,
        str: item.str,
        x: tx[4] ?? 0,
        y: tx[5] ?? 0,
        width: item.width ?? 0,
        height: item.height ?? fontSize,
        fontSize,
      });
      pageParts.push(item.str);
    }

    pages.push(pageParts.join(' '));
  }

  const plainText = pages.join('\n\n').trim();
  return {
    format: 'pdf',
    fileName,
    plainText,
    sections: splitIntoSections(plainText),
    pdfTextRuns,
  };
}
