import { describe, expect, it } from 'vitest';
import { alignBlocksToTailored, buildTailoredLineMap } from '@/lib/exporters/text-align';
import {
  replaceParagraphText,
  syncDocxXmlToTailored,
  exportDocxParagraphSync,
} from '@/lib/exporters/preserve-docx';
import { exportResume } from '@/lib/exporters';
import { buildFullTextFromChanges } from '@/lib/llm/prompts';
import { mockResume } from './helpers';
import type { ResumeChange } from '@/lib/types';
import JSZip from 'jszip';

const SAMPLE_XML = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>John Doe</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:color w:val="2E74B5"/></w:rPr><w:t>Developer with some web experience.</w:t></w:r></w:p>
  </w:body>
</w:document>`;

describe('buildTailoredLineMap', () => {
  it('maps changed lines by index', () => {
    const map = buildTailoredLineMap(
      'Summary\nOld line\n',
      'Summary\nNew tailored line\n',
    );
    expect(map.get(1)).toBe('New tailored line');
  });
});

describe('syncDocxXmlToTailored', () => {
  it('replaces paragraph text while keeping paragraph and run styling', () => {
    const originalPlain = 'John Doe\nDeveloper with some web experience.';
    const tailoredPlain =
      'John Doe\nSenior React Developer who delivers solutions, measured by reliable delivery, by applying React and TypeScript.';

    const { xml, appliedCount } = syncDocxXmlToTailored(SAMPLE_XML, originalPlain, tailoredPlain);
    expect(appliedCount).toBe(1);
    expect(xml).toContain('React');
    expect(xml).toContain('<w:jc w:val="center"/>');
    expect(xml).toContain('<w:b/>');
    expect(xml).toContain('<w:color w:val="2E74B5"/>');
    expect(xml).not.toContain('some web experience');
  });

  it('preserves bold on name paragraph when only summary changes', () => {
    const updated = replaceParagraphText(
      '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Old</w:t></w:r></w:p>',
      'New summary line',
    );
    expect(updated).toContain('<w:b/>');
    expect(updated).toContain('New summary line');
  });
});

describe('alignBlocksToTailored', () => {
  it('aligns docx paragraphs to mammoth plain lines', () => {
    const blocks = ['John Doe', 'Developer with some web experience.'];
    const originalPlain = 'John Doe\nDeveloper with some web experience.';
    const tailoredPlain = 'John Doe\nTailored developer summary with React.';
    const map = alignBlocksToTailored(blocks, originalPlain, tailoredPlain);
    expect(map.get(1)).toMatch(/React/);
  });
});

describe('exportResume docx paragraph preserve', () => {
  it('exports XYZ-style edits with original docx styling', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', SAMPLE_XML);
    const sourceBytes = await zip.generateAsync({ type: 'arraybuffer' });

    const plainText = 'John Doe\nDeveloper with some web experience.';
    const changes: ResumeChange[] = [
      {
        id: 'c1',
        section: 'Summary',
        original: 'Developer with some web experience.',
        revised:
          'Senior React Developer who delivers customer-facing solutions, measured by reliable delivery, by applying React, TypeScript, and Node.js.',
        reason: 'X–Y–Z',
        accepted: true,
      },
    ];

    const resume = mockResume({
      format: 'docx',
      fileName: 'resume.docx',
      plainText,
      sections: [],
      sourceBytes,
    });

    const tailoredText = buildFullTextFromChanges(plainText, changes);
    const { buffer, appliedCount } = await exportDocxParagraphSync(
      sourceBytes,
      plainText,
      tailoredText,
    );
    expect(appliedCount).toBeGreaterThan(0);

    const { buffer: exported } = await exportResume(resume, changes);
    const outZip = await JSZip.loadAsync(exported);
    const xml = await outZip.file('word/document.xml')!.async('string');
    expect(xml).toContain('TypeScript');
    expect(xml).toContain('<w:color w:val="2E74B5"/>');
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});
