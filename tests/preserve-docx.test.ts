import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { replaceInDocxXml, exportDocxPreserve } from '@/lib/exporters/preserve-docx';
import { resolveChangesForExport } from '@/lib/exporters/apply-changes';
import type { ResumeChange } from '@/lib/types';

const SAMPLE_XML = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Developer with JavaScript experience</w:t></w:r></w:p>
    <w:p><w:r><w:t>Java</w:t></w:r><w:r><w:t>Script</w:t></w:r></w:p>
  </w:body>
</w:document>`;

const SPLIT_RUN_XML = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Skills: </w:t></w:r><w:r><w:t>Java</w:t></w:r><w:r><w:t>Script</w:t></w:r><w:r><w:t>, Python</w:t></w:r></w:p>
  </w:body>
</w:document>`;

async function buildMinimalDocx(documentXml: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('word/document.xml', documentXml);
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('replaceInDocxXml', () => {
  it('replaces text in a single w:t run', () => {
    const { xml: updated, applied } = replaceInDocxXml(SAMPLE_XML, 'JavaScript', 'TypeScript');
    expect(applied).toBe(true);
    expect(updated).toContain('TypeScript');
    expect(updated).not.toContain('JavaScript');
  });

  it('replaces text split across w:t runs', () => {
    const { xml: updated, applied } = replaceInDocxXml(SAMPLE_XML, 'JavaScript', 'TypeScript');
    expect(applied).toBe(true);
    expect(updated).toContain('TypeScript');
  });

  it('matches when AI original differs slightly from split-run XML text', () => {
    const plainText = 'Skills: JavaScript, Python';
    const { xml: updated, applied } = replaceInDocxXml(
      SPLIT_RUN_XML,
      'Java Script',
      'TypeScript',
      plainText,
    );
    expect(applied).toBe(true);
    expect(updated).toContain('TypeScript');
    expect(updated).not.toMatch(/Java[\s\S]*Script/);
  });
});

describe('resolveChangesForExport', () => {
  it('re-anchors originals to plainText spans', () => {
    const plainText = 'Skills: JavaScript, Python';
    const changes: ResumeChange[] = [
      {
        id: 'c1',
        section: 'Skills',
        original: 'Java Script',
        revised: 'TypeScript',
        reason: 'match',
        accepted: true,
      },
    ];

    const resolved = resolveChangesForExport(plainText, changes);
    expect(resolved[0].original).toBe('JavaScript');
  });
});

describe('exportDocxPreserve', () => {
  it('writes accepted changes into the original docx zip', async () => {
    const source = await buildMinimalDocx(SAMPLE_XML);
    const changes: ResumeChange[] = [
      {
        id: 'c1',
        section: 'Skills',
        original: 'JavaScript',
        revised: 'TypeScript',
        reason: 'match',
        accepted: true,
      },
    ];

    const { buffer: out, appliedCount } = await exportDocxPreserve(source, changes, 'Developer with JavaScript');
    expect(appliedCount).toBeGreaterThan(0);
    const zip = await JSZip.loadAsync(out);
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('TypeScript');
    expect(xml).not.toContain('JavaScript');
  });

  it('applies edits when original differs from split XML runs', async () => {
    const source = await buildMinimalDocx(SPLIT_RUN_XML);
    const plainText = 'Skills: JavaScript, Python';
    const changes: ResumeChange[] = [
      {
        id: 'c1',
        section: 'Skills',
        original: 'Java Script',
        revised: 'TypeScript',
        reason: 'match',
        accepted: true,
      },
    ];
    const resolved = resolveChangesForExport(plainText, changes);

    const { buffer: out, appliedCount } = await exportDocxPreserve(source, resolved, plainText);
    expect(appliedCount).toBeGreaterThan(0);
    const zip = await JSZip.loadAsync(out);
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('TypeScript');
  });
});
