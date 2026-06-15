import type { JobPosting } from '../types';
import type { WeightedTerm } from './types';
import { DEGREE_TERMS, SKILL_TAXONOMY } from './taxonomy';

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was',
  'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new',
  'now', 'old', 'see', 'way', 'who', 'boy', 'did', 'let', 'put', 'say', 'she', 'too',
  'use', 'with', 'that', 'this', 'from', 'they', 'will', 'been', 'have', 'than', 'what',
  'when', 'your', 'more', 'also', 'into', 'over', 'such', 'make', 'like', 'time', 'very',
  'just', 'know', 'take', 'come', 'work', 'well', 'back', 'give', 'most', 'some', 'them',
  'able', 'role', 'team', 'join', 'help', 'need', 'looking', 'including', 'within',
  'across', 'about', 'would', 'their', 'there', 'other', 'which', 'while', 'where',
  'each', 'both', 'through', 'during', 'before', 'after', 'above', 'below', 'between',
  'must', 'should', 'could', 'shall', 'being', 'here', 'then', 'only', 'those', 'these',
  'job', 'position', 'company', 'candidate', 'candidates', 'applicant', 'applicants',
  'responsible', 'responsibilities', 'requirements', 'qualifications', 'description',
  'opportunity', 'environment', 'benefits', 'offer', 'offers', 'preferred', 'required',
  'years', 'year', 'plus', 'least', 'minimum', 'strong', 'excellent', 'good',
]);

const REQUIREMENT_MARKERS = [
  'requirements',
  'qualifications',
  'must have',
  'must-have',
  'what you will',
  "what you'll",
  'what we are looking',
  'minimum qualifications',
  'preferred qualifications',
  'required skills',
  'key responsibilities',
  'responsibilities',
  'skills &',
  'skills and',
];

export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function containsTerm(haystack: string, term: string): boolean {
  const h = normalizeText(haystack);
  const t = normalizeText(term);
  if (t.length <= 2) return false;
  if (h.includes(t)) return true;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped.replace(/\s+/g, '[\\s.-]*')}\\b`, 'i');
  return re.test(haystack);
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .replace(/[^\w\s+#.\-/]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

export function extractRequirementSection(description: string): string {
  const lower = description.toLowerCase();
  let bestIdx = -1;
  for (const marker of REQUIREMENT_MARKERS) {
    const idx = lower.indexOf(marker);
    if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
      bestIdx = idx;
    }
  }
  if (bestIdx === -1) return description;
  return description.slice(bestIdx);
}

export function extractJobKeywords(job: JobPosting): WeightedTerm[] {
  const weights = new Map<string, { weight: number; source: WeightedTerm['source'] }>();
  const desc = job.description;
  const reqSection = extractRequirementSection(desc);

  const add = (term: string, weight: number, source: WeightedTerm['source']) => {
    const key = normalizeText(term);
    if (key.length < 2 || STOP_WORDS.has(key)) return;
    const existing = weights.get(key);
    if (!existing || weight > existing.weight) {
      weights.set(key, { weight: (existing?.weight ?? 0) + weight, source });
    } else if (existing) {
      existing.weight += weight * 0.5;
    }
  };

  for (const skill of SKILL_TAXONOMY) {
    if (containsTerm(desc, skill)) {
      const inReq = containsTerm(reqSection, skill);
      add(skill, inReq ? 4 : 2.5, 'skill');
    }
  }

  for (const word of tokenize(job.title)) {
    if (word.length >= 3) add(word, 2.5, 'title');
  }

  for (const word of tokenize(reqSection)) {
    add(word, 1.5, 'requirement');
  }

  const freq = new Map<string, number>();
  for (const word of tokenize(desc)) {
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }
  for (const [word, count] of freq) {
    if (count >= 2 && word.length >= 4) {
      add(word, count * 0.8, 'frequency');
    }
  }

  const yearMatches = desc.matchAll(/(\d+)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?([a-z][\w\s]{2,30})/gi);
  for (const match of yearMatches) {
    add(match[2].trim(), 3, 'requirement');
  }

  for (const degree of DEGREE_TERMS) {
    if (containsTerm(desc, degree)) add(degree, 2, 'requirement');
  }

  return Array.from(weights.entries())
    .map(([term, { weight, source }]) => ({ term, weight, source }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 45);
}

export function splitTitleWords(title: string): string[] {
  return tokenize(title).filter((w) => w.length >= 3);
}
