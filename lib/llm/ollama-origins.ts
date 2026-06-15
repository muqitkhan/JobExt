/** Allowed browser-extension origins for Ollama (see ollama.com/docs). */
export const OLLAMA_ORIGINS_VALUE =
  'chrome-extension://*,moz-extension://*,safari-web-extension://*';

export function isOllamaOriginBlocked(status: number): boolean {
  return status === 403;
}

export function getOllamaFixInstructions(): string {
  return `Ollama blocked JobExt (HTTP 403). Allow browser extensions, then restart Ollama.

macOS — paste in Terminal:
launchctl setenv OLLAMA_ORIGINS "${OLLAMA_ORIGINS_VALUE}"
killall Ollama 2>/dev/null; open -a Ollama

Windows — set user env var OLLAMA_ORIGINS to * then restart Ollama from the tray.

Then click Download again in JobExt.`;
}

export function getMacOllamaFixScript(): string {
  return `launchctl setenv OLLAMA_ORIGINS "${OLLAMA_ORIGINS_VALUE}"
killall Ollama 2>/dev/null; open -a Ollama`;
}

export function getTerminalPullCommand(model: string): string {
  return `ollama pull ${model}`;
}
