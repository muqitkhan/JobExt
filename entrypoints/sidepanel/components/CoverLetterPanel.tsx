interface CoverLetterPanelProps {
  coverLetter: string;
  onChange: (text: string) => void;
  onDownload: () => void;
  isRequired: boolean;
}

export function CoverLetterPanel({
  coverLetter,
  onChange,
  onDownload,
  isRequired,
}: CoverLetterPanelProps) {
  return (
    <section className="card animate-in p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-base" style={{ color: 'var(--ink)' }}>
            Cover letter
          </h2>
          <p className="text-[11px]" style={{ color: 'var(--ink-tertiary)' }}>
            {isRequired
              ? 'This job mentions a cover letter — edit or download below.'
              : 'Optional — human tone, based on your resume and the role.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onDownload}
          disabled={!coverLetter.trim()}
          className="btn-secondary !py-1.5 !text-xs"
        >
          Download .txt
        </button>
      </div>
      <textarea
        value={coverLetter}
        onChange={(e) => onChange(e.target.value)}
        rows={10}
        className="input-field resize-y leading-relaxed"
        placeholder="Cover letter will appear here after tailoring…"
      />
    </section>
  );
}
