import type { LLMSettings, JobPosting, ParsedResume, TailorResult, EditMode } from '../types';
import {
  buildSystemPrompt,
  buildTailorPrompt,
  parseTailorResponseWithRepair,
  buildFullTextFromChanges,
  finalizeTailorResult,
  isNoOpChange,
  isKeywordDumpChange,
} from './prompts';
import {
  testOllamaConnection,
  chatOllamaMicro,
  warmOllamaModel,
  OllamaOriginBlockedError,
} from './ollama';
import { testOpenAICompatibleConnection } from './openai-compatible';
import { testOpenAIConnection } from './openai-cloud';
import { testAnthropicConnection } from './anthropic';
import { testGeminiConnection } from './gemini';
import { resolveSpeedProfile, getProfileLimits } from './models';
import { prepareTailorInputs } from './truncate';
import {
  LLM_TAILOR_TIMEOUT_MS,
  LLM_CLOUD_TAILOR_TIMEOUT_MS,
  withTimeout,
} from './timeout';
import { chatLLM, usesJsonMode } from './chat';
import { isCloudProvider } from './cloud-providers';
import { extractEditableSpans } from './compress';
import { buildInstantEdits, buildGuaranteedEdits } from './instant-tailor';
import { augmentChangesToTargetScore } from './score-tailor';
import {
  extractTopJobTerms,
  buildSingleSpanPrompt,
  parseMicroRevision,
  MICRO_SYSTEM_PROMPT,
} from './micro';
import { getMissingKeywords } from './tailor-guidance';
import type { ResumeChange } from '../types';

export { LLMTimeoutError } from './timeout';
export { warmOllamaModel } from './ollama';

function isLocalOllama(settings: LLMSettings): boolean {
  return settings.provider === 'ollama';
}

function resolveInstantEdits(resume: ParsedResume, job: JobPosting): ResumeChange[] {
  const instant = buildInstantEdits(resume, job);
  if (instant.length > 0) return instant;
  return buildGuaranteedEdits(resume, job);
}

export async function testLLMConnection(
  settings: LLMSettings,
): Promise<{ ok: boolean; message: string }> {
  switch (settings.provider) {
    case 'ollama':
      return testOllamaConnection(settings);
    case 'openai':
      return testOpenAIConnection(settings);
    case 'anthropic':
      return testAnthropicConnection(settings);
    case 'gemini':
      return testGeminiConnection(settings);
    case 'openai-compatible':
      return testOpenAICompatibleConnection(settings);
    default:
      return { ok: false, message: 'Unknown provider.' };
  }
}

export async function tailorResume(
  job: JobPosting,
  resume: ParsedResume,
  settings: LLMSettings,
  mode: EditMode,
): Promise<TailorResult> {
  // Local Ollama never uses an outer timeout — instant keyword fallback always finishes quickly.
  if (isLocalOllama(settings)) {
    return tailorResumeInternal(job, resume, settings, mode);
  }

  return withTimeout(
    tailorResumeInternal(job, resume, settings, mode),
    isCloudProvider(settings.provider) ? LLM_CLOUD_TAILOR_TIMEOUT_MS : LLM_TAILOR_TIMEOUT_MS,
    undefined,
    'tailor',
  );
}

function finishTailorResult(
  resume: ParsedResume,
  job: JobPosting,
  changes: ResumeChange[],
): TailorResult {
  const filtered = changes
    .filter((c) => !isNoOpChange(c) && !isKeywordDumpChange(c))
    .map((c) => ({ ...c, accepted: true }));

  const improved = augmentChangesToTargetScore(resume, job, filtered, 85);

  let result: TailorResult = { changes: improved, fullText: '' };
  result = finalizeTailorResult(resume.plainText, result);

  if (!result.fullText || result.fullText.length < 20) {
    result.fullText = buildFullTextFromChanges(resume.plainText, result.changes);
  }

  return result;
}

function isUsableRevision(original: string, revised: string | null): revised is string {
  if (!revised) return false;
  if (revised.trim().toLowerCase() === original.trim().toLowerCase()) return false;
  const probe: ResumeChange = {
    id: 'probe',
    section: '',
    original,
    revised,
    reason: '',
    accepted: true,
  };
  return !isNoOpChange(probe) && !isKeywordDumpChange(probe);
}

