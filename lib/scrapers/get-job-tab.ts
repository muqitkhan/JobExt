type JobTab = { id?: number; url?: string; windowId?: number; active?: boolean; lastAccessed?: number };

/** Find the best browser tab to capture a job listing from (side panel safe). */
export async function getJobListingTab(): Promise<JobTab | undefined> {
  const [active] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  const windowId = active?.windowId;

  const pickBestJobTab = (tabs: JobTab[]): JobTab | undefined => {
    const jobTabs = tabs.filter((t) => isLikelyJobPage(t.url));
    if (jobTabs.length === 0) return undefined;
    jobTabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
    return jobTabs[0];
  };

  if (windowId !== undefined) {
    const httpTabs = await browser.tabs.query({
      windowId,
      url: ['http://*/*', 'https://*/*'],
    });
    const jobTab = pickBestJobTab(httpTabs);
    if (jobTab?.id) return jobTab;
  }

  if (active?.id && isWebPage(active.url) && isLikelyJobPage(active.url)) {
    return active;
  }

  if (windowId !== undefined) {
    const httpTabs = await browser.tabs.query({
      windowId,
      url: ['http://*/*', 'https://*/*'],
    });
    const fallback =
      httpTabs.find((t) => t.active) ?? httpTabs[httpTabs.length - 1];
    if (fallback?.id) return fallback;
  }

  if (active?.id && isWebPage(active.url)) {
    return active;
  }

  const [anyHttp] = await browser.tabs.query({ url: ['http://*/*', 'https://*/*'], currentWindow: true });
  return anyHttp?.id ? anyHttp : active;
}

function isWebPage(url?: string): boolean {
  return Boolean(url && (url.startsWith('http://') || url.startsWith('https://')));
}

function isLikelyJobPage(url?: string): boolean {
  if (!url) return false;
  const u = url.toLowerCase();
  return (
    /linkedin\.com\/jobs/i.test(u) ||
    /linkedin\.com.*currentjobid=/i.test(u) ||
    /indeed\.com/i.test(u) ||
    /glassdoor\.com/i.test(u) ||
    /ziprecruiter\.com/i.test(u) ||
    /greenhouse\.io/i.test(u) ||
    /lever\.co/i.test(u) ||
    /myworkdayjobs\.com/i.test(u) ||
    /jobs\.ashbyhq\.com/i.test(u) ||
    /\/jobs?\//i.test(u) ||
    /\/careers?\//i.test(u) ||
    /\/job\//i.test(u) ||
    /\/position\//i.test(u)
  );
}
