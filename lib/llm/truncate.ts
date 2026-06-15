import type { JobPosting, ParsedResume, LLMProvider } from '../types';
import { splitIntoSections } from '../parsers/sections';
import { getProfileLimits } from './models';

const JOB_KEYWORDS = [
  'requirements',
  'qualifications',
  'responsibilities',
  'what you will',
  "what you'll",
  'about the role',
  'must have',
  'nice to have',
];

const SECTION_PRIORITY: Array<{ pattern: RegExp; rank: number }> = [
  { pattern: /summary|profile|objective/i, rank: 0 },
  { pattern: /skills|competencies/i, rank: 1 },
  { pattern: /experience|employment|work history/i, rank: 2 },
  { pattern: /projects/i, rank: 3 },
  { pattern: /education|certification/i, rank: 4 },
];

function sectionRank(name: string): number {
  const match = SECTION_PRIORITY.find((p) => p.pattern.test(name));
  return match?.rank ?? SECTION_PRIORITY.length;
}

function lineBoundaryTrim(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  let cut = text.slice(0, maxChars);
  const lastNewline = cut.lastIndexOf('\n');
  if (lastNewline > maxChars * 0.65) {
    cut = cut.slice(0, lastNewline);
  }

  return `${cut}\n\n[Trimmed for faster tailoring]`;
}

export function trimJobDescription(description: string, maxChars: number): string {
  const text = description.trim();
  if (text.length <= maxChars) return text;

  const lower = text.toLowerCase();
  let start = 0;
  for (const kw of JOB_KEYWORDS) {
    const idx = lower.indexOf(kw);
    if (idx !== -1) {
      start = Math.max(0, idx - 80);
      break;
    }
  }

  const excerpt = text.slice(start, start + maxChars);
  return `${excerpt}\n\n[Job description trimmed for faster tailoring]`;
}

/** Keep plain-text layout; in fast mode send only the most relevant sections. */
export function trimResumeForPrompt(
  resume: ParsedResume,
  maxChars: number,
  profile: 'fast' | 'quality' = 'quality',
): string {
  const plain = resume.plainText;
  if (profile !== 'fast' || plain.length <= maxChars) {
    return lineBoundaryTrim(plain, maxChars);
  }

  const sections =
    resume.sections.length > 0 ? resume.sections : splitIntoSections(plain);

  if (sections.length === 0) {
    return lineBoundaryTrim(plain, maxChars);
  }

  const ordered = [...sections].sort((a, b) => sectionRank(a.name) - sectionRank(b.name));
  let out = '';

  for (const section of ordered) {
    const block =
      section.name === 'General' ? section.content : `${section.name}\n${section.content}`;
    const chunk = out ? `\n\n${block}` : block;
    if (out.length + chunk.length > maxChars) {
      const remaining = maxChars - out.length - (out ? 2 : 0);
      if (remaining > 80) {
        out += (out ? '\n\n' : '') + block.slice(0, remaining);
      }
      break;
    }
    out += chunk;
  }

  return out.trim() || lineBoundaryTrim(plain, maxChars);
}

export function prepareTailorInputs(
  job: JobPosting,
  resume: ParsedResume,
  profile: 'fast' | 'quality',
  provider?: LLMProvider,
): { job: JobPosting; resumeText: string } {
  const limits = getProfileLimits(profile, provider);
  return {
    job: {
      ...job,
      description: trimJobDescription(job.description, limits.maxJobChars),
    },
    resumeText: trimResumeForPrompt(resume, limits.maxResumeChars, profile),
  };
}
