export type ResumeFormat = 'docx' | 'pdf' | 'txt' | 'rtf';

export type LLMProvider = 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'openai-compatible';

/** @deprecated Use LLMProvider */
export type LLMBackend = 'ollama' | 'openai-compatible';

export type ConnectionMode = 'local' | 'cloud';

export interface JobPosting {
  title: string;
  company: string;
  location: string;
  description: string;
  source: string;
  url: string;
}

export interface ResumeSection {
  name: string;
  content: string;
}

export interface PdfTextRun {
  pageIndex: number;
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

export interface ParsedResume {
  format: ResumeFormat;
  fileName: string;
  plainText: string;
  sections: ResumeSection[];
  /** Original upload bytes — used to preserve layout on export. */
  sourceBytes: ArrayBuffer;
  /** PDF text positions for in-place overlays (pdf only). */
  pdfTextRuns?: PdfTextRun[];
}

export interface ResumeChange {
  id: string;
  section: string;
  original: string;
  revised: string;
  reason: string;
  accepted: boolean;
}

export interface TailorResult {
  changes: ResumeChange[];
  fullText: string;
}

export type SpeedProfile = 'auto' | 'fast' | 'quality';

export interface LLMSettings {
  provider: LLMProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  speedProfile: SpeedProfile;
  useManualEndpoint: boolean;
  /** @deprecated migrated to provider */
  backend?: LLMBackend;
  /** @deprecated */
  cloudEnabled?: boolean;
}

export type EditMode = 'quick' | 'review';

export interface AppState {
  job: JobPosting | null;
  resume: ParsedResume | null;
  tailorResult: TailorResult | null;
  changes: ResumeChange[];
  editMode: EditMode;
  isTailoring: boolean;
  error: string | null;
}

export type MessageType =
  | { type: 'CAPTURE_JOB' }
  | { type: 'JOB_CAPTURED'; job: JobPosting };

export const DEFAULT_LLM_SETTINGS: LLMSettings = {
  provider: 'ollama',
  apiKey: '',
  baseUrl: 'http://127.0.0.1:11434',
  model: 'qwen2.5:3b',
  temperature: 0.1,
  maxTokens: 400,
  speedProfile: 'fast',
  useManualEndpoint: false,
};

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export const SUPPORTED_EXTENSIONS = ['.docx', '.pdf', '.txt', '.rtf'] as const;
