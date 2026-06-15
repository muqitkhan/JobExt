import type { ParsedResume } from '../types';
import { splitIntoSections } from '../parsers/sections';

export interface ResumeLayoutSection {
  title: string;
  body: string;
}

export interface ResumeLayout {
  name: string;
  contact: string;
  sections: ResumeLayoutSection[];
}

const CONTACT_RE =
  /(@|linkedin|github|http|www\.|\(\d{3}\)|\d{3}[-.\s]\d{3}|mobile|phone|email)/i;

const SECTION_HEADING_RE =
  /^(professional summary|summary|profile|objective|technical skills|skills|core competencies|professional experience|work experience|experience|employment|education|projects|certifications|awards|languages)\s*$/i;

export function parseResumeLayout(resume: ParsedResume): ResumeLayout {
  const plain = resume.plainText;
  const lines = plain.split(/\r?\n/);

  let name = '';
  let contact = '';
  const contactLines: string[] = [];

  const firstNonEmpty = lines.findIndex((l) => l.trim());
  let scanFrom = 0;
  if (firstNonEmpty >= 0) {
    const line = lines[firstNonEmpty].trim();
    const isName =
      line.length >= 3 &&
      line.length < 60 &&
      (line === line.toUpperCase() || /^[A-Z][a-z]+(\s+[A-Z][a-z'.-]+)+$/.test(line));
    if (isName && !SECTION_HEADING_RE.test(line)) {
      name = line;
      scanFrom = firstNonEmpty + 1;
    }
  }

  for (let i = scanFrom; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (SECTION_HEADING_RE.test(t)) break;
    if (t === name) continue;
    if (CONTACT_RE.test(t) && t.length < 200) {
      contactLines.push(t);
    } else if (contactLines.length > 0) {
      break;
    }
  }

  contact = contactLines.join(' · ');

  let sections: ResumeLayoutSection[] = [];

  if (resume.sections.length > 0) {
    sections = resume.sections
      .filter((s) => s.name !== 'General' || s.content.trim())
      .map((s) => ({
        title: s.name === 'General' ? '' : s.name,
        body: s.content,
      }));
  } else {
    sections = splitIntoSections(plain).map((s) => ({
      title: s.name === 'General' ? '' : s.name,
      body: s.content,
    }));
  }

  if (sections.length === 0 && plain.trim()) {
    sections = [{ title: '', body: plain.trim() }];
  }

  return { name, contact, sections };
}
