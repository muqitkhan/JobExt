import { scrapeCurrentPageWithRetry } from '@/lib/scrapers';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'CAPTURE_JOB') {
        void scrapeCurrentPageWithRetry().then((result) => {
          if (!result?.description?.trim() && !result?.title?.trim()) {
            sendResponse({
              type: 'JOB_CAPTURE_ERROR',
              error:
                'Could not extract a job description from this page. Open the full job posting (not search results), or paste manually.',
            });
            return;
          }
          const description = result.description?.trim() ?? '';
          if (description.length < 80 && !result.title?.trim()) {
            sendResponse({
              type: 'JOB_CAPTURE_ERROR',
              error:
                'Only a short snippet was found. Open the full job posting and click Show more, or paste the description manually.',
            });
            return;
          }
          sendResponse({
            type: 'JOB_CAPTURED',
            job: {
              ...result,
              description: description || result.title || '',
              url: window.location.href,
            },
          });
        });
        return true;
      }
      return undefined;
    });
  },
});
