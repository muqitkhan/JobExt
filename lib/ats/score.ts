import type { JobPosting } from '../types';
import type { ATSCategoryScore, ATSScoreResult, WeightedTerm } from './types';
import { gradeFromScore } from './types';
import {
  DEGREE_TERMS,
  EXPERIENCE_SECTION_MARKERS,
} from './taxonomy';
import {
  containsTerm,
  extractJobKeywords,
  normalizeText,
  splitTitleWords,
} from './keywords';
import { detectStandardSections } from '../parsers/sections';

/**
 * Keyword match (40%) covers all extracted JD terms.
 * Skills alignment (20%) re-scores taxonomy skills only — intentional overlap
 * so skills weigh more without double-counting the full keyword list twice.
 */
const CATEGORY_WEIGHTS = {
  keywords: 0.4,
  skills: 0.2,
  title: 0.15,
  experience: 0.15,
  format: 0.1,
} as const;

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function scoreKeywords(
  resumeText: string,
  keywords: WeightedTerm[],
): { score: number; matched: string[]; missing: string[]; detail: string } {
  if (keywords.length === 0) {
    return { score: 50, matched: [], missing: [], detail: 'Not enough job text to extract keywords.' };
  }

  let hit = 0;
  let total = 0;
  const matched: string[] = [];
  const missing: string[] = [];

  for (const kw of keywords) {
    total += kw.weight;
    if (containsTerm(resumeText, kw.term)) {
      hit += kw.weight;
      matched.push(kw.term);
    } else {
      missing.push(kw.term);
    }
  }

  const rate = total > 0 ? (hit / total) * 100 : 0;
  return {
    score: clamp(rate),
    matched,
    missing: missing,
    detail: `${matched.length} of ${keywords.length} weighted terms found in resume.`,
  };
}

function scoreSkills(
  resumeText: string,
  skillTerms: WeightedTerm[],
): { score: number; detail: string } {
  if (skillTerms.length === 0) {
    return { score: 70, detail: 'No explicit skill terms detected in job post.' };
  }

  let hit = 0;
  let total = 0;
  for (const s of skillTerms) {
    total += s.weight;
    if (containsTerm(resumeText, s.term)) hit += s.weight;
  }

  const matchedCount = skillTerms.filter((s) => containsTerm(resumeText, s.term)).length;
  const pct = total > 0 ? (hit / total) * 100 : 0;
  return {
    score: clamp(pct),
    detail: `${matchedCount} of ${skillTerms.length} taxonomy skills found (synonyms count).`,
  };
}

function scoreTitleMatch(resumeText: string, jobTitle: string): { score: number; detail: string } {
  const titleWords = splitTitleWords(jobTitle);
  if (titleWords.length === 0) {
    return { score: 60, detail: 'Add a job title for title-match scoring.' };
  }

  const hits = titleWords.filter((w) => containsTerm(resumeText, w));
  const ratio = hits.length / titleWords.length;
  const resumeNorm = normalizeText(resumeText);

  let bonus = 0;
  const titleNorm = normalizeText(jobTitle);
  if (titleNorm.length > 3 && resumeNorm.includes(titleNorm)) bonus = 20;

  return {
    score: clamp(ratio * 80 + bonus),
    detail: `${hits.length}/${titleWords.length} title keywords present${bonus ? ' · full title match' : ''}.`,
  };
}

function scoreExperience(resumeText: string, jobDescription: string): { score: number; detail: string } {
  const lowerResume = normalizeText(resumeText);
  const hasExpSection = EXPERIENCE_SECTION_MARKERS.some((m) => lowerResume.includes(m));
  let score = hasExpSection ? 55 : 25;

  const yearReqs = [...jobDescription.matchAll(/(\d+)\+?\s*(?:years?|yrs?)/gi)].map((m) =>
    parseInt(m[1], 10),
  );
  const resumeYears = [...resumeText.matchAll(/(\d+)\+?\s*(?:years?|yrs?)/gi)].map((m) =>
    parseInt(m[1], 10),
  );

  if (yearReqs.length > 0) {
    const required = Math.max(...yearReqs);
    const claimed = resumeYears.length > 0 ? Math.max(...resumeYears) : 0;
    if (claimed >= required) score += 35;
    else if (claimed > 0) score += Math.round((claimed / required) * 25);
    return {
      score: clamp(score),
      detail:
        claimed >= required
          ? `Meets ${required}+ years signal from job post.`
          : claimed > 0
            ? `Job asks ~${required} yrs; resume shows ~${claimed} yrs signal.`
            : `Job asks ${required}+ years; no years signal on resume.`,
    };
  }

  score += hasExpSection ? 30 : 10;
  return {
    score: clamp(score),
    detail: hasExpSection ? 'Experience section detected.' : 'No clear experience section.',
  };
}

