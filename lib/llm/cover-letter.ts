import type { JobPosting, LLMSettings } from '../types';
import { chatLLM } from './chat';
import { isCloudProvider } from './cloud-providers';
import {
  TAILOR_WRITING_RULES,
  formatMissingKeywordsBlock,
  getMissingKeywords,
} from './tailor-guidance';
import {
  LLM_COVER_LETTER_TIMEOUT_MS,
  LLM_CLOUD_COVER_TIMEOUT_MS,
  withTimeout,
} from './timeout';

const COVER_LETTER_PATTERN =
  /cover\s*letter|motivation\s*letter|letter\s+of\s+interest|submit\s+(?:a\s+)?letter|include\s+(?:a\s+)?letter/i;

export function jobNeedsCoverLetter(description: string): boolean {
  return COVER_LETTER_PATTERN.test(description);
}

export async function generateCoverLetter(
  job: JobPosting,
  settings: LLMSettings,
  resumeTextForLetter: string,
): Promise<string> {
  const cloud = isCloudProvider(settings.provider);
  const jobExcerpt = job.description.slice(0, cloud ? 1200 : 2500);
  const resumeExcerpt = resumeTextForLetter.slice(0, cloud ? 1500 : 3500);
  const missing = getMissingKeywords(job, resumeTextForLetter, 12);

  const system = `Write a concise human cover letter in plain text. Natural tone, 3 short paragraphs max, no placeholders.
${TAILOR_WRITING_RULES}
Include at least one accomplishment in X–Y–Z format using facts from the resume only — never invent metrics.`;

  const user = `Role: ${job.title}${job.company ? ` at ${job.company}` : ''}
Job: ${jobExcerpt}
Resume: ${resumeExcerpt}
Missing keywords to weave with business context (what you built, how, and the result — not as a skill list): ${formatMissingKeywordsBlock(missing)}
Return only the letter body.`;

  const chat = chatLLM(settings, system, user, { jsonMode: false });

  // Local Ollama: no outer timeout — let the model finish; cloud keeps a generous cap.
  if (settings.provider === 'ollama') {
    const raw = await chat;
    return raw.trim();
  }

  const timeout = cloud ? LLM_CLOUD_COVER_TIMEOUT_MS : LLM_COVER_LETTER_TIMEOUT_MS;
  const raw = await withTimeout(chat, timeout, undefined, 'cover');
  return raw.trim();
}
