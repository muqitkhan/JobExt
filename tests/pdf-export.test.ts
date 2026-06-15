import { describe, expect, it } from 'vitest';
import { sanitizeForPdfText } from '@/lib/exporters/pdf-text';
import { exportPdf } from '@/lib/exporters/pdf';
import { mockResume } from './helpers';

describe('sanitizeForPdfText', () => {
  it('replaces non-breaking hyphen (U+2011)', () => {
    expect(sanitizeForPdfText('State of California\u20112024')).toBe('State of California-2024');
  });

  it('replaces smart quotes and bullets', () => {
    const raw = '\u201Chello\u201D \u2022 item';
    const safe = sanitizeForPdfText(raw);
    expect(safe).toBe('"hello" - item');
  });
});

describe('exportPdf', () => {
  it('exports text with unicode dashes without throwing', async () => {
    const resume = mockResume({
      format: 'pdf',
      fileName: 'resume.pdf',
      plainText: 'MUQIT ASIF KHAN\nExperience at State of California\u2011DMV',
      sections: [],
    });

    const buffer = await exportPdf(resume.plainText, resume);
    expect(buffer.byteLength).toBeGreaterThan(100);
    const header = new TextDecoder('latin1').decode(new Uint8Array(buffer).slice(0, 5));
    expect(header).toBe('%PDF-');
  });
});
