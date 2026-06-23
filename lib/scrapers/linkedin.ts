import type { ScrapeResult } from './types';
import {
  collectBestText,
  collectByClassFragment,
  collectByClassFragmentIn,
  firstText,
  metaContent,
  ogContent,
  parseJsonLdJobPosting,
  stripHtml,
  textOf,
} from './utils';

/** LinkedIn job detail pane — avoids grabbing feed / similar jobs side content. */
export function linkedInJobRoot(): Element | null {
  return (
    document.querySelector('.jobs-search__job-details') ??
    document.querySelector('.jobs-details') ??
    document.querySelector('.job-view-layout') ??
    document.querySelector('[class*="jobs-details__main-content"]') ??
    document.querySelector('.scaffold-layout__detail') ??
    document.querySelector('#job-details')?.closest('div[class*="jobs"]') ??
    null
  );
}

/** Click LinkedIn "Show more" / "…more" controls so the full description is in the DOM. */
export function expandLinkedInDescription(): void {
  const root = linkedInJobRoot() ?? document;
  const buttonSelectors = [
    '.jobs-description__footer-button',
    '[data-tracking-control-name="public_jobs_show-more-html-btn"]',
    'button[aria-label*="more" i]',
    'button[aria-label*="Show more" i]',
    '.jobs-description-content__text button',
    '.show-more-less-html__button',
  ];

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

export function scrapeLinkedIn(): ScrapeResult | null {
  const jsonLd = parseJsonLdJobPosting();
  const root = linkedInJobRoot() ?? document;

  const title =
    firstText([
      '.job-details-jobs-unified-top-card__job-title h1',
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

  const description =
    collectBestText(
      [
        '.show-more-less-html__markup',
        '.jobs-description-content__text--stretch',
        '.jobs-description-content__text',
        '.jobs-description__content',
        '#job-details',
        '.jobs-box__html-content',
        'article.jobs-description__container',
        '.core-section-container__content',
        '[data-test-id="job-details-description"]',
      ],
      root,
      80,
    ) ||
    collectByClassFragmentIn(root, 'jobs-description', 80) ||
    collectByClassFragmentIn(root, 'job-details', 80) ||
    collectByClassFragmentIn(root, 'show-more-less', 80) ||
    jsonLd?.description ||
    stripHtml(metaContent('description')) ||
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
      Boolean(document.querySelector('[class*="jobs-description"], #job-details, .show-more-less-html__markup')))
  );
}

export function linkedInDescriptionLength(): number {
  const root = linkedInJobRoot() ?? document;
  return textOf(
    root.querySelector('.show-more-less-html__markup, #job-details, .jobs-description__content'),
  ).length;
}
