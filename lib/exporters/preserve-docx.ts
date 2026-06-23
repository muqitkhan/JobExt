import JSZip from 'jszip';
import type { ResumeChange } from '../types';
import { applyChangeToText, findOriginalSpan } from '../llm/prompts';
import { alignBlocksToTailored } from './text-align';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface WtNode {
  start: number;
  end: number;
  text: string;
  fullMatch: string;
  xmlIndex: number;
}

/** Concatenate all `<w:t>` text in document order (Word joins runs without spaces). */
export function extractPlainFromDocxXml(xml: string): string {
  const { plain } = parseWtNodes(xml);
  return plain;
}

function parseWtNodes(xml: string): { plain: string; nodes: WtNode[] } {
  const nodes: WtNode[] = [];
  let plain = '';
  const re = /<w:t(\s[^>]*)?>([^<]*)<\/w:t>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const text = match[2];
    const start = plain.length;
    plain += text;
    nodes.push({
      start,
      end: plain.length,
      text,
      fullMatch: match[0],
      xmlIndex: match.index,
    });
  }
  return { plain, nodes };
}

function replaceSpanInDocxXml(
  xml: string,
  nodes: WtNode[],
  span: { start: number; end: number },
  revised: string,
): string {
  const overlapping = nodes.filter((n) => n.end > span.start && n.start < span.end);
  if (overlapping.length === 0) return xml;

  let result = xml;
  for (let i = overlapping.length - 1; i >= 0; i--) {
    const node = overlapping[i];
    const isFirst = i === 0;
    const isLast = i === overlapping.length - 1;

    let newText: string;
    if (overlapping.length === 1) {
      const before = node.text.slice(0, span.start - node.start);
      const after = node.text.slice(span.end - node.start);
      newText = before + revised + after;
    } else if (isFirst) {
      newText = node.text.slice(0, span.start - node.start) + revised;
    } else if (isLast) {
      newText = node.text.slice(span.end - node.start);
    } else {
      newText = '';
    }

    const attrs = node.fullMatch.match(/<w:t(\s[^>]*)?>/)?.[1] ?? '';
    const replacement = `<w:t${attrs}>${escapeXml(newText)}</w:t>`;
    result = result.slice(0, node.xmlIndex) + replacement + result.slice(node.xmlIndex + node.fullMatch.length);
  }

  return result;
}

function buildOriginalVariants(
  original: string,
  plainText?: string,
  xmlPlain?: string,
): string[] {
  const variants: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    variants.push(trimmed);
  };

  add(original);
  if (plainText) {
    const span = findOriginalSpan(plainText, original);
    if (span) add(plainText.slice(span.start, span.end));
  }
  if (xmlPlain) {
    const span = findOriginalSpan(xmlPlain, original);
    if (span) add(xmlPlain.slice(span.start, span.end));
  }
  return variants;
}

/** Replace phrase that may be split across `<w:t>` runs in Word XML. */
export function replaceInDocxXml(
  xml: string,
  original: string,
  revised: string,
  plainText?: string,
): { xml: string; applied: boolean } {
  const from = original.trim();
  const to = revised.trim();
  if (!from || from === to) return { xml, applied: false };

  const escapedOrig = escapeXml(from);
  const escapedRev = escapeXml(to);
  if (xml.includes(escapedOrig)) {
    return { xml: xml.split(escapedOrig).join(escapedRev), applied: true };
  }
  if (xml.includes(from)) {
    return { xml: xml.split(from).join(escapeXml(to)), applied: true };
  }

  const xmlPlain = extractPlainFromDocxXml(xml);
  const variants = buildOriginalVariants(from, plainText, xmlPlain);

  for (const variant of variants) {
    const { plain, nodes } = parseWtNodes(xml);
    const span = findOriginalSpan(plain, variant);
    if (span) {
      return {
        xml: replaceSpanInDocxXml(xml, nodes, span, to),
        applied: true,
      };
    }
  }

  const words = from.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const pattern = words
      .map((w) => `<w:t[^>]*>${escapeRegex(escapeXml(w))}</w:t>`)
      .join('[\\s\\S]*?');
    const re = new RegExp(pattern);
    const match = re.exec(xml);
    if (match) {
      const firstRun = match[0].match(/<w:r\b[^>]*>/);
      const runOpen = firstRun?.[0] ?? '<w:r>';
      const replacement = `${runOpen}<w:t>${escapedRev}</w:t></w:r>`;
      return {
        xml: xml.slice(0, match.index) + replacement + xml.slice(match.index + match[0].length),
        applied: true,
      };
    }
  }

  return { xml, applied: false };
}

const PARAGRAPH_RE = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;

