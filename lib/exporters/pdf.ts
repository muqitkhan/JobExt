import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { ParsedResume } from '../types';
import { sanitizeForPdfText } from './pdf-text';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const LINE_HEIGHT = 14;
const FONT_SIZE = 11;

export async function exportPdf(text: string, _original: ParsedResume): Promise<ArrayBuffer> {
  const safeText = sanitizeForPdfText(text);
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  const maxWidth = PAGE_WIDTH - MARGIN * 2;

  const wrapLine = (line: string): string[] => {
    const words = line.split(' ');
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      const width = font.widthOfTextAtSize(test, FONT_SIZE);
      if (width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  };

  const lines = safeText.split('\n');
  for (const rawLine of lines) {
    const wrapped = wrapLine(rawLine);
    for (const line of wrapped) {
      if (y < MARGIN) {
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }
      page.drawText(line, {
        x: MARGIN,
        y,
        size: FONT_SIZE,
        font,
        color: rgb(0, 0, 0),
      });
      y -= LINE_HEIGHT;
    }
  }

  const bytes = await pdfDoc.save();
  const slice = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return slice as ArrayBuffer;
}
