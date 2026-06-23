import type { ScrapeResult } from './types';
import {
  collectByClassFragmentIn,
  firstText,
  metaContent,
  ogContent,
  parseJsonLdJobPosting,
  pickJobDescriptionText,
  stripHtml,
  textOf,
} from './utils';

const LINKEDIN_DESCRIPTION_SELECTORS = [
  '.show-more-less-html__markup',
  '.jobs-description-content__text--stretch',
  '.jobs-description-content__text',
  '.jobs-description__content',
  '.jobs-description',
  '#job-details',
  '.jobs-box__html-content',
  'article.jobs-description__container',
  '.core-section-container__content',
  '[data-test-id="job-details-description"]',
  '[class*="jobs-description"]',
  '[class*="job-details"]',
  '[class*="show-more-less"]',
];

const LINKEDIN_ROOT_SELECTORS = [
  '.jobs-search__job-details',
  '.jobs-search__job-details--wrapper',
  '[class*="jobs-search__job-details"]',
  '.jobs-details',
  '.job-view-layout',
  '[class*="jobs-details__main-content"]',
  '.scaffold-layout__detail',
  'main .jobs-details',
];

/** LinkedIn job detail pane — pick the container with the most job text. */
export function linkedInJobRoot(): Element | null {
  let best: Element | null = null;
  let bestLen = 0;

  for (const selector of LINKEDIN_ROOT_SELECTORS) {
    document.querySelectorAll(selector).forEach((el) => {
      const len = textOf(el).length;
      if (len > bestLen) {
        bestLen = len;
        best = el;
      }
    });
  }

  if (best && bestLen >= 80) return best;

  const jobDetails = document.querySelector('#job-details');
  if (jobDetails) {
    const parent = jobDetails.closest('div[class*="jobs"], section, article, main');
    if (parent && textOf(parent).length >= 80) return parent;
  }

  return null;
}

/** Click LinkedIn "Show more" / "…more" controls so the full description is in the DOM. */
export function expandLinkedInDescription(): void {
  const roots: ParentNode[] = [linkedInJobRoot(), document].filter(Boolean) as ParentNode[];

  const buttonSelectors = [
    '.jobs-description__footer-button',
    '[data-tracking-control-name="public_jobs_show-more-html-btn"]',
    'button[aria-label*="more" i]',
    'button[aria-label*="Show more" i]',
    '.jobs-description-content__text button',
    '.show-more-less-html__button',
    'button.show-more-less-html__button--more',
  ];

  for (const root of roots) {
    for (const selector of buttonSelectors) {
      const btn = root.querySelector<HTMLElement>(selector);
      if (btn) {
        btn.click();
        return;
      }
    }

    const containers = root.querySelectorAll(
      '.jobs-description span, .jobs-description-content__text span, #job-details span, .show-more-less-html__markup span',
    );
    for (const span of containers) {
      if (span.children.length === 0 && span.textContent?.trim().toLowerCase() === 'more') {
        span.parentElement?.click();
        return;
      }
    }
  }
}

export function scrapeLinkedIn(): ScrapeResult | null {
  const jsonLd = parseJsonLdJobPosting();
  const root = linkedInJobRoot();

  const title =
    firstText([
      '.job-details-jobs-unified-top-card__job-title h1',
      '.jobs-unified-top-card__job-title h1',
      '.jobs-unified-top-card__job-title',
      '.top-card-layout__title',
      'h1.t-24',
      'h1',
    ]) ||
    jsonLd?.title ||
    ogContent('og:title') ||
    '';

  const company =
    firstText([
      '.job-details-jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__subtitle-primary-grouping a',
      '.topcard__org-name-link',
      'a[data-tracking-control-name="public_jobs_topcard-org-name"]',
    ]) ||
    jsonLd?.company ||
    '';

  const location =
    firstText([
      '.job-details-jobs-unified-top-card__tertiary-description-container',
      '.jobs-unified-top-card__bullet',
      '.topcard__flavor--bullet',
    ]) ||
    jsonLd?.location ||
    '';

  let description =
    pickJobDescriptionText(LINKEDIN_DESCRIPTION_SELECTORS, root, 40) ||
    collectByClassFragmentIn(root ?? document, 'jobs-description', 40) ||
    collectByClassFragmentIn(root ?? document, 'job-details', 40) ||
    collectByClassFragmentIn(root ?? document, 'show-more-less', 40) ||
    jsonLd?.description ||
    stripHtml(metaContent('description')) ||
    ogContent('og:description') ||
    '';

  if (!description && !title) return null;

  return {
    title: title.replace(/\s*\|\s*LinkedIn.*$/i, '').trim(),
    company,
    location,
    description,
    source: 'linkedin',
  };
}

/** True when the page looks like a LinkedIn job listing. */
export function isLinkedInJobPage(): boolean {
  return (
    window.location.hostname.includes('linkedin.com') &&
    (window.location.pathname.includes('/jobs/') ||
      window.location.search.includes('currentJobId=') ||
      Boolean(
        document.querySelector(
          '[class*="jobs-description"], #job-details, .show-more-less-html__markup, .jobs-search__job-details',
        ),
      ))
  );
}

export function linkedInDescriptionLength(): number {
  const root = linkedInJobRoot() ?? document;
  return textOf(
    root.querySelector('.show-more-less-html__markup, #job-details, .jobs-description__content'),
  ).length;
}
