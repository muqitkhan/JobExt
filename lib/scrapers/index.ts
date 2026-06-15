import { expandLinkedInDescription, isLinkedInJobPage, scrapeLinkedIn } from './linkedin';
import type { ScrapeResult } from './types';
import {
  collectByClassFragment,
  collectLongestText,
  delay,
  firstText,
  metaContent,
  ogContent,
  parseJsonLdJobPosting,
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
    collectLongestText(
      ['#jobDescriptionText', '.jobsearch-jobDescriptionText', '[id*="jobDescriptionText"]'],
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
    collectLongestText(
      ['[data-test="jobDescriptionContent"]', '.JobDetails_jobDescription__', '#JobDescriptionContainer', '.desc'],
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
    collectLongestText(
      ['.job_description', '[data-test="job-description"]', '#job_description', 'article'],
      40,
    ) ||
    jsonLd?.description ||
    '';

  if (!description && !title) return null;
  return { title, company, location, description, source: 'ziprecruiter' };
}

export function scrapeGeneric(): ScrapeResult | null {
  const jsonLd = parseJsonLdJobPosting();
  if (jsonLd?.description && jsonLd.description.length >= 40) {
    return { ...jsonLd, source: 'json-ld' };
  }

  const selection = window.getSelection()?.toString().trim();
  if (selection && selection.length > 100) {
    return {
      title: document.title,
      company: '',
      location: '',
      description: selection,
      source: 'selection',
    };
  }

  const ogDesc = ogContent('og:description');
  if (ogDesc.length > 120) {
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
      if (description.length > 200) {
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
  for (const block of blocks) {
    const text = textOf(block);
    if (text.length > best.length) best = text;
  }

  best =
    best ||
    collectByClassFragment('job-description', 120) ||
    collectByClassFragment('description', 120) ||
    '';

  if (best.length < 200) {
    const body = document.body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (body.length > 200) best = body.slice(0, 15000);
  }

  const meta = stripHtml(metaContent('description'));
  if (meta.length > best.length) best = meta;

  if (!best) return null;
  return {
    title: document.title,
    company: '',
    location: '',
    description: best.slice(0, 15000),
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

/** Expand dynamic content, retry while SPAs finish rendering, then scrape. */
export async function scrapeCurrentPageWithRetry(): Promise<ScrapeResult | null> {
  const host = window.location.hostname;

  if (host.includes('linkedin.com') || isLinkedInJobPage()) {
    expandLinkedInDescription();
    await delay(350);
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const result = scrapeCurrentPage();
    if (result?.description && result.description.length >= 80) {
      return result;
    }
    if (host.includes('linkedin.com')) {
      expandLinkedInDescription();
    }
    await delay(attempt === 0 ? 200 : 450);
  }

  const last = scrapeCurrentPage();
  if (last?.description || last?.title) return last;
  return null;
}

export { captureJobFromTab, captureJobFromActiveTab, getJobListingTab } from './capture';
