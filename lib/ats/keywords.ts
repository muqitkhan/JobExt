import type { JobPosting } from '../types';
import type { WeightedTerm } from './types';
import { DEGREE_TERMS, SKILL_TAXONOMY } from './taxonomy';
import { getCanonicalTerm, getTermAliases } from './synonyms';

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

/** Generic JD fluff that repeats but isn't a skill signal. */
const FLUFF_WORDS = new Set([
  'experience', 'ability', 'abilities', 'knowledge', 'understanding', 'familiar',
  'comfortable', 'passionate', 'detail', 'oriented', 'motivated', 'driven', 'dynamic',
  'collaborative', 'growth', 'impact', 'fast', 'paced', 'environment', 'culture',
  'solutions', 'solution', 'support', 'supporting', 'working', 'using', 'including',
  'related', 'field', 'degree', 'equivalent', 'preferred', 'required', 'highly',
  'high', 'level', 'senior', 'junior', 'mid', 'staff', 'lead', 'leading', 'leadership',
  'management', 'manager', 'managing', 'develop', 'developing', 'development',
  'deliver', 'delivering', 'delivery', 'build', 'building', 'create', 'creating',
  'maintain', 'maintaining', 'ensure', 'ensuring', 'provide', 'providing',
  'communicate', 'communication', 'collaborate', 'collaboration', 'partner',
  'partnership', 'across', 'multiple', 'various', 'different', 'types', 'kind',
  'kinds', 'well', 'both', 'either', 'neither', 'etc', 'skills',
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

function matchSingleTerm(haystack: string, term: string): boolean {
  const t = normalizeText(term);
  if (!t) return false;

  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped.replace(/\s+/g, '[\\s.-]*')}\\b`, 'i');
  if (re.test(haystack)) return true;

  // Cheap substring only for longer terms — short ones rely on word boundaries above.
  if (t.length > 2 && normalizeText(haystack).includes(t)) return true;
  return false;
}

/** Match a term or any known synonym alias (e.g. kubernetes ↔ k8s). */
export function containsTerm(haystack: string, term: string): boolean {
  for (const alias of getTermAliases(term)) {
    if (matchSingleTerm(haystack, alias)) return true;
  }
  return matchSingleTerm(haystack, term);
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

function isFluffTerm(term: string): boolean {
  const key = normalizeText(term);
  return STOP_WORDS.has(key) || FLUFF_WORDS.has(key);
}

export function extractJobKeywords(job: JobPosting): WeightedTerm[] {
  const weights = new Map<string, { weight: number; source: WeightedTerm['source'] }>();
  const desc = job.description;
  const reqSection = extractRequirementSection(desc);

  const add = (term: string, weight: number, source: WeightedTerm['source']) => {
    const key = getCanonicalTerm(term);
    if (key.length < 2 || isFluffTerm(key)) return;
    const existing = weights.get(key);
    if (!existing || weight > existing.weight) {
      weights.set(key, { weight: (existing?.weight ?? 0) + weight, source });
    } else if (existing) {
      existing.weight += weight * 0.5;
    }
  };

  const seenSkills = new Set<string>();
  for (const skill of SKILL_TAXONOMY) {
    const canonical = getCanonicalTerm(skill);
    if (seenSkills.has(canonical)) continue;
    if (containsTerm(desc, skill)) {
      seenSkills.add(canonical);
      const inReq = containsTerm(reqSection, skill);
      add(canonical, inReq ? 4 : 2.5, 'skill');
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
    if (count >= 2 && word.length >= 4 && !isFluffTerm(word) && !seenSkills.has(getCanonicalTerm(word))) {
      add(word, count * 0.8, 'frequency');
    }
  }

  const yearMatches = desc.matchAll(
    /(\d+)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience\s+(?:with|in|using)\s+)?([a-z][\w+#.\-/]*(?:\s+[\w+#.\-/]+){0,2})/gi,
  );
  for (const match of yearMatches) {
    const phrase = match[2].trim();
    for (const word of tokenize(phrase)) {
      add(word, 3, 'requirement');
    }
    for (const skill of SKILL_TAXONOMY) {
      if (containsTerm(phrase, skill)) {
        add(getCanonicalTerm(skill), 3.5, 'requirement');
      }
    }
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
