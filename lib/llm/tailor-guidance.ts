import type { JobPosting } from '../types';
import { scoreResumeATS } from '../ats/score';
import { containsTerm } from '../ats/keywords';

/** Shared writing rules for resume tailoring and cover letters. */
export const XYZ_FRAMEWORK = `X–Y–Z accomplishment format (required for experience bullets and cover letter examples):
- X (Accomplished): Start with a strong action verb describing the project, goal, or outcome you achieved.
- Y (Measured by): Include quantifiable metrics, scale, or evidence from the ORIGINAL resume only — never invent numbers.
- Z (By doing): Explain the actions, technologies, and methodologies used — weave missing job keywords here with business context.`;

export const KEYWORD_CONTEXT_RULES = `Missing keyword requirements:
- Address each missing keyword by showing WHAT you built, HOW you used it, and the BUSINESS result — not as a comma-separated skill list.
- Do not append bare keywords. Integrate them into accomplishment narratives and outcomes.`;

export const TAILOR_WRITING_RULES = `${XYZ_FRAMEWORK}

${KEYWORD_CONTEXT_RULES}`;

export function getMissingKeywords(
  job: JobPosting,
  resumeText: string,
  limit = 12,
): string[] {
  return scoreResumeATS(resumeText, job).missingKeywords.slice(0, limit);
}

function pickVerb(original: string): string {
  const match = original.match(
    /\b(built|developed|designed|delivered|led|managed|implemented|created|engineered|launched|optimized|architected)\b/i,
  );
  if (match) {
    const v = match[1];
    return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
  }
  return 'Delivered';
}

function extractMetric(original: string): string | null {
  const pct = original.match(/(\d+(?:\.\d+)?%)/);
  if (pct) return pct[1];

  const money = original.match(/(\$[\d,.]+[kKmM]?)/);
  if (money) return money[1];

  const scale = original.match(
    /(\d[\d,]*\+?\s*(?:users|customers|clients|requests|transactions|teams|engineers|projects))/i,
  );
  if (scale) return scale[1];

  const years = original.match(/(\d+\+?\s*years?)/i);
  if (years) return years[1];

  return null;
}

function stripLeadingVerb(text: string): string {
  return text.replace(/^(built|developed|designed|delivered|led|managed|implemented|created)\s+/i, '').trim();
}

/**
 * Rewrite a resume line using X–Y–Z structure and missing keywords in the Z clause.
 */
export function buildXyzBullet(
  original: string,
  keywords: string[],
  options: { jobTitle?: string; section?: string } = {},
): string {
  const trimmed = original.trim();
  const terms = keywords.filter((k) => k && !containsTerm(trimmed, k)).slice(0, 4);
  if (terms.length === 0) return trimmed;

  const section = options.section ?? '';
  const verb = pickVerb(trimmed);
  const metric = extractMetric(trimmed);
  const outcome = stripLeadingVerb(trimmed) || 'business-critical product initiatives';

  if (/skills|competencies|technical/i.test(section)) {
    const head = trimmed.includes(':') ? `${trimmed.split(':')[0]}:` : 'Applied expertise:';
    const body = trimmed.includes(':') ? trimmed.split(':').slice(1).join(':').trim() : trimmed;
    return (
      `${head} ${verb} production systems using ${terms.slice(0, 2).join(' and ')}` +
      `${terms.length > 2 ? `, driving outcomes with ${terms.slice(2).join(', ')}` : ''}` +
      `${body && body !== terms.join(', ') ? ` (${body})` : ''}.`
    ).slice(0, 320);
  }

  if (/summary|profile|objective/i.test(section)) {
    const title = options.jobTitle?.trim() || 'Professional';
    const y = metric ? `, with ${metric} of hands-on delivery` : ', with a track record of reliable delivery';
    return (
      `${title} who ${verb.toLowerCase()}s customer-facing solutions${y}, ` +
      `by applying ${terms.join(', ')} to improve product velocity and business outcomes.`
    ).slice(0, 320);
  }

  const yClause = metric
    ? `, measured by ${metric} of impact`
    : ', measured by improved delivery speed and product reliability';
  const zClause = `, by implementing ${terms.join(', ')} across production workflows`;

  return `${verb} ${outcome}${yClause}${zClause}.`.slice(0, 320);
}

export function formatMissingKeywordsBlock(keywords: string[]): string {
  if (keywords.length === 0) return 'None detected — align to job description themes.';
  return keywords.join(', ');
}
