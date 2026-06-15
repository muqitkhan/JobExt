import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JobPosting, ParsedResume, ResumeChange } from '@/lib/types';
import { scoreResumeATS, type ATSScoreResult } from '@/lib/ats';
import { captureJobFromActiveTab } from '@/lib/scrapers';
import { getLLMSettings, isSetupComplete } from '@/lib/storage/settings';
import { isCloudProvider } from '@/lib/llm/cloud-providers';
import { getFinalText } from '@/lib/diff/highlight';
import { buildFullTextFromChanges } from '@/lib/llm/prompts';
import { tailorResume, warmOllamaModel } from '@/lib/llm';
import { generateCoverLetter, jobNeedsCoverLetter } from '@/lib/llm/cover-letter';
import { exportResume } from '@/lib/exporters';
import { downloadBuffer, downloadText } from '@/lib/exporters/download';
import { OllamaOriginBlockedError } from '@/lib/llm/ollama';
import { LLMTimeoutError } from '@/lib/llm/timeout';
import { ResumeUpload } from './components/ResumeUpload';
import { ResumePanel } from './components/ResumePanel';
import { JobDescription } from './components/JobDescription';
import { ChangeReview } from './components/ChangeReview';
import { ATSScorePanel } from './components/ATSScorePanel';
import { LLMSettingsPanel } from './components/LLMSettings';
import { CoverLetterPanel } from './components/CoverLetterPanel';
import { DismissibleAlert } from './components/DismissibleAlert';

