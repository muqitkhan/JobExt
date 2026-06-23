import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import type { PdfTextRun, ResumeChange } from '../types';
import { findOriginalSpan } from '../llm/prompts';
import { sanitizeForPdfText } from './pdf-text';
import { alignBlocksToTailored } from './text-align';

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

interface PdfLine {
  pageIndex: number;
  y: number;
  runs: PdfTextRun[];
  text: string;
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

export function groupRunsIntoLines(runs: PdfTextRun[]): PdfLine[] {
  const yThreshold = 4;
  const lines: PdfLine[] = [];

  for (const run of runs) {
    let line = lines.find(
      (entry) => entry.pageIndex === run.pageIndex && Math.abs(entry.y - run.y) <= yThreshold,
    );
    if (!line) {
      lines.push({ pageIndex: run.pageIndex, y: run.y, runs: [run], text: run.str });
      continue;
    }
    line.runs.push(run);
    line.y = (line.y + run.y) / 2;
    line.text += run.str;
  }

  for (const line of lines) {
    line.runs.sort((a, b) => a.x - b.x);
    line.text = line.runs.map((run) => run.str).join('');
  }

  return lines.sort(
    (a, b) => b.pageIndex - a.pageIndex || b.y - a.y || (a.runs[0]?.x ?? 0) - (b.runs[0]?.x ?? 0),
  );
}

function wrapTextToWidth(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(test, fontSize);
    if (width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

function drawLineOverlay(
  page: ReturnType<PDFDocument['getPages']>[number],
  box: BBox,
  text: string,
  font: PDFFont,
  pageWidth: number,
): void {
  const fontSize = Math.min(Math.max(box.fontSize, 8), 14);
  const maxWidth = Math.max(box.width, pageWidth - box.x - 36);
  const lines = wrapTextToWidth(text, font, fontSize, maxWidth);
  const lineHeight = fontSize * 1.25;
  const totalHeight = Math.max(box.height, lines.length * lineHeight);
  const pad = 2;

  page.drawRectangle({
    x: box.x - pad,
    y: box.y - pad,
    width: maxWidth + pad * 2,
    height: totalHeight + pad * 2,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });

  for (let i = 0; i < lines.length; i++) {
    page.drawText(lines[i], {
      x: box.x,
      y: box.y - i * lineHeight,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
  }
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
    drawLineOverlay(page, box, revised, font, page.getWidth());
    appliedCount++;
  }

  const bytes = await pdfDoc.save();
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return { buffer, appliedCount };
}

/** Overlay only changed PDF lines so untouched text keeps original fonts and colors. */
export async function exportPdfLineSync(
  sourceBytes: ArrayBuffer,
  textRuns: PdfTextRun[],
  originalPlain: string,
  tailoredPlain: string,
): Promise<{ buffer: ArrayBuffer; appliedCount: number }> {
  const lines = groupRunsIntoLines(textRuns);
  const lineTexts = lines.map((line) => line.text);
  const replacements = alignBlocksToTailored(lineTexts, originalPlain, tailoredPlain);
  if (replacements.size === 0) {
    return { buffer: sourceBytes.slice(0), appliedCount: 0 };
  }

  const pdfDoc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  let appliedCount = 0;

  for (const [lineIndex, revisedText] of replacements.entries()) {
    const line = lines[lineIndex];
    if (!line || line.runs.length === 0) continue;

    const page = pages[line.pageIndex];
    if (!page) continue;

    const box = bboxFromRuns(line.runs);
    drawLineOverlay(page, box, sanitizeForPdfText(revisedText), font, page.getWidth());
    appliedCount++;
  }

  const bytes = await pdfDoc.save();
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return { buffer, appliedCount };
}
