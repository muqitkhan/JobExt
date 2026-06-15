import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { exportResume } from '@/lib/exporters';
import { exportTextPreserve } from '@/lib/exporters/preserve-text';
import { exportDocxPreserve } from '@/lib/exporters/preserve-docx';
import { resolveChangesForExport } from '@/lib/exporters/apply-changes';
import { mockResume } from './helpers';
import type { ResumeChange } from '@/lib/types';

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

const SPLIT_RUN_XML = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Skills: </w:t></w:r><w:r><w:t>Java</w:t></w:r><w:r><w:t>Script</w:t></w:r></w:p>
  </w:body>
</w:document>`;

async function buildMinimalDocx(documentXml: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('word/document.xml', documentXml);
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('exportTextPreserve', () => {
  it('applies changes to original txt bytes', () => {
    const resume = mockResume({
      format: 'txt',
      fileName: 'resume.txt',
      plainText: 'SKILLS\nJavaScript',
      sections: [],
    });

    const buffer = exportTextPreserve(resume, changes);
    const text = new TextDecoder().decode(buffer);
    expect(text).toContain('TypeScript');
    expect(text).not.toContain('JavaScript');
  });
});

describe('exportResume', () => {
  it('exports tailored txt preserving source structure', async () => {
    const resume = mockResume({
      format: 'txt',
      fileName: 'resume.txt',
      plainText: 'SKILLS\nJavaScript',
      sections: [],
      sourceBytes: new TextEncoder().encode('SKILLS\nJavaScript').buffer as ArrayBuffer,
    });

    const { buffer, fileName } = await exportResume(resume, changes);
    const text = new TextDecoder().decode(buffer);
    expect(fileName).toMatch(/resume_\d{4}-\d{2}-\d{2}\.txt/);
    expect(text).toContain('TypeScript');
  });

  it('applies docx preserve edits when originals differ from split runs', async () => {
    const plainText = 'Skills: JavaScript';
    const sourceBytes = await buildMinimalDocx(SPLIT_RUN_XML);
    const resume = mockResume({
      format: 'docx',
      fileName: 'resume.docx',
      plainText,
      sections: [],
      sourceBytes,
    });
    const docxChanges: ResumeChange[] = [
      {
        id: 'c1',
        section: 'Skills',
        original: 'Java Script',
        revised: 'TypeScript',
        reason: 'match',
        accepted: true,
      },
    ];
    const resolved = resolveChangesForExport(plainText, docxChanges);

    const { buffer, appliedCount } = await exportDocxPreserve(sourceBytes, resolved, plainText);
    expect(appliedCount).toBeGreaterThan(0);

    const { buffer: exported, fileName } = await exportResume(resume, resolved);
    expect(fileName).toMatch(/resume_\d{4}-\d{2}-\d{2}\.docx/);

    const zip = await JSZip.loadAsync(exported);
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('TypeScript');
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});
