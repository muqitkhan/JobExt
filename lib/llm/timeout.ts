export const LLM_QUICK_TIMEOUT_MS = 30_000;
export const LLM_CHAT_TIMEOUT_MS = 120_000;
/** Max wait for one local Ollama phrase rewrite before template fallback. */
export const LLM_LOCAL_MICRO_CHAT_MS = 28_000;
export const LLM_TAILOR_TIMEOUT_MS = 180_000;
export const LLM_CLOUD_CHAT_TIMEOUT_MS = 45_000;
export const LLM_CLOUD_TAILOR_TIMEOUT_MS = 60_000;
export const LLM_COVER_LETTER_TIMEOUT_MS = 90_000;
export const LLM_CLOUD_COVER_TIMEOUT_MS = 45_000;

/** @deprecated Use specific timeout constants instead */
export const LLM_REQUEST_TIMEOUT_MS = LLM_QUICK_TIMEOUT_MS;

export type LLMTimeoutContext = 'chat' | 'tailor' | 'cover' | 'quick';

const TIMEOUT_HINTS: Record<LLMTimeoutContext, string> = {
  quick: 'Check that your local AI is running.',
  chat:
    'Local AI is slow on this machine. JobExt applied instant keyword edits instead.',
  tailor:
    'Tailoring took too long. JobExt should have applied keyword edits — reload the extension and retry.',
  cover: 'Cover letter timed out. Retry or skip it.',
};

export class LLMTimeoutError extends Error {
  constructor(seconds: number, context: LLMTimeoutContext = 'chat') {
    super(`Timed out after ${seconds}s. ${TIMEOUT_HINTS[context]}`);
    this.name = 'LLMTimeoutError';
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number = LLM_QUICK_TIMEOUT_MS,
  message?: string,
  context: LLMTimeoutContext = 'chat',
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(message ? new Error(message) : new LLMTimeoutError(ms / 1000, context));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err: unknown) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  ms: number = LLM_QUICK_TIMEOUT_MS,
  context: LLMTimeoutContext = 'chat',
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  const onAbort = () => controller.abort();
  init?.signal?.addEventListener('abort', onAbort);

  return fetch(input, { ...init, signal: controller.signal })
    .catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new LLMTimeoutError(ms / 1000, context);
      }
      throw err;
    })
    .finally(() => {
      clearTimeout(timer);
      init?.signal?.removeEventListener('abort', onAbort);
    });
}
