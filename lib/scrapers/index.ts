import { expandLinkedInDescription, isLinkedInJobPage, scrapeLinkedIn } from './linkedin';
import type { ScrapeResult } from './types';
import {
  collectByClassFragment,
  delay,
  firstText,
  looksLikeJobDescription,
  metaContent,
  ogContent,
  parseJsonLdJobPosting,
  pickJobDescriptionText,
  scoreDescriptionText,
  stripHtml,
  textOf,
} from './utils';

export type { ScrapeResult, ScraperFn } from './types';

const SECTION_KEYWORDS = [
  'description',
  'responsibilities',
  'requirements',
  'qualifications',
  'about the role',
  'what you will do',
  "what you'll do",
  'about the job',
  'role overview',
];

const KNOWN_JOB_SOURCES = new Set(['linkedin', 'indeed', 'glassdoor', 'ziprecruiter', 'json-ld']);

export function scrapeIndeed(): ScrapeResult | null {
  const jsonLd = parseJsonLdJobPosting();
  const title =
    firstText([
      'h1.jobsearch-JobInfoHeader-title',
      '[data-testid="jobsearch-JobInfoHeader-title"]',
      'h1',
    ]) ||
    jsonLd?.title ||
    '';
  const company =
    firstText([
      '[data-testid="inlineHeader-companyName"]',
      '.jobsearch-InlineCompanyRating a',
      '[data-company-name="true"]',
    ]) ||
    jsonLd?.company ||
    '';
  const location =
    firstText(['[data-testid="job-location"]', '[data-testid="inlineHeader-companyLocation"]']) ||
    jsonLd?.location ||
    '';
  const description =
    pickJobDescriptionText(
      ['#jobDescriptionText', '.jobsearch-jobDescriptionText', '[id*="jobDescriptionText"]'],
      document,
      40,
    ) ||
    jsonLd?.description ||
    '';

  if (!description && !title) return null;
  return { title, company, location, description, source: 'indeed' };
}

export function scrapeGlassdoor(): ScrapeResult | null {
  const jsonLd = parseJsonLdJobPosting();
  const title = firstText(['[data-test="job-title"]', '.JobDetails_jobTitle__', 'h1']) || jsonLd?.title || '';
  const company =
    firstText(['[data-test="employer-name"]', '.EmployerProfile_employerName__']) || jsonLd?.company || '';
  const location =
    firstText(['[data-test="location"]', '.JobDetails_location__']) || jsonLd?.location || '';
  const description =
    pickJobDescriptionText(
      ['[data-test="jobDescriptionContent"]', '.JobDetails_jobDescription__', '#JobDescriptionContainer', '.desc'],
      document,
      40,
    ) ||
    jsonLd?.description ||
    '';

  if (!description && !title) return null;
  return { title, company, location, description, source: 'glassdoor' };
}

export function scrapeZipRecruiter(): ScrapeResult | null {
  const jsonLd = parseJsonLdJobPosting();
  const title = firstText(['h1.job_title', '[data-test="job-title"]', 'h1']) || jsonLd?.title || '';
  const company =
    firstText(['a.hiring_company', '[data-test="company-name"]', '.company_name']) || jsonLd?.company || '';
  const location = firstText(['.location', '[data-test="job-location"]']) || jsonLd?.location || '';
  const description =
    pickJobDescriptionText(
      ['.job_description', '[data-test="job-description"]', '#job_description', 'article'],
      document,
      40,
    ) ||
    jsonLd?.description ||
    '';

  if (!description && !title) return null;
  return { title, company, location, description, source: 'ziprecruiter' };
}