function scoreFormat(resumeText: string): { score: number; detail: string; warnings: string[] } {
  const warnings: string[] = [];
  let score = 0;
  const len = resumeText.trim().length;

  const sectionsFound = detectStandardSections(resumeText);
  score += Math.min(40, sectionsFound.length * 10);

  if (len < 300) {
    warnings.push('Resume text is very short — ATS may lack parseable content.');
    score -= 15;
  } else if (len >= 300 && len <= 8000) {
    score += 25;
  } else if (len > 12000) {
    warnings.push('Resume is very long — some ATS truncate after ~2 pages.');
    score -= 10;
  } else {
    score += 15;
  }

  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(resumeText)) score += 15;
  else warnings.push('No email detected — contact parsing may fail.');

  const specialRatio = (resumeText.match(/[^\w\s.,;:'\-/@#+()]/g) ?? []).length / Math.max(len, 1);
  if (specialRatio > 0.08) {
    warnings.push('High special-character density may hurt ATS parsing.');
    score -= 15;
  } else {
    score += 20;
  }

  score += sectionsFound.includes('skills') ? 10 : 0;

  return {
    score: clamp(score),
    detail: `${sectionsFound.length} standard sections · ${len.toLocaleString()} chars extracted.`,
    warnings,
  };
}

function checkEducationRequirement(
  jobDescription: string,
  resumeText: string,
): string | null {
  const jdLower = normalizeText(jobDescription);
  const needsDegree = ['bachelor', 'master', 'degree required', 'bs ', 'ba '].some((t) =>
    jdLower.includes(t),
  );
  if (!needsDegree) return null;
  const hasDegree = DEGREE_TERMS.some((d) => containsTerm(resumeText, d));
  if (!hasDegree) {
    return 'Job mentions degree requirements; none detected on resume.';
  }
  return null;
}

export function scoreResumeATS(resumeText: string, job: JobPosting): ATSScoreResult {
  const keywords = extractJobKeywords(job);
  const skillTerms = keywords.filter((k) => k.source === 'skill');

  const kw = scoreKeywords(resumeText, keywords);
  const skills = scoreSkills(resumeText, skillTerms);
  const title = scoreTitleMatch(resumeText, job.title);
  const experience = scoreExperience(resumeText, job.description);
  const format = scoreFormat(resumeText);

  const categories: ATSCategoryScore[] = [
    {
      id: 'keywords',
      label: 'Keyword match',
      score: kw.score,
      weight: CATEGORY_WEIGHTS.keywords,
      weighted: kw.score * CATEGORY_WEIGHTS.keywords,
      detail: kw.detail,
    },
    {
      id: 'skills',
      label: 'Skills alignment',
      score: skills.score,
      weight: CATEGORY_WEIGHTS.skills,
      weighted: skills.score * CATEGORY_WEIGHTS.skills,
      detail: skills.detail,
    },
    {
      id: 'title',
      label: 'Title relevance',
      score: title.score,
      weight: CATEGORY_WEIGHTS.title,
      weighted: title.score * CATEGORY_WEIGHTS.title,
      detail: title.detail,
    },
    {
      id: 'experience',
      label: 'Experience fit',
      score: experience.score,
      weight: CATEGORY_WEIGHTS.experience,
      weighted: experience.score * CATEGORY_WEIGHTS.experience,
      detail: experience.detail,
    },
    {
      id: 'format',
      label: 'Parse & structure',
      score: format.score,
      weight: CATEGORY_WEIGHTS.format,
      weighted: format.score * CATEGORY_WEIGHTS.format,
      detail: format.detail,
    },
  ];

  const overall = clamp(categories.reduce((sum, c) => sum + c.weighted, 0));
  const warnings = [...format.warnings];
  const eduWarn = checkEducationRequirement(job.description, resumeText);
  if (eduWarn) warnings.push(eduWarn);

  return {
    overall,
    grade: gradeFromScore(overall),
    categories,
    matchedKeywords: kw.matched,
    missingKeywords: kw.missing,
    warnings,
    keywordMatchRate: kw.score,
  };
}
