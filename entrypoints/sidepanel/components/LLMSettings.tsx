import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LLMProvider, LLMSettings, SpeedProfile } from '@/lib/types';
import { DEFAULT_LLM_SETTINGS } from '@/lib/types';
import {
  getLLMSettings,
  saveLLMSettings,
  setSetupComplete,
  getConnectionMode,
} from '@/lib/storage/settings';
import {
  MODEL_PRESETS,
  applyPresetToSettings,
  resolveSpeedProfile,
} from '@/lib/llm/models';
import {
  CLOUD_PROVIDER_CONFIGS,
  estimateTailorTokenBudget,
  getCloudProviderConfig,
  isCloudProvider,
} from '@/lib/llm/cloud-providers';
import {
  OLLAMA_DOWNLOAD_URL,
  LM_STUDIO_DOWNLOAD_URL,
  discoverBackends,
  listModelsForBackend,
  modelMatchesInstalled,
  type DiscoveredBackend,
} from '@/lib/llm/discovery';
import { testLLMConnection } from '@/lib/llm';
import { pullOllamaModel, OllamaOriginBlockedError } from '@/lib/llm/ollama';
import { getMacOllamaFixScript, getTerminalPullCommand } from '@/lib/llm/ollama-origins';

interface LLMSettingsPanelProps {
  onClose: () => void;
  isFirstRun?: boolean;
}