export function scrapeGeneric(): ScrapeResult | null {
  const jsonLd = parseJsonLdJobPosting();
  if (jsonLd?.description && jsonLd.description.length >= 60) {
    return { ...jsonLd, source: 'json-ld' };
  }

  const selection = window.getSelection()?.toString().trim();
  if (selection && selection.length >= 80) {
    return {
      title: document.title,
      company: '',
      location: '',
      description: selection,
      source: 'selection',
    };
  }

  const ogDesc = ogContent('og:description');
  if (ogDesc.length >= 80) {
    return {
      title: ogContent('og:title') || document.title,
      company: '',
      location: '',
      description: ogDesc,
      source: 'generic',
    };
  }

  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4'));
  for (const heading of headings) {
    const headingText = heading.textContent?.toLowerCase() ?? '';
    if (SECTION_KEYWORDS.some((kw) => headingText.includes(kw))) {
      const container = heading.closest('section, article, div') ?? heading.parentElement;
      const description = textOf(container);
      if (description.length >= 120) {
        return {
          title: document.title,
          company: '',
          location: '',
          description,
          source: 'generic',
        };
      }
    }
  }

  const blocks = Array.from(
    document.querySelectorAll(
      'article, main, section, [role="main"], [class*="job-description"], [class*="description"], [id*="job-description"]',
    ),
  );
  let best = '';
  let bestScore = 0;
  for (const block of blocks) {
    const text = textOf(block);
    const score = scoreDescriptionText(text);
    if (score > bestScore) {
      bestScore = score;
      best = text;
    }
  }

  best =
    best ||
    pickJobDescriptionText(
      ['[class*="job-description"]', '[id*="job-description"]', '[class*="description"]'],
      document,
      80,
    ) ||
    collectByClassFragment('job-description', 80) ||
    collectByClassFragment('description', 80) ||
    '';

  const meta = stripHtml(metaContent('description'));
  if (scoreDescriptionText(meta) > bestScore) best = meta;

  if (!best || best.length < 80) return null;
  return {
    title: document.title,
    company: '',
    location: '',
    description: best.slice(0, 15_000),
    source: 'generic',
  };
}

export function scrapeCurrentPage(): ScrapeResult | null {
  const host = window.location.hostname;
  if (host.includes('linkedin.com')) return scrapeLinkedIn();
  if (host.includes('indeed.com')) return scrapeIndeed();
  if (host.includes('glassdoor.com')) return scrapeGlassdoor();
  if (host.includes('ziprecruiter.com')) return scrapeZipRecruiter();
  return scrapeGeneric();
}

function isGoodCapture(result: ScrapeResult | null): boolean {
  if (!result?.description?.trim()) return false;
  const len = result.description.trim().length;

  if (KNOWN_JOB_SOURCES.has(result.source) && len >= 100) return true;
  if (len >= 250) return true;
  if (len >= 120 && looksLikeJobDescription(result.description, true)) return true;
  return len >= 180 && looksLikeJobDescription(result.description);
}

function bestCaptureAttempt(results: Array<ScrapeResult | null>): ScrapeResult | null {
  let best: ScrapeResult | null = null;
  let bestLen = 0;

  for (const result of results) {
    if (!result?.description?.trim()) continue;
    const len = result.description.trim().length;
    if (len > bestLen) {
      bestLen = len;
      best = result;
    }
  }

  return best;
}

/** Expand dynamic content, retry while SPAs finish rendering, then scrape. */
export async function scrapeCurrentPageWithRetry(): Promise<ScrapeResult | null> {
  const host = window.location.hostname;
  const isLinkedIn = host.includes('linkedin.com') || isLinkedInJobPage();
  const attempts: Array<ScrapeResult | null> = [];

  if (isLinkedIn) {
    expandLinkedInDescription();
    await delay(500);
  }

  for (let attempt = 0; attempt < 6; attempt++) {
    const result = scrapeCurrentPage();
    attempts.push(result);

    if (isGoodCapture(result)) {
      return result;
    }

    if (isLinkedIn) {
      expandLinkedInDescription();
    }
    await delay(attempt < 2 ? 300 : 550);
  }

  const best = bestCaptureAttempt(attempts);
  if (best?.description && best.description.trim().length >= 80) {
    return best;
  }

  const last = scrapeCurrentPage();
  if (last?.description && last.description.trim().length >= 60) return last;
  if (last?.title?.trim()) return last;
  return null;
}

export { captureJobFromTab, captureJobFromActiveTab, getJobListingTab } from './capture';
