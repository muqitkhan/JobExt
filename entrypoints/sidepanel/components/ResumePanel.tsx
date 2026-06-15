import { useRef, useState } from 'react';
import type { ParsedResume, ResumeChange } from '@/lib/types';
import { MAX_FILE_SIZE_BYTES, SUPPORTED_EXTENSIONS } from '@/lib/types';
import { parseResume } from '@/lib/parsers';
import { ResumeDocument } from './ResumeDocument';

interface ResumePanelProps {
  resume: ParsedResume;
  changes: ResumeChange[];
  hasTailored: boolean;
  isTailoring: boolean;
  onReplace: (resume: ParsedResume) => void;
  onError: (message: string) => void;
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function ResumePanel({
  resume,
  changes,
  hasTailored,
  isTailoring,
  onReplace,
  onError,
}: ResumePanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isParsing, setIsParsing] = useState(false);

  const words = wordCount(resume.plainText);
  const showHighlights = hasTailored && changes.length > 0;

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
      onReplace(parsed);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to parse resume.');
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <section className="card animate-in overflow-hidden p-0">
      <div
        className="flex items-center justify-between gap-2 border-b px-3 py-2"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium" style={{ color: 'var(--ink)' }} title={resume.fileName}>
            {resume.fileName}
          </p>
          <p className="text-[10px]" style={{ color: 'var(--ink-tertiary)' }}>
            {words.toLocaleString()} words · {resume.format.toUpperCase()}
            {hasTailored ? ' · tailored' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isParsing || isTailoring}
          className="shrink-0 text-[11px] font-medium"
          style={{ color: 'var(--accent)' }}
        >
          Replace
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".docx,.pdf,.txt,.rtf"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>

      {showHighlights && (
        <div
          className="flex flex-wrap gap-3 border-b px-3 py-1.5 text-[10px]"
          style={{ borderColor: 'var(--border)', color: 'var(--ink-tertiary)' }}
        >
          <span className="flex items-center gap-1">
            <span className="diff-legend diff-legend-added" />
            Changed
          </span>
          <span className="flex items-center gap-1">
            <span className="diff-legend diff-legend-removed" />
            Skipped
          </span>
        </div>
      )}

      <div className="resume-document-window relative">
        <div className="resume-document-scroll">
          <ResumeDocument
            resume={resume}
            changes={changes}
            showHighlights={showHighlights}
            showRejected
          />
        </div>

        {(isTailoring || isParsing) && (
          <div className="resume-document-overlay">
            <span className="spinner" />
            <span className="text-xs font-medium" style={{ color: 'var(--ink-secondary)' }}>
              {isParsing ? 'Reading resume…' : 'Tailoring…'}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
