/** Positioned text fragment from a PDF page content stream. */
export interface PdfLayoutItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfLayoutResult {
  text: string;
  multiColumnLikely: boolean;
}

/** Group items into reading-order lines (top→bottom, left→right). */
export function layoutPdfItems(items: PdfLayoutItem[]): PdfLayoutResult {
  if (items.length === 0) {
    return { text: '', multiColumnLikely: false };
  }

  const avgHeight =
    items.reduce((sum, it) => sum + (it.height || 10), 0) / Math.max(items.length, 1);
  const lineTolerance = Math.max(avgHeight * 0.6, 3);

  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PdfLayoutItem[][] = [];

  for (const item of sorted) {
    const line = lines.find((row) => Math.abs(row[0].y - item.y) <= lineTolerance);
    if (line) line.push(item);
    else lines.push([item]);
  }

  for (const line of lines) {
    line.sort((a, b) => a.x - b.x);
  }

  const multiColumnLikely = detectMultiColumnLayout(lines);

  const text = lines
    .map((line) => joinLine(line))
    .filter(Boolean)
    .join('\n');

  return { text, multiColumnLikely };
}

function joinLine(line: PdfLayoutItem[]): string {
  if (line.length === 0) return '';
  const parts: string[] = [line[0].str];
  for (let i = 1; i < line.length; i++) {
    const prev = line[i - 1];
    const cur = line[i];
    const gap = cur.x - (prev.x + prev.width);
    parts.push(gap > 1.5 ? ' ' : '');
    parts.push(cur.str);
  }
  return parts.join('').replace(/\s+/g, ' ').trim();
}

/** Wide x spread or large mid-line gaps suggest multi-column templates. */
export function detectMultiColumnLayout(lines: PdfLayoutItem[][]): boolean {
  for (const line of lines) {
    if (line.length < 2) continue;

    const left = line[0].x;
    const right = line[line.length - 1].x + line[line.length - 1].width;
    const span = right - left;
    if (span < 120) continue;

    const xs = line.map((it) => it.x);
    const xRange = Math.max(...xs) - Math.min(...xs);
    if (xRange > 200 && line.length >= 3) return true;

    for (let i = 0; i < line.length - 1; i++) {
      const gap = line[i + 1].x - (line[i].x + line[i].width);
      if (gap > 50 && span > 180) return true;
    }
  }
  return false;
}
