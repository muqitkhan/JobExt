/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { scrapeLinkedIn } from '@/lib/scrapers/linkedin';
import { parseJsonLdJobPosting, stripHtml, looksLikeJobDescription, scoreDescriptionText } from '@/lib/scrapers/utils';

describe('scraper utils', () => {
  it('strips HTML from JSON-LD descriptions', () => {
    expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
  });

  it('scores real job descriptions above search noise', () => {
    const jd =
      'Requirements: 5+ years experience with React and TypeScript. Responsibilities include building scalable APIs, mentoring engineers, and collaborating with product teams on roadmap delivery.';
    const noise = 'Apply Apply Apply Similar jobs People also viewed Software Engineer at Acme Apply now';
    expect(looksLikeJobDescription(jd)).toBe(true);
    expect(looksLikeJobDescription(noise)).toBe(false);
    expect(scoreDescriptionText(jd)).toBeGreaterThan(scoreDescriptionText(noise));
  });

  it('parses JobPosting JSON-LD', () => {
    document.body.innerHTML = `
      <script type="application/ld+json">
        {
          "@type": "JobPosting",
          "title": "Software Engineer",
          "description": "<p>Build APIs and services.</p>",
          "hiringOrganization": { "name": "Acme Corp" },
          "jobLocation": {
            "address": {
              "addressLocality": "San Francisco",
              "addressRegion": "CA",
              "addressCountry": "US"
            }
          }
        }
      </script>
    `;
    const parsed = parseJsonLdJobPosting();
    expect(parsed?.title).toBe('Software Engineer');
    expect(parsed?.company).toBe('Acme Corp');
    expect(parsed?.description).toContain('Build APIs');
    expect(parsed?.location).toContain('San Francisco');
  });
});

describe('scrapeLinkedIn', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('reads LinkedIn description markup and title', () => {
    document.body.innerHTML = `
      <h1 class="top-card-layout__title">Product Designer</h1>
      <a class="topcard__org-name-link">Design Co</a>
      <div class="show-more-less-html__markup">
        We are looking for a designer with Figma experience and strong communication skills.
        You will own end-to-end product flows and collaborate with engineering teams daily.
      </div>
    `;
    const result = scrapeLinkedIn();
    expect(result?.title).toBe('Product Designer');
    expect(result?.company).toBe('Design Co');
    expect(result?.description).toContain('Figma');
    expect(result?.source).toBe('linkedin');
  });
});
