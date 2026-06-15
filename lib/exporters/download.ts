import { browser } from 'wxt/browser';

const MIME_BY_EXT: Record<string, string> = {
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain;charset=utf-8',
  '.rtf': 'application/rtf',
};

export function mimeTypeForFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const ext = dot >= 0 ? fileName.slice(dot).toLowerCase() : '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

async function downloadViaApi(dataUrl: string, fileName: string): Promise<void> {
  if (!browser.downloads?.download) {
    throw new Error('Downloads API unavailable.');
  }

  const id = await browser.downloads.download({
    url: dataUrl,
    filename: fileName,
    saveAs: false,
  });

  if (id === undefined) {
    const err = browser.runtime.lastError;
    throw new Error(err?.message ?? 'Download failed — check extension permissions.');
  }
}

/** Reliable file download from extension side panel (data URL + downloads API). */
export async function downloadBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  mimeType?: string,
): Promise<void> {
  const type = mimeType ?? mimeTypeForFileName(fileName);
  const dataUrl = `data:${type};base64,${arrayBufferToBase64(buffer)}`;

  try {
    await downloadViaApi(dataUrl, fileName);
    return;
  } catch {
    // Fall through to background handler
  }

  try {
    const ok = await browser.runtime.sendMessage({
      type: 'JOBEXT_DOWNLOAD',
      fileName,
      mimeType: type,
      base64: arrayBufferToBase64(buffer),
    });
    if (ok === true) return;
  } catch {
    // Fall through to anchor
  }

  const blob = new Blob([buffer], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function downloadText(fileName: string, text: string): void {
  const encoder = new TextEncoder();
  void downloadBuffer(encoder.encode(text).buffer as ArrayBuffer, fileName, 'text/plain;charset=utf-8');
}
