import type { ResumeSection } from '../types';
import { STANDARD_SECTIONS } from '../ats/taxonomy';

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

function normalizeSectionName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Detect standard resume sections from parsed section headers (not body mentions). */
export function detectStandardSections(plainText: string): string[] {
  const sections = splitIntoSections(plainText);
  const found = new Set<string>();

  for (const section of sections) {
    const name = normalizeSectionName(section.name);
    if (name === 'general') continue;

    for (const std of STANDARD_SECTIONS) {
      if (name === std || name.startsWith(`${std} `) || name.endsWith(` ${std}`) || name.includes(` ${std} `)) {
        found.add(std);
      }
    }
  }

  return [...found];
}