/** One Ollama call (~28s max). Tries multiple spans; returns [] on timeout or bad output. */
async function tryOneMicroEdit(
  job: JobPosting,
  resume: ParsedResume,
  settings: LLMSettings,
): Promise<ResumeChange[]> {
  const spans = extractEditableSpans(resume, 3);
  if (spans.length === 0) return [];

  const keywords = extractTopJobTerms(job, 8);
  const missing = getMissingKeywords(job, resume.plainText);

  for (const span of spans) {
    for (const jsonMode of [true, false]) {
      try {
        const raw = await chatOllamaMicro(
          settings,
          MICRO_SYSTEM_PROMPT,
          buildSingleSpanPrompt(job.title, keywords, span, missing),
          jsonMode,
        );
        const revised = parseMicroRevision(raw);
        if (!isUsableRevision(span.text, revised)) {
          continue;
        }
        return [
          {
            id: 'c1',
            section: span.section,
            original: span.text,
            revised,
            reason: 'Matched to job (local AI)',
            accepted: true,
          },
        ];
      } catch (err) {
        if (err instanceof OllamaOriginBlockedError) throw err;
      }
    }
  }

  return [];
}

/**
 * Local Ollama: precompute template edits, try one LLM phrase rewrite, else use templates.
 * Always completes in ~30s or less — never hits a 75s wall.
 */
async function tailorLocalOllama(
  job: JobPosting,
  resume: ParsedResume,
  settings: LLMSettings,
): Promise<TailorResult> {
  const fallback = resolveInstantEdits(resume, job);

  const conn = await testOllamaConnection(settings);
  if (!conn.ok) {
    if (fallback.length > 0) return finishTailorResult(resume, job, fallback);
    throw new Error(conn.message);
  }

  void warmOllamaModel(settings);

  let changes: ResumeChange[] = [];
  try {
    changes = await tryOneMicroEdit(job, resume, settings);
  } catch (err) {
    if (err instanceof OllamaOriginBlockedError) throw err;
  }

  if (changes.length === 0) {
    changes = fallback;
  }

  if (changes.length === 0) {
    throw new Error(
      'Could not tailor this resume. Re-upload your resume or add a longer job description.',
    );
  }

  return finishTailorResult(resume, job, changes);
}

async function tailorResumeInternal(
  job: JobPosting,
  resume: ParsedResume,
  settings: LLMSettings,
  _mode: EditMode,
): Promise<TailorResult> {
  if (isLocalOllama(settings)) {
    return tailorLocalOllama(job, resume, settings);
  }

  const profile = resolveSpeedProfile(settings);
  const limits = getProfileLimits(profile, settings.provider);
  const { job: trimmedJob, resumeText } = prepareTailorInputs(job, resume, profile, settings.provider);

  if (!resumeText.trim()) {
    throw new Error('Resume text is empty. Re-upload your resume and try again.');
  }

  const systemPrompt = buildSystemPrompt(profile);
  const userPrompt = buildTailorPrompt(trimmedJob, resumeText, profile);
  const jsonMode = usesJsonMode(settings);

  let raw = await chatLLM(settings, systemPrompt, userPrompt, { jsonMode });

  let result: TailorResult;
  try {
    result = parseTailorResponseWithRepair(raw);
  } catch {
    if (profile === 'fast' || isCloudProvider(settings.provider)) {
      throw new Error(
        isCloudProvider(settings.provider)
          ? 'AI returned invalid JSON. Retry or pick a different model in Settings.'
          : 'AI returned invalid JSON. Pick Qwen 2.5 3B or Gemma 2 2B in Settings, then retry.',
      );
    }
    raw = await chatLLM(
      settings,
      systemPrompt,
      `${userPrompt}\n\nInvalid JSON before. Return ONLY the JSON object, nothing else.`,
      { jsonMode: true },
    );
    result = parseTailorResponseWithRepair(raw);
  }

  result.changes = augmentChangesToTargetScore(
    resume,
    job,
    result.changes
      .filter((c) => !isNoOpChange(c) && !isKeywordDumpChange(c))
      .slice(0, limits.maxChanges)
      .map((c) => ({ ...c, accepted: true })),
    85,
  );

  result = finalizeTailorResult(resume.plainText, result);

  if (!result.fullText || result.fullText.length < 20) {
    result.fullText = buildFullTextFromChanges(resume.plainText, result.changes);
  }

  return result;
}
