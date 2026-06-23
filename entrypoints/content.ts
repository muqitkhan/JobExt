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
          if (description.length < 60) {
            sendResponse({
              type: 'JOB_CAPTURE_ERROR',
              error:
                description.length === 0
                  ? 'Could not find job description text on this page. Click a job listing to open the full post (not search results), expand “Show more” if needed, then capture again — or paste manually.'
                  : 'Only a short snippet was found. Expand the full job description on the page, then capture again — or paste manually.',
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
