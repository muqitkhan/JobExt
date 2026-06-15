# JobExt — Distribution & install

## Why JobExt might not appear in Applications

The installer puts **one** app on your Mac:

- **`/Applications/JobExt.app`** — daily use (Launchpad, Spotlight, Desktop shortcut)
- Fallback only if you skip the admin prompt: `~/Applications/JobExt.app`

The DMG contains **only** **`Install JobExt.app`** — run that once, then use **JobExt** (not Install JobExt).

If you see two JobExt icons, you may have an old copy in `~/Applications` from a previous installer. Delete the duplicate and keep the one in `/Applications`.

---

## Can install be fully autonomous?

| Step | Autonomous? | Notes |
|------|-------------|--------|
| Copy extension files | Yes | Installer does this |
| Install JobExt.app to Applications | Yes | Admin password once (macOS security) |
| Load extension in Chrome 137+ | **Partially** | Google removed `--load-extension`; you must turn **Developer mode ON** once; installer then automates **Load unpacked** |
| Open JobExt side panel | Yes | After load, extension opens the panel on first run |
| True zero-click (no Developer mode) | **Chrome Web Store only** | One “Add to Chrome” — recommended for public release |

**Chrome 137+** blocks installers from silently loading extensions. That is a Google security policy, not a JobExt limitation.

---

## What our installers do

### macOS

1. Double-click **Install JobExt.app** from the DMG
2. Copies extension → `~/Library/Application Support/JobExt/chrome-mv3`
3. Installs **JobExt.app** → `/Applications` (+ Desktop shortcut)
4. Opens **chrome://extensions** and guides **Load unpacked** (automated after Developer mode is ON)
5. Click **JobExt** in the Chrome toolbar → side panel opens

### Windows

Same guided flow via **Install JobExt.bat** (Chrome 137+ still needs Developer mode + Load unpacked once).

### After Load unpacked

The extension **auto-opens the side panel** on first install. Complete AI setup in the panel (⚙).

---

## Recommended: Chrome Web Store

For true one-click install with no Developer mode:

1. `npm run zip`
2. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) — $5 one-time fee

---

## Rebuild installers

```bash
npm run release
```
