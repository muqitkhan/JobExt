import { useState } from 'react';
import { MAX_FILE_SIZE_BYTES, SUPPORTED_EXTENSIONS } from '@/lib/types';
import type { ParsedResume } from '@/lib/types';
import { parseResume } from '@/lib/parsers';

interface ResumeUploadProps {
  onParsed: (resume: ParsedResume) => void;
  onError: (error: string) => void;
}

export function ResumeUpload({ onParsed, onError }: ResumeUploadProps) {
  const [isParsing, setIsParsing] = useState(false);

  const handleFile = async (file: File) => {
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number])) {
      onError(`Unsupported format. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`);
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      onError('File too large. Maximum size is 10 MB.');
      return;
    }

    setIsParsing(true);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parseResume(buffer, file.name, file.type);
      if (!parsed.plainText.trim()) {
        onError('Could not read text from this file. Try a different format or export.');
        return;
      }
      onParsed(parsed);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to parse resume.');
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <section className="card animate-in p-4">
      <h2 className="font-display mb-3 text-base" style={{ color: 'var(--ink)' }}>
        Your resume
      </h2>

      <label
        className="group flex cursor-pointer flex-col items-center justify-center rounded-[10px] border-2 border-dashed px-4 py-10 transition-colors"
        style={{
          borderColor: 'var(--border-strong)',
          background: 'var(--surface)',
          opacity: isParsing ? 0.7 : 1,
          pointerEvents: isParsing ? 'none' : 'auto',
        }}
      >
        <div
          className="mb-3 flex h-11 w-11 items-center justify-center rounded-full transition-transform group-hover:scale-105"
          style={{ background: 'var(--surface-raised)', boxShadow: 'var(--shadow-sm)' }}
        >
          {isParsing ? (
            <span className="spinner" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.75">
              <path d="M12 16V4m0 0l-4 4m4-4l4 4" />
              <path d="M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" />
            </svg>
          )}
        </div>
        <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          {isParsing ? 'Reading your resume…' : 'Drop file or click to upload'}
        </span>
        <span className="mt-1 text-xs" style={{ color: 'var(--ink-tertiary)' }}>
          DOCX · PDF · TXT · RTF — max 10 MB
        </span>
        <input
          type="file"
          className="hidden"
          accept=".docx,.pdf,.txt,.rtf"
          disabled={isParsing}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </label>
    </section>
  );
}
