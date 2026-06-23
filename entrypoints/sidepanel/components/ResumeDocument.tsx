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

function changesForSection(
  sectionBody: string,
  fullText: string,
  changes: ResumeChange[],
): ResumeChange[] {
  const resolved: ResumeChange[] = [];

  for (const change of changes) {
    if (!change.original.trim()) continue;

    if (findOriginalSpan(sectionBody, change.original)) {
      resolved.push(change);
      continue;
    }

    const span = findOriginalSpan(fullText, change.original);
    if (!span) continue;

    const excerpt = fullText.slice(span.start, span.end);
    if (findOriginalSpan(sectionBody, excerpt)) {
      resolved.push({ ...change, original: excerpt });
      continue;
    }

    if (sectionBody.includes(change.original.trim())) {
      resolved.push(change);
    }
  }

  return resolved;
}

function SectionBody({
  body,
  changes,
  showHighlights,
  showRejected,
  fullText,
}: {
  body: string;
  changes: ResumeChange[];
  showHighlights: boolean;
  showRejected: boolean;
  fullText: string;
}) {
  if (!showHighlights || changes.length === 0) {
    return <p className="resume-section-body whitespace-pre-wrap">{body}</p>;
  }

  const fullRewrite = changes.length === 1 && changes[0].id === 'full';
  const source = fullRewrite ? fullText : body;
  const sectionChanges = fullRewrite ? changes : changes;

  const { parts } = buildDisplayText(source, sectionChanges, showRejected);

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
  const fullText = resume.plainText;
  const isFullRewrite = changes.length === 1 && changes[0].id === 'full';

  if (isFullRewrite && showHighlights) {
    const { parts } = buildDisplayText(fullText, changes, showRejected);
    return (
      <article className="resume-preview">
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
      </article>
    );
  }

  return (
    <article className="resume-preview">
      {layout.name && <h1 className="resume-name">{layout.name}</h1>}
      {layout.contact && <p className="resume-contact">{layout.contact}</p>}

      {layout.sections.map((section, idx) => {
        const title = section.title.trim();
        const sectionEdits = showHighlights ? changesForSection(section.body, fullText, changes) : [];

        return (
          <section key={`${title}-${idx}`} className="resume-section">
            {title && <h2 className="resume-section-title">{title}</h2>}
            <SectionBody
              body={section.body}
              changes={sectionEdits}
              showHighlights={showHighlights}
              showRejected={showRejected}
              fullText={fullText}
            />
          </section>
        );
      })}
    </article>
  );
}