export default function App() {
  const [job, setJob] = useState<JobPosting | null>(null);
  const [resume, setResume] = useState<ParsedResume | null>(null);
  const [changes, setChanges] = useState<ResumeChange[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isTailoring, setIsTailoring] = useState(false);
  const [tailorStatus, setTailorStatus] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isFirstRunSetup, setIsFirstRunSetup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasTailored, setHasTailored] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [includeCoverLetter, setIncludeCoverLetter] = useState(false);
  const [coverLetter, setCoverLetter] = useState<string | null>(null);

  const hasResume = Boolean(resume?.plainText?.trim());
  const hasJob = Boolean(job?.description?.trim());
  const canScore = hasResume && hasJob;
  const coverLetterRequired = Boolean(job?.description && jobNeedsCoverLetter(job.description));

  useEffect(() => {
    if (job?.description) {
      setIncludeCoverLetter(jobNeedsCoverLetter(job.description));
    }
  }, [job?.description]);

  const baselineScore = useMemo<ATSScoreResult | null>(() => {
    if (!canScore || !resume || !job) return null;
    return scoreResumeATS(resume.plainText, job);
  }, [canScore, resume, job]);

  const tailoredScore = useMemo<ATSScoreResult | null>(() => {
    if (!canScore || !hasTailored || !job || !resume) return null;
    const tailoredText = buildFullTextFromChanges(resume.plainText, changes);
    return scoreResumeATS(tailoredText, job);
  }, [canScore, hasTailored, job, resume, changes]);

  useEffect(() => {
    void isSetupComplete().then((done) => {
      if (!done) {
        setShowSettings(true);
        setIsFirstRunSetup(true);
      }
    });
    void getLLMSettings().then((settings) => {
      if (settings.provider === 'ollama') {
        void warmOllamaModel(settings);
      }
    });
  }, []);

  const handleCapture = useCallback(async () => {
    setIsCapturing(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await captureJobFromActiveTab();
      if (result.job) {
        setJob(result.job);
        setSuccessMessage(
          result.job.description.length > 80
            ? `Captured “${result.job.title || 'job'}” from ${result.job.source}.`
            : 'Captured job details — add more description text if needed.',
        );
      } else {
        setError(result.error ?? 'Could not capture job from this page.');
      }
    } catch {
      setError('Could not capture job. Reload the job page and try again.');
    } finally {
      setIsCapturing(false);
    }
  }, []);

  const handleTailor = useCallback(async () => {
    if (!job?.description?.trim()) {
      setError('Add a job description before tailoring.');
      return;
    }
    if (!resume) {
      setError('Upload a resume first.');
      return;
    }

    setIsTailoring(true);
    setError(null);
    setSuccessMessage(null);
    setTailorStatus('Connecting to AI…');
    setCoverLetter(null);

    try {
      const settings = await getLLMSettings();
      setTailorStatus(
        isCloudProvider(settings.provider)
          ? 'Tailoring with cloud AI — usually 5–20s…'
          : 'Local AI (18s max) — then keyword match if needed…',
      );

      const result = await tailorResume(job, resume, settings, 'review');
      setChanges(result.changes);
      setHasTailored(true);

      const letterResumeText =
        result.fullText && result.fullText.length > 50
          ? result.fullText
          : getFinalText(resume.plainText, result.changes);

      if (includeCoverLetter || coverLetterRequired) {
        setTailorStatus('Writing cover letter…');
        const letter = await generateCoverLetter(job, settings, letterResumeText);
        setCoverLetter(letter);
      }

      setSuccessMessage(
        includeCoverLetter || coverLetterRequired
          ? 'Resume tailored and cover letter ready.'
          : 'Resume tailored — review edits below, then download.',
      );
    } catch (err) {
      if (err instanceof OllamaOriginBlockedError) {
        setError(err.message);
      } else if (err instanceof LLMTimeoutError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Tailoring failed.');
      }
    } finally {
      setIsTailoring(false);
      setTailorStatus(null);
    }
  }, [job, resume, includeCoverLetter, coverLetterRequired]);

  const handleDownload = useCallback(async () => {
    if (!resume) return;
    setIsExporting(true);
    setError(null);

    try {
      const accepted = changes.filter((c) => c.accepted && c.original.trim());
      const { buffer, fileName } = await exportResume(resume, accepted);
      await downloadBuffer(buffer, fileName);
      setSuccessMessage(`Downloaded ${fileName}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setIsExporting(false);
    }
  }, [resume, changes]);

  const handleDownloadCoverLetter = useCallback(() => {
    if (!coverLetter?.trim() || !resume) return;
    const base = resume.fileName.replace(/\.[^.]+$/, '');
    const date = new Date().toISOString().slice(0, 10);
    downloadText(`${base}_CoverLetter_${date}.txt`, coverLetter);
  }, [coverLetter, resume]);

  const toggleChange = (id: string, accepted: boolean) => {
    setChanges((prev) => prev.map((c) => (c.id === id ? { ...c, accepted } : c)));
  };

  const readyToTailor = Boolean(resume && job?.description?.trim());

  return (
    <div className="app-shell">
      <header
        className="z-10 shrink-0 border-b px-4 py-2.5"
        style={{
          borderColor: 'var(--border)',
          background: 'color-mix(in srgb, var(--surface-raised) 90%, transparent)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/icon/48.png"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 rounded-lg shadow-sm"
            />
            <div>
              <h1 className="font-display text-lg leading-none" style={{ color: 'var(--ink)' }}>
                JobExt
              </h1>
              <p className="text-[10px]" style={{ color: 'var(--ink-tertiary)' }}>
                Resume · match · export
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsFirstRunSetup(false);
              setShowSettings(true);
            }}
            className="btn-secondary !p-2"
            title="AI settings"
            aria-label="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </button>
        </div>
      </header>

      <main className="app-main space-y-3 p-3 pb-6">
        {error && (
          <DismissibleAlert message={error} variant="error" onDismiss={() => setError(null)} />
        )}

        {successMessage && (
          <DismissibleAlert
            message={successMessage}
            variant="success"
            onDismiss={() => setSuccessMessage(null)}
          />
        )}

        {tailorStatus && (
          <div
            className="animate-in flex items-center gap-2 rounded-[10px] px-3 py-2.5 text-sm"
            style={{ background: 'var(--surface)', color: 'var(--ink-secondary)', border: '1px solid var(--border)' }}
          >
            <span className="spinner" />
            {tailorStatus}
          </div>
        )}

        <ATSScorePanel
          before={baselineScore}
          after={tailoredScore}
          hasTailored={hasTailored}
          hasResume={hasResume}
          hasJob={hasJob}
          isScoring={isCapturing && hasResume}
        />

        {!resume ? (
          <ResumeUpload
            onParsed={(parsed) => {
              setResume(parsed);
              setChanges([]);
              setHasTailored(false);
              setCoverLetter(null);
              setError(null);
              setSuccessMessage(
                `Resume loaded — ${parsed.plainText.split(/\s+/).filter(Boolean).length.toLocaleString()} words.`,
              );
              if (!job?.description?.trim()) {
                void handleCapture();
              }
            }}
            onError={(message) => {
              setError(message);
              setSuccessMessage(null);
            }}
          />
        ) : (
          <ResumePanel
            resume={resume}
            changes={changes}
            hasTailored={hasTailored}
            isTailoring={isTailoring}
            onReplace={(parsed) => {
              setResume(parsed);
              setChanges([]);
              setHasTailored(false);
              setCoverLetter(null);
              setError(null);
              setSuccessMessage(
                `Resume replaced — ${parsed.plainText.split(/\s+/).filter(Boolean).length.toLocaleString()} words.`,
              );
            }}
            onError={(message) => {
              setError(message);
              setSuccessMessage(null);
            }}
          />
        )}

        <JobDescription
          job={job}
          onJobChange={(next) => {
            setJob(next);
            if (next.description?.trim()) {
              setSuccessMessage(null);
            }
          }}
          onCapture={() => void handleCapture()}
          isCapturing={isCapturing}
          captureSucceeded={Boolean(job?.description?.trim() && job.source !== 'manual')}
        />

        {resume && (
          <section className="card animate-in p-4">
            <h2 className="font-display mb-2 text-base" style={{ color: 'var(--ink)' }}>
              {hasTailored ? 'Re-tailor' : 'Tailor to role'}
            </h2>
            <label className="mb-3 flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={includeCoverLetter || coverLetterRequired}
                disabled={isTailoring || coverLetterRequired}
                onChange={(e) => setIncludeCoverLetter(e.target.checked)}
              />
              <span style={{ color: 'var(--ink-secondary)' }}>
                {coverLetterRequired
                  ? 'Cover letter required for this job'
                  : 'Also write a cover letter'}
              </span>
            </label>
            <button
              type="button"
              onClick={() => void handleTailor()}
              disabled={isTailoring || !readyToTailor}
              className="btn-primary flex w-full items-center justify-center gap-2 !py-2.5"
            >
              {isTailoring ? <span className="spinner" /> : null}
              {isTailoring ? 'Working…' : hasTailored ? 'Re-tailor resume' : 'Tailor resume'}
            </button>
          </section>
        )}

        {resume && hasTailored && (
          <>
            {changes.length > 0 && (
              <ChangeReview changes={changes} onToggle={toggleChange} />
            )}

            <section className="card animate-in p-4">
              <button
                type="button"
                onClick={() => void handleDownload()}
                disabled={isExporting || isTailoring}
                className="btn-primary flex w-full items-center justify-center gap-2 !py-2.5"
              >
                {isExporting ? <span className="spinner" /> : null}
                {isExporting ? 'Preparing file…' : `Download ${resume.format.toUpperCase()}`}
              </button>
              <p className="mt-2 text-center text-[10px]" style={{ color: 'var(--ink-tertiary)' }}>
                Same format as your upload · edits you kept are included
              </p>
            </section>

            {coverLetter && (
              <CoverLetterPanel
                coverLetter={coverLetter}
                onChange={setCoverLetter}
                onDownload={handleDownloadCoverLetter}
                isRequired={coverLetterRequired}
              />
            )}
          </>
        )}
      </main>

      {showSettings && (
        <LLMSettingsPanel
          onClose={() => {
            setShowSettings(false);
            setIsFirstRunSetup(false);
          }}
          isFirstRun={isFirstRunSetup}
        />
      )}
    </div>
  );
}
