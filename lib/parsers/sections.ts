import type { ResumeSection } from '../types';

const SECTION_PATTERNS = [
  /^(summary|professional summary|profile|objective|career summary)\s*:?\s*$/i,
  /^(experience|work experience|employment history|professional experience|work history)\s*:?\s*$/i,
  /^(education|academic background)\s*:?\s*$/i,
  /^(skills|technical skills|core competencies|competencies)\s*:?\s*$/i,
  /^(projects|certifications|awards|languages|methods and tools)\s*:?\s*$/i,
];

export function splitIntoSections(plainText: string): ResumeSection[] {
  const lines = plainText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const sections: ResumeSection[] = [];
  let currentName = 'General';
  let currentLines: string[] = [];

  const flush = () => {
    if (currentLines.length > 0) {
      sections.push({ name: currentName, content: currentLines.join('\n') });
      currentLines = [];
    }
  };

  for (const line of lines) {
    const isHeading =
      SECTION_PATTERNS.some((p) => p.test(line)) ||
      (line.length < 40 && line === line.toUpperCase() && /[A-Z]/.test(line));

    if (isHeading) {
      flush();
      currentName = line;
    } else {
      currentLines.push(line);
    }
  }
  flush();

  if (sections.length === 0 && plainText.trim()) {
    return [{ name: 'General', content: plainText.trim() }];
  }
  return sections;
}

export function sectionsToPlainText(sections: ResumeSection[]): string {
  return sections
    .map((s) => (s.name === 'General' ? s.content : `${s.name}\n${s.content}`))
    .join('\n\n');
}
