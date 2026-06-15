# JobExt

**Tailor your resume to any job description using a local LLM — private, unlimited, and open source.**

JobExt is a cross-browser extension (Chrome, Firefox, Edge) that reads a job listing, parses your resume, and uses a local LLM (Ollama or any OpenAI-compatible API) to align your resume with the role. Review highlighted changes, accept or reject edits, and download the updated file in the same format with today's date in the filename.

> **Privacy:** Your resume and job data never leave your device except to your configured local LLM endpoint. JobExt has no backend and no analytics.

## Features

- **Side panel UI** — work alongside job listing pages
- **Job capture** — auto-scrape LinkedIn, Indeed, Glassdoor, ZipRecruiter, or generic career pages; manual paste fallback
- **Resume upload** — DOCX, PDF, TXT, RTF (max 10 MB)
- **Local LLM** — Ollama or OpenAI-compatible APIs (LM Studio, etc.)
- **Highlighted diffs** — see exactly what changed
- **ATS match score** — honest, rule-based scoring before and after tailoring (same rubric every time)
- **Review mode** — accept/reject each change, or quick-apply all
- **Same-format export** — `Resume.docx` → `Resume_2026-06-15.docx`

## Supported formats

| Format | Parse | Export | Notes |
|--------|-------|--------|-------|
| DOCX   | ✅    | ✅     | Best results |
| PDF    | ✅    | ✅     | Layout may simplify on export |
| TXT    | ✅    | ✅     | |
| RTF    | ✅    | ✅     | Basic RTF stripping |

## Prerequisites

1. **Node.js 20+** (for development)
2. **Ollama** (recommended) — [ollama.com](https://ollama.com)

```bash
# Best 2–4B model for speed (recommended default):
ollama pull qwen2.5:3b

# Higher quality when speed is less critical:
ollama pull llama3.1:8b
```

### Small models (2–4B): best pick and why

JobExt targets **under 2 minutes** start-to-finish on modest hardware when using **Fast** speed profile (enabled automatically for 2–4B models).

| Model | Ollama pull | Verdict |
|-------|-------------|---------|
| **Qwen 2.5 3B** | `qwen2.5:3b` | **Best pick.** Strongest instruction-following in the 3B class, reliable JSON, good keyword alignment. Typical tailor run: **45–90s**. |
| Phi-3.5 Mini 3.8B | `phi3.5` | Solid alternative. Slightly slower than Qwen 3B but good structured edits. **60–100s**. |
| Llama 3.2 3B | `llama3.2:3b` | Stable and widely supported. JSON can be less consistent — keep Fast profile on. **50–90s**. |
| Gemma 2 2B | `gemma2:2b` | Fastest (**30–60s**) but weakest quality; fewer useful edits. Use only if speed matters more than polish. |

**Why Qwen 2.5 3B wins:** Resume tailoring needs short, faithful rewrites plus valid JSON. Qwen 2.5 3B scores highest among 2–4B models on instruction benchmarks and produces compact outputs — critical when you want sub-2-minute runs without a GPU monster.

**Speed tips (under 2 min):**
- Select **Qwen 2.5 3B — best 2–4B pick** preset in ⚙ settings (or set Speed profile → **Fast**)
- Use **Quick mode** (apply all changes) instead of Review for fastest flow
- Upload **DOCX or TXT** (faster parse than heavy PDFs)
- Close other GPU-heavy apps; keep Ollama on default Q4 quantization
- JobExt fast mode trims long job posts, caps output to 8 high-impact edits, and skips regenerating the full resume in the LLM (built locally instead)

**Recommended hardware:** 2–4B models run well on **8 GB RAM** (CPU) or any modest GPU. 8B models need **16 GB RAM** and take longer.

**Alternative:** [LM Studio](https://lmstudio.ai) or any OpenAI-compatible local server.

## Install from release (recommended)

**One click — no Developer mode, no folder picking.**

```bash
npm run release   # build installers
```

| Platform | File | What happens |
|----------|------|----------------|
| macOS Intel | `release/JobExt-*-macos-intel.dmg` | Open **Install JobExt.app** → browser opens with extension loaded |
| macOS Apple Silicon | `release/JobExt-*-macos-apple-silicon.dmg` | Same |
| Windows | `release/JobExt-*-windows.zip` | Run **Install JobExt.bat** → Desktop shortcut + browser opens |

**After install:** use the **JobExt** app/shortcut to open your browser (not Chrome directly) so the extension loads every time. Complete AI setup in the side panel.

**First macOS launch:** if Gatekeeper warns about an unidentified developer, Control+click → **Open** once. For zero warnings, publish to the Chrome Web Store or [notarize with Apple](docs/DISTRIBUTION.md).

See [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md) for store publishing and notarization.

## Install from source (developers)

```bash
git clone https://github.com/YOUR_USERNAME/JobExt.git
cd JobExt
npm install
npm run build          # Chrome / Edge
npm run build:firefox  # Firefox
```

### Load in Chrome / Edge

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `.output/chrome-mv3` (or `chrome-mv3-dev` when running `npm run dev`)

### Load in Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select any file inside `.output/firefox-mv3`

## Usage

1. Open a job listing page
2. Click the JobExt icon to open the **side panel**
3. Click **Capture Job** or paste the description manually
4. Upload your resume
5. Choose **Quick** or **Review** mode
6. Click **Tailor Resume**
7. Review highlighted changes (accept/reject in Review mode)
8. Click **Download tailored resume**

### ATS scoring

JobExt scores your resume against the job using a **deterministic rubric** — not AI guesses:

| Factor | Weight | What it measures |
|--------|--------|------------------|
| Keyword match | 35% | Weighted terms from the job description found in your resume |
| Skills alignment | 25% | Technical skills and tools mentioned in the listing |
| Title relevance | 15% | Overlap between job title and resume language |
| Experience fit | 15% | Experience section presence and years signals |
| Parse & structure | 10% | Standard sections, length, contact parseability |

You see a **before** score on upload and an **after** score once tailored — same standards both times. Missing keywords and warnings are listed explicitly.

### LLM settings

Open **⚙ Local AI setup** in the side panel — no URLs to type:

1. **Scan** — JobExt auto-detects Ollama or LM Studio on your computer
2. **Pick a model** — choose a recommended preset (Qwen 2.5 3B is the default)
3. **Download** — one-click model download via Ollama (progress bar in the extension)
4. **Save** — you're ready to tailor resumes

If nothing is detected, use the **Download Ollama** button in setup, install it, then **Scan again**.

Advanced users can expand **manual URL** options for custom servers.

## Development

```bash
npm run dev          # Chrome with HMR
npm run dev:firefox
npm test
npm run lint
npm run zip          # Package for Chrome Web Store
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Architecture

```
Job page → content script (scrape) → side panel UI
Side panel → background worker → local LLM (Ollama / OpenAI-compatible)
Resume file → parser → diff view → exporter → download
```

## Known limitations

1. PDF export recreates layout; designer PDFs may look different
2. DOCX complex formatting (columns, text boxes) may simplify
3. Job scrapers break when sites redesign — manual paste always works
4. LLM quality depends on your local model

## Roadmap

- [ ] Optional cloud LLM providers (OpenAI, Anthropic)
- [ ] Improved PDF layout preservation
- [ ] More job board scrapers

## License

[MIT](LICENSE) — free to use, modify, and distribute.

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
