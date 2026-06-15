import type { JobPosting } from '../types';
import type { ScrapeResult } from './types';
import { getJobListingTab } from './get-job-tab';

const CONTENT_SCRIPT = '/content-scripts/content.js' as const;

export { getJobListingTab } from './get-job-tab';

export async function captureJobFromActiveTab(): Promise<{ job?: JobPosting; error?: string }> {
  const tab = await getJobListingTab();
  if (!tab?.id) {
    return { error: 'No browser tab found. Open a job listing page first.' };
  }
  return captureJobFromTab(tab.id, tab.url);
}

export async function captureJobFromTab(
  tabId: number,
  tabUrl?: string,
): Promise<{ job?: JobPosting; error?: string }> {
  if (
    !tabUrl ||
    tabUrl.startsWith('chrome://') ||
    tabUrl.startsWith('edge://') ||
    tabUrl.startsWith('about:') ||
    tabUrl.startsWith('chrome-extension://')
  ) {
    return { error: 'Open a job listing page in your browser first (not settings or the extension).' };
  }

  const sendCapture = () =>
    browser.tabs.sendMessage(tabId, { type: 'CAPTURE_JOB' }) as Promise<{
      type: string;
      job?: ScrapeResult & { url?: string };
      error?: string;
    }>;

  let response: Awaited<ReturnType<typeof sendCapture>> | undefined;

  try {
    response = await sendCapture();
  } catch {
    try {
      await browser.scripting.executeScript({
        target: { tabId },
        files: [CONTENT_SCRIPT],
      });
      await new Promise((resolve) => setTimeout(resolve, 250));
      response = await sendCapture();
    } catch {
      return {
        error:
          'Could not read this tab. Reload the job page, then try Capture again (or paste the description manually).',
      };
    }
  }

  if (!response) {
    return { error: 'No response from the page.' };
  }

  if (response.type === 'JOB_CAPTURED' && response.job) {
    const job = response.job;
    return {
      job: {
        title: job.title,
        company: job.company,
        location: job.location,
        description: job.description,
        source: job.source,
        url: tabUrl ?? job.url ?? '',
      },
    };
  }

  return {
    error:
      response.error ??
      'Could not extract a job description from this page. Open the full job posting, or paste manually.',
  };
}
