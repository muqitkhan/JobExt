import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { ParsedResume } from '../types';
import { splitIntoSections } from '../parsers/sections';

export async function exportDocx(text: string, original: ParsedResume): Promise<ArrayBuffer> {
  const sections = splitIntoSections(text);
  const children: Paragraph[] = [];

  for (const section of sections) {
    if (section.name !== 'General') {
      children.push(
        new Paragraph({
          text: section.name,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 120 },
        }),
      );
    }
    for (const line of section.content.split('\n')) {
      if (line.trim()) {
        children.push(
          new Paragraph({
            children: [new TextRun(line)],
            spacing: { after: 80 },
          }),
        );
      }
    }
  }

  if (children.length === 0) {
    for (const line of text.split('\n')) {
      children.push(new Paragraph({ children: [new TextRun(line)] }));
    }
  }

  const doc = new Document({
    creator: 'JobExt',
    title: original.fileName,
    sections: [{ children }],
  });

  return Packer.toArrayBuffer(doc);
}
