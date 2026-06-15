export default defineBackground(() => {
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {
      // Firefox may not support sidePanel API
    });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'JOBEXT_DOWNLOAD') return;

    const { fileName, mimeType, base64 } = message as {
      fileName: string;
      mimeType: string;
      base64: string;
    };

    void browser.downloads
      .download({
        url: `data:${mimeType};base64,${base64}`,
        filename: fileName,
        saveAs: false,
      })
      .then((id) => sendResponse(id !== undefined))
      .catch(() => sendResponse(false));

    return true;
  });

  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      void openJobExtAfterInstall(true);
    } else if (details.reason === 'update') {
      void openJobExtAfterInstall(false);
    }
  });
});

/** Open side panel on install; on update prefer side panel only (no new tab). */
async function openJobExtAfterInstall(allowTabFallback: boolean): Promise<void> {
  try {
    const windows = await browser.windows.getAll({ windowTypes: ['normal'] });
    const windowId = windows.find((w) => w.focused)?.id ?? windows[0]?.id;
    if (windowId !== undefined) {
      await browser.sidePanel.open({ windowId });
      return;
    }
  } catch {
    // sidePanel.open may fail without a window
  }

  if (!allowTabFallback) return;

  try {
    const panelUrl = browser.runtime.getURL('/sidepanel.html');
    const tabs = await browser.tabs.query({ url: panelUrl });
    if (tabs.length === 0) {
      await browser.tabs.create({ url: panelUrl, active: true });
    }
  } catch {
    // ignore
  }
}