/** Replace paragraph body text while keeping paragraph + first-run styling. */
export function replaceParagraphText(paragraphXml: string, newText: string): string {
  const pOpen = paragraphXml.match(/<w:p\b[^>]*>/)?.[0] ?? '<w:p>';
  const pPrMatch = paragraphXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
  const pPr = pPrMatch?.[0] ?? '';

  const firstRun = paragraphXml.match(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/);
  const rPrMatch = firstRun?.[0].match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
  const rPr = rPrMatch?.[0] ?? '';

  const preserveSpace =
    newText.startsWith(' ') || newText.endsWith(' ') || /\s{2,}/.test(newText)
      ? ' xml:space="preserve"'
      : '';

  return `${pOpen}${pPr}<w:r>${rPr}<w:t${preserveSpace}>${escapeXml(newText)}</w:t></w:r></w:p>`;
}

/** Sync tailored plain text into DOCX paragraphs, preserving layout and run styles. */
export function syncDocxXmlToTailored(
  xml: string,
  originalPlain: string,
  tailoredPlain: string,
): { xml: string; appliedCount: number } {
  const paragraphs = [...xml.matchAll(PARAGRAPH_RE)];
  if (paragraphs.length === 0) return { xml, appliedCount: 0 };

  const paragraphTexts = paragraphs.map((match) => extractPlainFromDocxXml(match[0]));
  const replacements = alignBlocksToTailored(paragraphTexts, originalPlain, tailoredPlain);
  if (replacements.size === 0) return { xml, appliedCount: 0 };

  let result = xml;
  let offset = 0;
  let appliedCount = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const repl = replacements.get(i);
    if (!repl) continue;

    const oldPara = paragraphs[i][0];
    const newPara = replaceParagraphText(oldPara, repl);
    const idx = paragraphs[i].index! + offset;
    result = result.slice(0, idx) + newPara + result.slice(idx + oldPara.length);
    offset += newPara.length - oldPara.length;
    appliedCount++;
  }

  return { xml: result, appliedCount };
}

export async function exportDocxParagraphSync(
  sourceBytes: ArrayBuffer,
  originalPlain: string,
  tailoredPlain: string,
): Promise<{ buffer: ArrayBuffer; appliedCount: number }> {
  const zip = await JSZip.loadAsync(sourceBytes);
  let appliedCount = 0;

  const xmlPaths = Object.keys(zip.files).filter(
    (path) => /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(path),
  );

  for (const path of xmlPaths) {
    const file = zip.file(path);
    if (!file) continue;
    const xml = await file.async('string');
    const synced = syncDocxXmlToTailored(xml, originalPlain, tailoredPlain);
    if (synced.appliedCount > 0) {
      zip.file(path, synced.xml);
      appliedCount += synced.appliedCount;
    }
  }

  const buffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  return { buffer, appliedCount };
}

export async function exportDocxPreserve(
  sourceBytes: ArrayBuffer,
  changes: ResumeChange[],
  plainText?: string,
): Promise<{ buffer: ArrayBuffer; appliedCount: number }> {
  const zip = await JSZip.loadAsync(sourceBytes);
  const accepted = changes.filter((c) => c.accepted && c.original.trim());
  let appliedCount = 0;

  const xmlPaths = Object.keys(zip.files).filter(
    (path) => /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(path),
  );

  for (const path of xmlPaths) {
    const file = zip.file(path);
    if (!file) continue;
    let xml = await file.async('string');

    for (const change of accepted) {
      const xmlPlain = extractPlainFromDocxXml(xml);
      const variants = buildOriginalVariants(change.original, plainText, xmlPlain);
      for (const original of variants) {
        const result = replaceInDocxXml(xml, original, change.revised, plainText);
        if (result.applied) {
          xml = result.xml;
          appliedCount++;
          break;
        }
      }
    }
    zip.file(path, xml);
  }

  const buffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  return { buffer, appliedCount };
}

/** Fallback when zip edit fails — still better than blank template. */
export async function exportDocxFromPlain(
  sourceBytes: ArrayBuffer,
  changes: ResumeChange[],
  plainText: string,
): Promise<ArrayBuffer> {
  try {
    const { buffer } = await exportDocxPreserve(sourceBytes, changes, plainText);
    return buffer;
  } catch {
    let text = plainText;
    for (const c of changes.filter((x) => x.accepted)) {
      text = applyChangeToText(text, c);
    }
    const { exportDocx } = await import('./docx');
    return exportDocx(text, {
      format: 'docx',
      fileName: 'resume.docx',
      plainText: text,
      sections: [],
      sourceBytes,
    });
  }
}
