import type { JobPosting } from '@/lib/types';

interface JobDescriptionProps {
  job: JobPosting | null;
  onJobChange: (job: JobPosting) => void;
  onCapture: () => void;
  isCapturing: boolean;
  captureSucceeded?: boolean;
}

export function JobDescription({
  job,
  onJobChange,
  onCapture,
  isCapturing,
  captureSucceeded = false,
}: JobDescriptionProps) {
  const update = (field: keyof JobPosting, value: string) => {
    onJobChange({
      title: job?.title ?? '',
      company: job?.company ?? '',
      location: job?.location ?? '',
      description: job?.description ?? '',
      source: job?.source ?? 'manual',
      url: job?.url ?? '',
      [field]: value,
    });
  };

  return (
    <section className="card animate-in p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-base" style={{ color: 'var(--ink)' }}>
          Target role
        </h2>
        <button
          type="button"
          onClick={onCapture}
          disabled={isCapturing}
          className="btn-secondary flex items-center gap-1.5 !py-1.5 !text-xs"
        >
          {isCapturing ? <span className="spinner" /> : null}
          {isCapturing ? 'Reading page…' : captureSucceeded ? 'Re-capture' : 'Capture from tab'}
        </button>
      </div>

      {captureSucceeded && job?.description && (
        <p
          className="mb-3 rounded-lg px-3 py-2 text-xs font-medium"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          Job description captured — ATS score updated below.
        </p>
      )}

      <div className="mb-3 space-y-2">
        <input
          type="text"
          placeholder="Job title — e.g. Product Designer"
          value={job?.title ?? ''}
          onChange={(e) => update('title', e.target.value)}
          className="input-field"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            placeholder="Company"
            value={job?.company ?? ''}
            onChange={(e) => update('company', e.target.value)}
            className="input-field"
          />
          <input
            type="text"
            placeholder="Location"
            value={job?.location ?? ''}
            onChange={(e) => update('location', e.target.value)}
            className="input-field"
          />
        </div>
      </div>

      <label className="label-text">Job description</label>
      <textarea
        placeholder="Paste the listing here, or capture it from an open job page…"
        value={job?.description ?? ''}
        onChange={(e) => update('description', e.target.value)}
        rows={7}
        className="input-field resize-none leading-relaxed"
      />

      {job?.source && job.source !== 'manual' && (
        <p className="mt-2 text-[11px]" style={{ color: 'var(--ink-tertiary)' }}>
          Captured from {job.source}
          {job.url
            ? (() => {
                try {
                  return ` · ${new URL(job.url).hostname}`;
                } catch {
                  return '';
                }
              })()
            : ''}
        </p>
      )}
    </section>
  );
}
