export function textOf(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

export function stripHtml(html: string): string {
  if (!html.includes('<')) return html.trim();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent?.replace(/\s+/g, ' ').trim() ?? html.trim();
}

export function firstText(selectors: string[]): string {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const value = textOf(el);
    if (value) return value;
  }
  return '';
}

export function collectLongestText(selectors: string[], minLength = 0): string {
  let best = '';
  for (const selector of selectors) {
    document.querySelectorAll(selector).forEach((el) => {
      const value = textOf(el);
      if (value.length > best.length) best = value;
    });
  }
  return best.length >= minLength ? best : '';
}

const JOB_SIGNAL_WORDS = [
  'responsibilities',
  'requirements',
  'qualifications',
  'experience',
  'skills',
  'description',
  'benefits',
  'about the role',
  'what you',
];

const SEARCH_RESULT_NOISE = [
  /\bsimilar jobs\b/i,
  /\bpeople also viewed\b/i,
  /\brecommended for you\b/i,
  /\b\d+\s+results\b/i,
  /\bsearch results\b/i,
];

/** Heuristic: real JD text vs search chrome / side panels. */
export function looksLikeJobDescription(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 120) return false;

  const lower = trimmed.toLowerCase();
  if (SEARCH_RESULT_NOISE.some((re) => re.test(lower))) return false;

  const applyCount = (trimmed.match(/\bapply\b/gi) ?? []).length;
  if (applyCount >= 4 && trimmed.length < 2500) return false;

  const signals = JOB_SIGNAL_WORDS.filter((w) => lower.includes(w)).length;
  if (signals >= 1) return true;

  return trimmed.length >= 350;
}

export function scoreDescriptionText(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length < 40) return 0;

  let score = Math.min(trimmed.length, 10_000);
  if (looksLikeJobDescription(trimmed)) score += 800;

  for (const re of SEARCH_RESULT_NOISE) {
    if (re.test(trimmed)) score -= 600;
  }

  const applyCount = (trimmed.match(/\bapply\b/gi) ?? []).length;
  if (applyCount >= 3) score -= applyCount * 120;

  return score;
}

/** Pick best-scoring candidate instead of blindly taking the longest block. */
export function collectBestText(
  selectors: string[],
  root: ParentNode = document,
  minLength = 40,
): string {
  let best = '';
  let bestScore = 0;

  for (const selector of selectors) {
    root.querySelectorAll(selector).forEach((el) => {
      const value = textOf(el);
      if (value.length < minLength) return;
      const score = scoreDescriptionText(value);
      if (score > bestScore) {
        bestScore = score;
        best = value;
      }
    });
  }

  return best;
}

export function collectByClassFragmentIn(
  root: ParentNode,
  fragment: string,
  minLength = 80,
): string {
  let best = '';
  let bestScore = 0;
  root.querySelectorAll(`[class*="${fragment}"]`).forEach((el) => {
    const value = textOf(el);
    if (value.length < minLength) return;
    const score = scoreDescriptionText(value);
    if (score > bestScore) {
      bestScore = score;
      best = value;
    }
  });
  return best;
}

export function collectByClassFragment(fragment: string, minLength = 80): string {
  let best = '';
  document.querySelectorAll(`[class*="${fragment}"]`).forEach((el) => {
    const value = textOf(el);
    if (value.length > best.length) best = value;
  });
  return best.length >= minLength ? best : '';
}

export function parseJsonLdJobPosting(): {
  title: string;
  company: string;
  location: string;
  description: string;
} | null {
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const raw = script.textContent?.trim();
      if (!raw) continue;
      const parsed = JSON.parse(raw) as unknown;
      const items = flattenJsonLd(parsed);
      for (const item of items) {
        if (!isJobPosting(item)) continue;
        const title = stringField(item.title) ?? stringField(item.name) ?? '';
        const org = item.hiringOrganization;
        const company =
          (org && typeof org === 'object' && 'name' in org
            ? stringField((org as { name: unknown }).name)
            : null) ?? stringField(org) ?? '';
        const location = formatJobLocation(item.jobLocation);
        const description = stripHtml(stringField(item.description) ?? '');
        if (title || description) {
          return { title, company, location, description };
        }
      }
    } catch {
      // try next script tag
    }
  }
  return null;
}

function flattenJsonLd(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== 'object') return [];
  const record = data as Record<string, unknown>;
  if (Array.isArray(data)) {
    return data.flatMap((entry) => flattenJsonLd(entry));
  }
  if (Array.isArray(record['@graph'])) {
    return (record['@graph'] as unknown[]).flatMap((entry) => flattenJsonLd(entry));
  }
  return [record];
}

function isJobPosting(item: Record<string, unknown>): boolean {
  const type = item['@type'];
  if (typeof type === 'string') return type.includes('JobPosting');
  if (Array.isArray(type)) return type.some((t) => typeof t === 'string' && t.includes('JobPosting'));
  return false;
}

function stringField(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (value && typeof value === 'object' && 'name' in value) {
    return stringField((value as { name: unknown }).name);
  }
  return null;
}

function formatJobLocation(jobLocation: unknown): string {
  if (!jobLocation) return '';
  const locations = Array.isArray(jobLocation) ? jobLocation : [jobLocation];
  const parts: string[] = [];
  for (const loc of locations) {
    if (typeof loc === 'string') {
      parts.push(loc);
      continue;
    }
    if (!loc || typeof loc !== 'object') continue;
    const address = (loc as { address?: unknown }).address;
    if (typeof address === 'string') {
      parts.push(address);
      continue;
    }
    if (address && typeof address === 'object') {
      const addr = address as Record<string, string>;
      const line = [addr.addressLocality, addr.addressRegion, addr.addressCountry]
        .filter(Boolean)
        .join(', ');
      if (line) parts.push(line);
    }
  }
  return parts.join(' · ');
}

export function metaContent(name: string): string {
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute('content')?.trim() ?? '';
}

export function ogContent(property: string): string {
  return document.querySelector(`meta[property="${property}"]`)?.getAttribute('content')?.trim() ?? '';
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
