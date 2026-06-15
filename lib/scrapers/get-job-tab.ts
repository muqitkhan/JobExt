type JobTab = { id?: number; url?: string; windowId?: number; active?: boolean };

/** Find the best browser tab to capture a job listing from (side panel safe). */
export async function getJobListingTab(): Promise<JobTab | undefined> {
  const [active] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  if (active?.id && isWebPage(active.url)) {
    return active;
  }

  const windowId = active?.windowId;
  if (windowId !== undefined) {
    const httpTabs = await browser.tabs.query({
      windowId,
      url: ['http://*/*', 'https://*/*'],
    });
    const jobLike =
      httpTabs.find((t) => isLikelyJobPage(t.url)) ??
      httpTabs.find((t) => t.active) ??
      httpTabs[httpTabs.length - 1];
    if (jobLike?.id) return jobLike;
  }

  const [anyHttp] = await browser.tabs.query({ url: ['http://*/*', 'https://*/*'], currentWindow: true });
  return anyHttp?.id ? anyHttp : active;
}

function isWebPage(url?: string): boolean {
  return Boolean(url && (url.startsWith('http://') || url.startsWith('https://')));
}

function isLikelyJobPage(url?: string): boolean {
  if (!url) return false;
  return (
    /linkedin\.com\/jobs/i.test(url) ||
    /indeed\.com/i.test(url) ||
    /glassdoor\.com/i.test(url) ||
    /ziprecruiter\.com/i.test(url) ||
    /\/jobs?\//i.test(url) ||
    /careers?/i.test(url)
  );
}
