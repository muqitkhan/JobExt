import type { ParsedResume, ResumeChange } from '@/lib/types';
import { buildDisplayText, type DiffPart } from '@/lib/diff/highlight';
import { findOriginalSpan } from '@/lib/llm/prompts';
import { parseResumeLayout } from '@/lib/resume/layout';

interface ResumeDocumentProps {
  resume: ParsedResume;
  changes: ResumeChange[];
  showHighlights: boolean;
  showRejected: boolean;
}

function sectionChanges(sectionBody: string, changes: ResumeChange[]): ResumeChange[] {
  return changes.filter((c) => c.original.trim() && findOriginalSpan(sectionBody, c.original));
}

function SectionBody({
  body,
  changes,
  showHighlights,
  showRejected,
}: {
  body: string;
  changes: ResumeChange[];
  showHighlights: boolean;
  showRejected: boolean;
}) {
  if (!showHighlights || changes.length === 0) {
    return <p className="resume-section-body whitespace-pre-wrap">{body}</p>;
  }

  const { parts } = buildDisplayText(body, changes, showRejected);

  return (
    <p className="resume-section-body whitespace-pre-wrap">
      {parts.map((part: DiffPart, i: number) => (
        <span
          key={i}
          className={part.added ? 'diff-added' : part.removed ? 'diff-removed' : undefined}
        >
          {part.value}
        </span>
      ))}
    </p>
  );
}

export function ResumeDocument({
  resume,
  changes,
  showHighlights,
  showRejected,
}: ResumeDocumentProps) {
  const layout = parseResumeLayout(resume);

  return (
    <article className="resume-preview">
      {layout.name && <h1 className="resume-name">{layout.name}</h1>}
      {layout.contact && <p className="resume-contact">{layout.contact}</p>}

      {layout.sections.map((section, idx) => {
        const title = section.title.trim();
        const sectionEdits = showHighlights ? sectionChanges(section.body, changes) : [];

        return (
          <section key={`${title}-${idx}`} className="resume-section">
            {title && <h2 className="resume-section-title">{title}</h2>}
            <SectionBody
              body={section.body}
              changes={sectionEdits}
              showHighlights={showHighlights}
              showRejected={showRejected}
            />
          </section>
        );
      })}
    </article>
  );
}
