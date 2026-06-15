import type { ResumeChange } from '@/lib/types';
import { diffWords } from 'diff';

interface ChangeReviewProps {
  changes: ResumeChange[];
  onToggle: (id: string, accepted: boolean) => void;
}

export function ChangeReview({ changes, onToggle }: ChangeReviewProps) {
  if (changes.length === 0) return null;

  const kept = changes.filter((c) => c.accepted).length;

  return (
    <section className="card animate-in p-4">
      <div className="mb-3">
        <h2 className="font-display text-base" style={{ color: 'var(--ink)' }}>
          Edits
        </h2>
        <p className="text-[11px]" style={{ color: 'var(--ink-tertiary)' }}>
          {kept} of {changes.length} kept · tap Skip to undo an edit
        </p>
      </div>

      <ul className="space-y-2">
        {changes.map((change) => {
          const parts = diffWords(change.original, change.revised);
          return (
            <li
              key={change.id}
              className="card-inset p-3"
              style={{
                borderColor: change.accepted ? 'var(--accent-muted)' : 'var(--border)',
                opacity: change.accepted ? 1 : 0.65,
              }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span
                  className="text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--ink-tertiary)' }}
                >
                  {change.section}
                </span>
                <button
                  type="button"
                  onClick={() => onToggle(change.id, !change.accepted)}
                  className="rounded-md px-2 py-0.5 text-[10px] font-semibold"
                  style={{
                    background: change.accepted ? 'var(--surface)' : 'var(--accent-soft)',
                    color: change.accepted ? 'var(--ink-secondary)' : 'var(--accent)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {change.accepted ? 'Skip' : 'Keep'}
                </button>
              </div>
              <p className="whitespace-pre-wrap text-xs leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
                {parts.map((part, i) => (
                  <span
                    key={i}
                    className={
                      part.added ? 'diff-added' : part.removed ? 'diff-removed' : undefined
                    }
                  >
                    {part.value}
                  </span>
                ))}
              </p>
              {change.reason && (
                <p className="mt-1.5 text-[11px] italic" style={{ color: 'var(--ink-tertiary)' }}>
                  {change.reason}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
