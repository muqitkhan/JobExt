import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PdfTextRun, ResumeChange } from '../types';
import { findOriginalSpan } from '../llm/prompts';
import { sanitizeForPdfText } from './pdf-text';

interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  pageIndex: number;
}

interface RunSpanIndex {
  run: PdfTextRun;
  start: number;
  end: number;
}

function bboxFromRuns(runs: PdfTextRun[]): BBox {
  const x0 = Math.min(...runs.map((r) => r.x));
  const y0 = Math.min(...runs.map((r) => r.y));
  const x1 = Math.max(...runs.map((r) => r.x + r.width));
  const y1 = Math.max(...runs.map((r) => r.y + r.height));
  return {
    x: x0,
    y: y0,
    width: x1 - x0,
    height: y1 - y0,
    fontSize: runs[0]?.fontSize ?? 11,
    pageIndex: runs[0]?.pageIndex ?? 0,
  };
}

function buildRunSpanIndex(runs: PdfTextRun[], spaced: boolean): { plain: string; index: RunSpanIndex[] } {
  const index: RunSpanIndex[] = [];
  let plain = '';

  for (const run of runs) {
    if (spaced && plain.length > 0) plain += ' ';
    const start = plain.length;
    plain += run.str;
    index.push({ run, start, end: plain.length });
  }

  return { plain, index };
}

export function mapSpanToRuns(
  runs: PdfTextRun[],
  span: { start: number; end: number },
  spaced: boolean,
): PdfTextRun[] | null {
  const { index } = buildRunSpanIndex(runs, spaced);
  const matched = index.filter((entry) => entry.end > span.start && entry.start < span.end);
  if (matched.length === 0) return null;
  return matched.map((entry) => entry.run);
}

function findPhraseRunsOnPage(pageRuns: PdfTextRun[], phrase: string): PdfTextRun[] | null {
  for (const spaced of [false, true]) {
    const { plain } = buildRunSpanIndex(pageRuns, spaced);
    const span = findOriginalSpan(plain, phrase);
    if (!span) continue;
    const mapped = mapSpanToRuns(pageRuns, span, spaced);
    if (mapped && mapped.length > 0) return mapped;
  }
  return null;
}

export function findPhraseRuns(runs: PdfTextRun[], phrase: string): PdfTextRun[] | null {
  const target = phrase.trim();
  if (!target) return null;

  const byPage = new Map<number, PdfTextRun[]>();
  for (const run of runs) {
    const list = byPage.get(run.pageIndex) ?? [];
    list.push(run);
    byPage.set(run.pageIndex, list);
  }

  for (const pageRuns of byPage.values()) {
    const matched = findPhraseRunsOnPage(pageRuns, target);
    if (matched) return matched;
  }

  return null;
}

export async function exportPdfPreserve(
  sourceBytes: ArrayBuffer,
  textRuns: PdfTextRun[],
  changes: ResumeChange[],
): Promise<{ buffer: ArrayBuffer; appliedCount: number }> {
  const pdfDoc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const accepted = changes.filter((c) => c.accepted && c.original.trim());
  let appliedCount = 0;

  for (const change of accepted) {
    const matched = findPhraseRuns(textRuns, change.original);
    if (!matched) continue;

    const box = bboxFromRuns(matched);
    const page = pages[box.pageIndex];
    if (!page) continue;

    const revised = sanitizeForPdfText(change.revised);
    const pad = 2;

    page.drawRectangle({
      x: box.x - pad,
      y: box.y - pad,
      width: box.width + pad * 2,
      height: box.height + pad * 2,
      color: rgb(1, 1, 1),
      borderWidth: 0,
    });

    page.drawText(revised, {
      x: box.x,
      y: box.y,
      size: Math.min(box.fontSize, 14),
      font,
      color: rgb(0, 0, 0),
    });
    appliedCount++;
  }

  const bytes = await pdfDoc.save();
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return { buffer, appliedCount };
}
