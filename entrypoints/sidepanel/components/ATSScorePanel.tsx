import type { ATSScoreResult } from '@/lib/ats';

interface ScoreRingProps {
  score: number;
  size?: number;
  stroke?: number;
  label?: string;
}

export function ScoreRing({ score, size = 88, stroke = 7, label }: ScoreRingProps) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;

  const color =
    score >= 75 ? 'var(--accent)' : score >= 60 ? '#5a8f3e' : score >= 40 ? 'var(--warn)' : 'var(--danger)';

  return (
    <div className="relative inline-flex flex-col items-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        style={{ width: size, height: size }}
      >
        <span className="font-display text-2xl leading-none" style={{ color: 'var(--ink)' }}>
          {score}
        </span>
        {label && (
          <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--ink-tertiary)' }}>
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

interface ATSScorePanelProps {
  before: ATSScoreResult | null;
  after: ATSScoreResult | null;
  hasTailored: boolean;
  hasResume: boolean;
  hasJob: boolean;
}

export function ATSScorePanel({
  before,
  after,
  hasTailored,
  hasResume,
  hasJob,
}: ATSScorePanelProps) {
  if (!hasResume || !hasJob || !before) {
    return (
      <section className="card animate-in p-4">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--accent-soft)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
              <path d="M9 14l2 2 4-4" />
            </svg>
          </div>
          <div>
            <h2 className="font-display text-lg leading-tight" style={{ color: 'var(--ink)' }}>
              ATS match score
            </h2>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
              {hasResume && !hasJob
                ? 'Resume ready — capture or paste a job description to see your ATS score.'
                : hasJob && !hasResume
                  ? 'Job description added — upload your resume to score keyword match, skills, and fit.'
                  : 'Upload your resume and add a job description. Same rubric before and after tailoring.'}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const delta = after ? after.overall - before.overall : 0;
  const active = after ?? before;

  return (
    <section className="card overflow-hidden" id="ats-score-panel">
      <div
        className="flex items-center justify-between gap-3 border-b px-4 py-3"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <ScoreRing score={active.overall} size={56} stroke={5} />
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              ATS {active.overall} · {active.grade}
            </p>
            <p className="text-[11px]" style={{ color: 'var(--ink-tertiary)' }}>
              {hasTailored && after
                ? `Was ${before.overall} → now ${after.overall}`
                : `${before.matchedKeywords.length} keywords matched`}
            </p>
          </div>
        </div>
        {hasTailored && after && (
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{
              background: delta >= 0 ? 'var(--accent-soft)' : 'var(--danger-soft)',
              color: delta >= 0 ? 'var(--accent)' : 'var(--danger)',
            }}
          >
            {delta >= 0 ? '+' : ''}
            {delta}
          </span>
        )}
      </div>

      {hasTailored && after && delta < 0 && (
        <div
          className="border-b px-4 py-2 text-[11px] font-medium"
          style={{ borderColor: 'var(--border)', background: 'var(--danger-soft)', color: 'var(--danger)' }}
        >
          Edits lowered your score — skip changes in Edits below or tap Clear session to start over.
        </div>
      )}

      <div className="grid grid-cols-2 gap-px border-b" style={{ background: 'var(--border)', borderColor: 'var(--border)' }}>
        <div className="p-4" style={{ background: 'var(--surface-raised)' }}>
          <p className="label-text mb-3">Before</p>
          <div className="flex items-center gap-3">
            <ScoreRing score={before.overall} size={72} stroke={6} />
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                {before.grade}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                {before.matchedKeywords.length} terms matched
              </p>
            </div>
          </div>
        </div>

        <div className="p-4" style={{ background: 'var(--surface-raised)' }}>
          <p className="label-text mb-3">{hasTailored ? 'After' : 'Pending'}</p>
          {after ? (
            <div className="flex items-center gap-3">
              <ScoreRing score={after.overall} size={72} stroke={6} />
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  {after.grade}
                </p>
                <p className="text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                  {after.matchedKeywords.length} terms matched
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-tertiary)' }}>
              Tailor your resume to see the updated score.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2 p-4">
        {active.categories.map((cat) => (
          <div key={cat.id}>
            <div className="mb-1 flex justify-between text-[11px]">
              <span style={{ color: 'var(--ink-secondary)' }}>{cat.label}</span>
              <span className="font-medium" style={{ color: 'var(--ink)' }}>
                {cat.score}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${cat.score}%`,
                  background:
                    cat.score >= 75
                      ? 'var(--accent)'
                      : cat.score >= 50
                        ? '#7a9e3a'
                        : 'var(--danger)',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {active.matchedKeywords.length > 0 && (
        <div className="border-t px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <p className="label-text mb-2">Matched in resume</p>
          <div className="flex flex-wrap gap-1.5">
            {active.matchedKeywords.map((kw) => (
              <span
                key={kw}
                className="rounded-md px-2 py-0.5 text-[11px]"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {active.missingKeywords.length > 0 && (
        <div className="border-t px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <p className="label-text mb-2">Missing from resume ({active.missingKeywords.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {active.missingKeywords.map((kw) => (
              <span
                key={kw}
                className="rounded-md px-2 py-0.5 text-[11px]"
                style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {active.warnings.length > 0 && (
        <div className="border-t px-4 py-3" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          {active.warnings.map((w) => (
            <p key={w} className="text-[11px] leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
              · {w}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