export function LLMSettingsPanel({ onClose, isFirstRun = false }: LLMSettingsPanelProps) {
  const [settings, setSettings] = useState<LLMSettings>(DEFAULT_LLM_SETTINGS);
  const [backends, setBackends] = useState<DiscoveredBackend[]>([]);
  const [selectedBackendIdx, setSelectedBackendIdx] = useState(0);
  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState<{ percent?: number; message: string } | null>(
    null,
  );
  const [selectedPresetId, setSelectedPresetId] = useState('qwen2.5-3b');
  const [ollamaPullBlocked, setOllamaPullBlocked] = useState(false);
  const [connectionMode, setConnectionMode] = useState<'local' | 'cloud'>('local');

  const activeProfile = useMemo(() => resolveSpeedProfile(settings), [settings]);
  const activeBackend = backends[selectedBackendIdx] ?? null;
  const selectedPreset = MODEL_PRESETS.find((p) => p.id === selectedPresetId);
  const cloudConfig = getCloudProviderConfig(settings.provider);
  const tokenBudget = estimateTailorTokenBudget(settings.provider);

  const scan = useCallback(async () => {
    setScanning(true);
    setTestResult(null);
    try {
      const found = await discoverBackends();
      setBackends(found);

      if (found.length > 0) {
        const preferOllama = found.findIndex((b) => b.provider === 'ollama');
        const idx = preferOllama >= 0 ? preferOllama : 0;
        setSelectedBackendIdx(idx);
        const backend = found[idx];
        setInstalledModels(backend.models);
        setOllamaPullBlocked(backend.provider === 'ollama' && backend.ollamaPullAllowed === false);
        if (connectionMode === 'local') {
          setSettings((prev) => ({
            ...prev,
            provider: backend.provider,
            baseUrl: backend.baseUrl,
            useManualEndpoint: false,
          }));
        }
        setTestResult({
          ok: true,
          message: `Found ${backend.label}. ${backend.models.length} model(s) installed.`,
        });
      } else {
        setTestResult({
          ok: false,
          message: 'No local AI found. Install Ollama below, then scan again.',
        });
      }
    } catch {
      setTestResult({ ok: false, message: 'Scan failed. Try again.' });
    } finally {
      setScanning(false);
    }
  }, [connectionMode]);

  useEffect(() => {
    void getLLMSettings().then((saved) => {
      setSettings(saved);
      setConnectionMode(getConnectionMode(saved));
      setShowAdvanced(saved.useManualEndpoint);
      const match = MODEL_PRESETS.find((p) => p.model === saved.model);
      if (match) setSelectedPresetId(match.id);
    });
    void scan();
  }, [scan]);

  const update = <K extends keyof LLMSettings>(key: K, value: LLMSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const selectBackend = (idx: number) => {
    setSelectedBackendIdx(idx);
    const backend = backends[idx];
    if (!backend) return;
    setInstalledModels(backend.models);
    setOllamaPullBlocked(backend.provider === 'ollama' && backend.ollamaPullAllowed === false);
    setSettings((prev) => ({
      ...prev,
      provider: backend.provider,
      baseUrl: backend.baseUrl,
      useManualEndpoint: false,
    }));
  };

  const selectCloudProvider = (provider: LLMProvider) => {
    const config = getCloudProviderConfig(provider);
    if (!config) return;
    setSettings((prev) => ({
      ...prev,
      provider,
      baseUrl: config.baseUrl,
      model: config.defaultModel,
      maxTokens: 400,
      useManualEndpoint: false,
    }));
  };

  const switchConnectionMode = (mode: 'local' | 'cloud') => {
    setConnectionMode(mode);
    setTestResult(null);
    if (mode === 'cloud') {
      const config = CLOUD_PROVIDER_CONFIGS[0];
      setSettings((prev) => ({
        ...prev,
        provider: config.provider,
        baseUrl: config.baseUrl,
        model: config.defaultModel,
        maxTokens: 400,
      }));
    } else {
      setSettings((prev) => ({
        ...prev,
        provider: 'ollama',
        baseUrl: activeBackend?.baseUrl ?? 'http://127.0.0.1:11434',
        model: selectedPreset?.model ?? 'qwen2.5:3b',
      }));
    }
  };

  const selectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = MODEL_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setSettings((prev) => applyPresetToSettings(preset, prev));
    }
  };

  const refreshInstalledModels = async (baseUrl: string, provider: LLMProvider) => {
    const models = await listModelsForBackend(provider, baseUrl);
    setInstalledModels(models);
    return models;
  };

  const copyText = async (text: string, okMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setTestResult({ ok: true, message: okMessage });
    } catch {
      setTestResult({ ok: false, message: 'Could not copy to clipboard.' });
    }
  };

  const downloadPreset = async () => {
    if (!selectedPreset || settings.provider !== 'ollama') return;
    if (!activeBackend && !settings.baseUrl) {
      setTestResult({ ok: false, message: 'Scan for Ollama first.' });
      return;
    }

    const baseUrl = settings.baseUrl;
    const model = selectedPreset.ollamaPull;

    if (modelMatchesInstalled(installedModels, selectedPreset.model)) {
      setTestResult({ ok: true, message: `${model} is already installed.` });
      update('model', selectedPreset.model);
      return;
    }

    setPulling(true);
    setPullProgress({ message: 'Starting download…' });

    try {
      await pullOllamaModel(baseUrl, model, (progress) => {
        setPullProgress({ percent: progress.percent, message: progress.message ?? 'Downloading…' });
      });
      setOllamaPullBlocked(false);
      setPullProgress({ percent: 100, message: 'Download complete!' });
      setTestResult({ ok: true, message: `${model} ready to use.` });
      update('model', selectedPreset.model);
      await refreshInstalledModels(baseUrl, 'ollama');
    } catch (err) {
      setPullProgress(null);
      const blocked = err instanceof OllamaOriginBlockedError;
      setOllamaPullBlocked(blocked);
      setTestResult({
        ok: false,
        message: blocked
          ? 'Ollama blocked in-extension downloads (403). Use the fix below or Terminal.'
          : err instanceof Error
            ? err.message
            : 'Download failed.',
      });
    } finally {
      setPulling(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testLLMConnection(settings);
      setTestResult(result);
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Connection test failed.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (connectionMode === 'cloud' && !settings.apiKey.trim()) {
      setTestResult({ ok: false, message: 'Add your API key before saving.' });
      return;
    }
    await saveLLMSettings(settings);
    await setSetupComplete(true);
    onClose();
  };

  const presetInstalled =
    selectedPreset && modelMatchesInstalled(installedModels, selectedPreset.model);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(26, 24, 22, 0.45)' }}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-[14px] p-5"
        style={{ background: 'var(--surface-raised)', boxShadow: 'var(--shadow)' }}
      >
        <h2 className="font-display mb-1 text-xl" style={{ color: 'var(--ink)' }}>
          {isFirstRun ? 'Set up AI' : 'AI settings'}
        </h2>
        <p className="mb-3 text-xs leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
          Use a <strong>cloud account</strong> (fast, ~{tokenBudget.input + tokenBudget.output} tokens per tailor)
          or <strong>local Ollama</strong> (free, private, slower on weak PCs).
        </p>

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => switchConnectionMode('cloud')}
            className="flex-1 rounded-lg py-2 text-xs font-medium"
            style={{
              background: connectionMode === 'cloud' ? 'var(--accent)' : 'var(--surface)',
              color: connectionMode === 'cloud' ? '#fff' : 'var(--ink-secondary)',
              border: connectionMode === 'cloud' ? 'none' : '1px solid var(--border)',
            }}
          >
            Cloud account
          </button>
          <button
            type="button"
            onClick={() => switchConnectionMode('local')}
            className="flex-1 rounded-lg py-2 text-xs font-medium"
            style={{
              background: connectionMode === 'local' ? 'var(--accent)' : 'var(--surface)',
              color: connectionMode === 'local' ? '#fff' : 'var(--ink-secondary)',
              border: connectionMode === 'local' ? 'none' : '1px solid var(--border)',
            }}
          >
            Local (Ollama)
          </button>
        </div>

        {connectionMode === 'cloud' && (
          <section className="mb-4 rounded-lg border border-slate-200 p-3 dark:border-slate-600">
            <h3 className="mb-2 text-sm font-medium">Your cloud API</h3>
            <p className="mb-3 text-xs text-slate-500">
              API key stays in your browser only. We use small prompts to save tokens (~
              {tokenBudget.input} in, ~{tokenBudget.output} out per tailor).
            </p>

            <label className="mb-2 block text-sm">
              <span className="mb-1 block text-slate-500">Provider</span>
              <select
                value={isCloudProvider(settings.provider) ? settings.provider : 'openai-compatible'}
                onChange={(e) => {
                  const p = e.target.value as LLMProvider;
                  if (p === 'openai-compatible') {
                    setSettings((prev) => ({
                      ...prev,
                      provider: 'openai-compatible',
                      baseUrl: prev.baseUrl || 'https://api.openai.com/v1',
                      model: prev.model || 'gpt-4o-mini',
                    }));
                  } else {
                    selectCloudProvider(p);
                  }
                }}
                className="w-full rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
              >
                {CLOUD_PROVIDER_CONFIGS.map((c) => (
                  <option key={c.provider} value={c.provider}>
                    {c.label}
                  </option>
                ))}
                <option value="openai-compatible">Other (OpenAI-compatible URL)</option>
              </select>
            </label>

            <label className="mb-2 block text-sm">
              <span className="mb-1 block text-slate-500">API key</span>
              <input
                type="password"
                value={settings.apiKey}
                onChange={(e) => update('apiKey', e.target.value)}
                placeholder="sk-… or paste your key"
                autoComplete="off"
                className="w-full rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
              />
              {cloudConfig && (
                <a
                  href={cloudConfig.apiKeyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs text-blue-600 underline"
                >
                  Get an API key from {cloudConfig.label}
                </a>
              )}
            </label>

            {isCloudProvider(settings.provider) && cloudConfig && (
              <label className="mb-2 block text-sm">
                <span className="mb-1 block text-slate-500">Model (cheapest first)</span>
                <select
                  value={settings.model}
                  onChange={(e) => update('model', e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                >
                  {cloudConfig.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {settings.provider === 'openai-compatible' && (
              <>
                <label className="mb-2 block text-sm">
                  <span className="mb-1 block text-slate-500">API base URL</span>
                  <input
                    type="text"
                    value={settings.baseUrl}
                    onChange={(e) => update('baseUrl', e.target.value)}
                    placeholder="https://api.example.com/v1"
                    className="w-full rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                  />
                </label>
                <label className="mb-2 block text-sm">
                  <span className="mb-1 block text-slate-500">Model name</span>
                  <input
                    type="text"
                    value={settings.model}
                    onChange={(e) => update('model', e.target.value)}
                    placeholder="model-id"
                    className="w-full rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                  />
                </label>
              </>
            )}
          </section>
        )}

        {connectionMode === 'local' && (
        <>
        <section className="mb-4 rounded-lg border border-slate-200 p-3 dark:border-slate-600">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium">1. Local AI provider</h3>
            <button
              type="button"
              onClick={() => void scan()}
              disabled={scanning}
              className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600"
            >
              {scanning ? 'Scanning…' : 'Scan again'}
            </button>
          </div>

          {backends.length > 0 ? (
            <div className="space-y-2">
              {backends.map((b, i) => (
                <label
                  key={`${b.provider}-${b.baseUrl}`}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm ${
                    selectedBackendIdx === i
                      ? 'border-blue-500 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/30'
                      : 'border-slate-200 dark:border-slate-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="backend"
                    checked={selectedBackendIdx === i}
                    onChange={() => selectBackend(i)}
                  />
                  <span>
                    <strong>{b.provider === 'ollama' ? 'Ollama' : 'LM Studio'}</strong>
                    <span className="block text-xs text-slate-500">
                      {b.models.length} model{b.models.length !== 1 ? 's' : ''} installed
                    </span>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-slate-600 dark:text-slate-300">
                No local AI detected on this computer.
              </p>
              <a
                href={OLLAMA_DOWNLOAD_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-black"
              >
                Download Ollama (recommended)
              </a>
              <a
                href={LM_STUDIO_DOWNLOAD_URL}
                target="_blank"
                rel="noreferrer"
                className="ml-2 inline-flex rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 dark:border-slate-600"
              >
                Or LM Studio
              </a>
              <p className="text-xs text-slate-500">
                After installing, open it once, then click <strong>Scan again</strong>.
              </p>
            </div>
          )}
        </section>

        {/* Step 2: Model */}
        <section className="mb-4 rounded-lg border border-slate-200 p-3 dark:border-slate-600">
          <h3 className="mb-2 text-sm font-medium">2. Choose a model</h3>

          <div className="mb-3 space-y-2">
            {MODEL_PRESETS.map((preset) => (
              <label
                key={preset.id}
                className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm ${
                  selectedPresetId === preset.id
                    ? 'border-blue-500 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/30'
                    : 'border-slate-200 dark:border-slate-600'
                }`}
              >
                <input
                  type="radio"
                  name="preset"
                  className="mt-1"
                  checked={selectedPresetId === preset.id}
                  onChange={() => selectPreset(preset.id)}
                />
                <span className="flex-1">
                  <span className="font-medium">{preset.label}</span>
                  {modelMatchesInstalled(installedModels, preset.model) && (
                    <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-800 dark:bg-green-900/50 dark:text-green-200">
                      Installed
                    </span>
                  )}
                  <span className="mt-0.5 block text-xs text-slate-500">{preset.why}</span>
                </span>
              </label>
            ))}
          </div>

          {settings.provider === 'ollama' && activeBackend && selectedPreset && (
            <button
              type="button"
              onClick={() => void downloadPreset()}
              disabled={pulling || presetInstalled || ollamaPullBlocked}
              className="mb-2 w-full rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pulling
                ? 'Downloading…'
                : presetInstalled
                  ? 'Model already installed'
                  : ollamaPullBlocked
                    ? 'In-extension download blocked by Ollama'
                    : `Download ${selectedPreset.ollamaPull}`}
            </button>
          )}

          {settings.provider === 'ollama' && ollamaPullBlocked && selectedPreset && (
            <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
              <p className="mb-2 font-medium">Ollama blocked extension downloads (403)</p>
              <p className="mb-2 leading-relaxed">
                Ollama must allow browser extensions. Run the fix in Terminal, restart Ollama,
                then click <strong>Scan again</strong>.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void copyText(
                      getMacOllamaFixScript(),
                      'Fix copied — paste in Terminal, restart Ollama, then Scan again.',
                    )
                  }
                  className="rounded bg-amber-800 px-2 py-1 text-[11px] font-medium text-white hover:bg-amber-900"
                >
                  Copy Ollama fix (macOS)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void copyText(
                      getTerminalPullCommand(selectedPreset.ollamaPull),
                      `Copied: ollama pull ${selectedPreset.ollamaPull} — run in Terminal.`,
                    )
                  }
                  className="rounded border border-amber-700 px-2 py-1 text-[11px] font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50"
                >
                  Copy Terminal pull command
                </button>
              </div>
            </div>
          )}

          {pullProgress && (
            <div className="mb-2">
              <div className="mb-1 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="h-full bg-blue-600 transition-all"
                  style={{ width: `${pullProgress.percent ?? 10}%` }}
                />
              </div>
              <p className="text-xs text-slate-500">{pullProgress.message}</p>
            </div>
          )}

          {installedModels.length > 0 && (
            <label className="mt-2 block text-sm">
              <span className="mb-1 block text-slate-500">Or pick an installed model</span>
              <select
                value={settings.model}
                onChange={(e) => {
                  update('model', e.target.value);
                  setSelectedPresetId('');
                }}
                className="w-full rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
              >
                {installedModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>

        <section className="mb-4 rounded-lg border border-slate-200 p-3 dark:border-slate-600">
          <h3 className="mb-2 text-sm font-medium">3. Speed profile</h3>
          <select
            value={settings.speedProfile}
            onChange={(e) => update('speedProfile', e.target.value as SpeedProfile)}
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="auto">Auto (Fast — best for slower PCs)</option>
            <option value="fast">Fast — smallest prompts, ~30–90s</option>
            <option value="quality">Quality — slower, needs a strong PC</option>
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Active: <strong>{activeProfile}</strong>
            {activeProfile === 'fast'
              ? ' · uses Gemma 2 2B or Qwen 2.5 3B for best speed'
              : ''}
          </p>
        </section>
        </>
        )}

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="mb-2 text-xs text-slate-500 underline"
        >
          {showAdvanced ? 'Hide' : 'Show'} advanced options (manual URL)
        </button>

        {showAdvanced && (
          <div className="mb-4 space-y-2 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-600">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.useManualEndpoint}
                onChange={(e) => update('useManualEndpoint', e.target.checked)}
              />
              Use custom server URL
            </label>
            {settings.useManualEndpoint && (
              <>
                <select
                  value={settings.provider}
                  onChange={(e) => update('provider', e.target.value as LLMProvider)}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                >
                  <option value="ollama">Ollama</option>
                  <option value="openai-compatible">OpenAI-compatible</option>
                </select>
                <input
                  type="text"
                  value={settings.apiKey}
                  onChange={(e) => update('apiKey', e.target.value)}
                  placeholder="API key (optional for local)"
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                />
                <input
                  type="text"
                  value={settings.baseUrl}
                  onChange={(e) => update('baseUrl', e.target.value)}
                  placeholder="http://127.0.0.1:11434"
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                />
              </>
            )}
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">
                <span className="mb-1 block text-xs text-slate-500">Temperature</span>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={settings.temperature}
                  onChange={(e) => update('temperature', parseFloat(e.target.value))}
                  className="w-full rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-slate-500">Max tokens</span>
                <input
                  type="number"
                  min={512}
                  max={16384}
                  step={256}
                  value={settings.maxTokens}
                  onChange={(e) => update('maxTokens', parseInt(e.target.value, 10))}
                  className="w-full rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                />
              </label>
            </div>
          </div>
        )}

        {testResult && (
          <p className={`mb-3 text-sm ${testResult.ok ? 'text-green-600' : 'text-red-600'}`}>
            {testResult.message}
          </p>
        )}

        <div className="flex justify-end gap-2">
          {!isFirstRun && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={testing || pulling}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600"
          >
            {testing ? 'Testing…' : 'Test'}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={pulling}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isFirstRun ? 'Save & start' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
