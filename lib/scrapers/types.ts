export interface ScrapeResult {
  title: string;
  company: string;
  location: string;
  description: string;
  source: string;
}

export type ScraperFn = () => ScrapeResult | null;
