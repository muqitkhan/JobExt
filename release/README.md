# JobExt releases v1.0.0

## One-click install (no Developer mode)

### macOS
1. Download the DMG for your chip
2. Double-click **Install JobExt.app** (the only app in the DMG)
3. **Developer mode ON** → click **Continue** in the installer dialog
4. Click **JobExt** in Chrome toolbar — side panel opens; finish AI setup there

**Chrome 137+:** Google disabled silent install. One "Load unpacked" step is required unless you use the Chrome Web Store build (coming).

**Use JobExt.app** in Applications (or Desktop shortcut) every day.

| Chip | Download |
|------|----------|
| Intel | [JobExt-1.0.0-macos-intel.dmg](./JobExt-1.0.0-macos-intel.dmg) |
| Apple Silicon | [JobExt-1.0.0-macos-apple-silicon.dmg](./JobExt-1.0.0-macos-apple-silicon.dmg) |

### Windows
1. [JobExt-1.0.0-windows.zip](./JobExt-1.0.0-windows.zip) → **Install JobExt.bat**
2. Use the **JobExt** desktop shortcut

### Zero warnings?
Publish to [Chrome Web Store](https://chrome.google.com/webstore/devconsole) or notarize with an Apple Developer ID. See [docs/DISTRIBUTION.md](../docs/DISTRIBUTION.md).

Rebuild: `npm run release`
