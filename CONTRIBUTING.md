# Contributing to JobExt

Thank you for your interest in contributing to JobExt!

## Development setup

1. **Prerequisites**
   - Node.js 20+
   - npm
   - [Ollama](https://ollama.com) (for local LLM testing)

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run in dev mode**
   ```bash
   npm run dev          # Chrome / Edge
   npm run dev:firefox  # Firefox
   ```

4. **Run tests**
   ```bash
   npm test
   npm run lint
   ```

## Project structure

- `entrypoints/` — WXT entry points (background, content script, side panel)
- `lib/` — Core logic (parsers, exporters, LLM clients, scrapers)
- `tests/` — Vitest unit tests

## Adding a new job-site scraper

1. Add a `scrapeYourSite()` function in [`lib/scrapers/index.ts`](lib/scrapers/index.ts)
2. Register it in `scrapeCurrentPage()` for the site's hostname
3. Add the domain to `host_permissions` in [`wxt.config.ts`](wxt.config.ts) if not already covered
4. Test on a live job listing page and document known selectors in your PR

## Pull request guidelines

- Keep PRs focused on a single feature or fix
- Add or update tests for parser/LLM utility changes
- Run `npm run lint` and `npm test` before submitting
- If you change scraper selectors, note which site and page URL you tested against

## Reporting scraper breakage

Job sites change their HTML frequently. Use the **Scraper broken** issue template and include:

- Site name and URL pattern
- Browser and extension version
- Screenshot or HTML snippet of the job description area

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
