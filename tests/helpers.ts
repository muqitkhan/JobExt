import type { ParsedResume, ResumeFormat } from '@/lib/types';

export function bytesFromText(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

export function mockResume(
  partial: Omit<ParsedResume, 'sourceBytes'> & { sourceBytes?: ArrayBuffer },
): ParsedResume {
  return {
    ...partial,
    sourceBytes: partial.sourceBytes ?? bytesFromText(partial.plainText),
  };
}

export function mockResumeFormat(format: ResumeFormat, plainText: string, fileName: string): ParsedResume {
  return mockResume({ format, fileName, plainText, sections: [] });
}
