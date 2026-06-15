#!/usr/bin/env node
/**
 * Builds JobExt release packages with one-click browser install.
 * Run: npm run release
 */
import { execSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  chmodSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const RELEASE = join(ROOT, 'release');
const TEMPLATES = join(__dirname, 'templates');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version;

function run(cmd, opts = {}) {
  console.log(`\n▸ ${cmd}`);
  execSync(cmd, { ...opts, cwd: opts.cwd ?? ROOT, stdio: 'inherit' });
}

function readTemplate(name) {
  return readFileSync(join(TEMPLATES, name), 'utf8').replaceAll('VERSION_PLACEHOLDER', VERSION);
}

function copyExtensionAssets(targetDir) {
  const extDir = join(targetDir, 'extensions');
  mkdirSync(extDir, { recursive: true });
  const chromeMv3 = join(ROOT, '.output/chrome-mv3');
  cpSync(chromeMv3, join(extDir, 'chrome-mv3'), { recursive: true });
  writeFileSync(
    join(extDir, 'chrome-mv3', 'LOAD-IN-CHROME.txt'),
    `Load THIS folder in Chrome (chrome://extensions → Developer mode → Load unpacked).

This folder must contain manifest.json at the top level.

Do NOT select:
- ~/JobExt (Git/source folder — wrong)
- The DMG or Install JobExt.app
- Any parent folder without manifest.json

Correct path after install:
~/Library/Application Support/JobExt/chrome-mv3
`,
  );
  cpSync(join(ROOT, '.output/firefox-mv2'), join(extDir, 'firefox-mv2'), { recursive: true });
  cpSync(join(ROOT, `.output/jobext-${VERSION}-chrome.zip`), join(extDir, `jobext-${VERSION}-chrome.zip`));
  cpSync(
    join(ROOT, `.output/jobext-${VERSION}-firefox.zip`),
    join(extDir, `jobext-${VERSION}-firefox.zip`),
  );
}

function copyIconToApp(appPath) {
  const resources = join(appPath, 'Contents/Resources');
  mkdirSync(resources, { recursive: true });
  createMacAppIcon(resources);
}

function createMacAppIcon(resourcesDir) {
  const iconSrc = (size) => join(ROOT, `public/icon/${size}.png`);
  cpSync(iconSrc(128), join(resourcesDir, 'icon.png'));

  if (process.platform !== 'darwin') return;

  const iconset = join(resourcesDir, 'AppIcon.iconset');
  rmSync(iconset, { recursive: true, force: true });
  mkdirSync(iconset, { recursive: true });

  const entries = [
    [16, 'icon_16x16.png'],
    [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'],
    [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'],
    [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'],
    [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'],
    [1024, 'icon_512x512@2x.png'],
  ];

  for (const [size, name] of entries) {
    cpSync(iconSrc(size), join(iconset, name));
  }

  try {
    run(`iconutil -c icns "${iconset}" -o "${join(resourcesDir, 'AppIcon.icns')}"`, { stdio: 'pipe' });
    rmSync(iconset, { recursive: true, force: true });
  } catch {
    console.log('  (AppIcon.icns skipped — iconutil unavailable)');
  }
}

function createMacLauncherApp(destAppPath) {
  const macos = join(destAppPath, 'Contents/MacOS');
  const resources = join(destAppPath, 'Contents/Resources');
  mkdirSync(macos, { recursive: true });
  mkdirSync(resources, { recursive: true });

  writeFileSync(join(macos, 'JobExt'), readTemplate('JobExt-launcher.sh'), { mode: 0o755 });
  writeFileSync(join(destAppPath, 'Contents/Info.plist'), readTemplate('Info-launcher.plist'));
  copyIconToApp(destAppPath);
  chmodSync(join(macos, 'JobExt'), 0o755);
}

function createMacInstallerApp(destAppPath, embeddedLauncherPath, extensionsDir) {
  const macos = join(destAppPath, 'Contents/MacOS');
  const resources = join(destAppPath, 'Contents/Resources');
  mkdirSync(macos, { recursive: true });
  mkdirSync(resources, { recursive: true });

  const installScript = readFileSync(join(TEMPLATES, 'macos-install.sh'), 'utf8');
  cpSync(join(TEMPLATES, 'chrome-load-helper.applescript'), join(resources, 'chrome-load-helper.applescript'));
  cpSync(embeddedLauncherPath, join(resources, 'JobExt.app'), { recursive: true });
  cpSync(extensionsDir, join(resources, 'extensions'), { recursive: true });

  const wrapper = `#!/bin/bash
set -euo pipefail
RESOURCES="$(cd "$(dirname "$0")/../Resources" && pwd)"
export INSTALLER_ROOT="$RESOURCES"
export INSTALLER_RESOURCES="$RESOURCES"
bash "$RESOURCES/macos-install.sh"
`;
  writeFileSync(join(resources, 'macos-install.sh'), installScript);
  writeFileSync(join(macos, 'install'), wrapper, { mode: 0o755 });
  writeFileSync(join(destAppPath, 'Contents/Info.plist'), readTemplate('Info-installer.plist'));
  copyIconToApp(destAppPath);
  chmodSync(join(macos, 'install'), 0o755);
}

function signMacApp(appPath) {
  if (process.platform !== 'darwin') return;
  try {
    run(`xattr -dr com.apple.quarantine "${appPath}" 2>/dev/null || true`, { stdio: 'pipe' });
    run(`codesign --force --deep -s - "${appPath}"`, { stdio: 'pipe' });
  } catch {
    console.log('  (ad-hoc sign skipped)');
  }
}

function prepareMacPlatform(platformDir) {
  const installerApp = join(platformDir, 'Install JobExt.app');
  const stagingDir = join(platformDir, '.staging');
  const stagingLauncher = join(stagingDir, 'JobExt.app');
  const stagingExtensions = join(stagingDir, 'extensions');

  rmSync(join(platformDir, 'JobExt.app'), { recursive: true, force: true });
  rmSync(join(platformDir, 'extensions'), { recursive: true, force: true });
  rmSync(installerApp, { recursive: true, force: true });
  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });

  createMacLauncherApp(stagingLauncher);
  copyExtensionAssets(stagingDir);
  createMacInstallerApp(installerApp, stagingLauncher, stagingExtensions);
  rmSync(stagingDir, { recursive: true, force: true });

  signMacApp(join(installerApp, 'Contents/Resources/JobExt.app'));
  signMacApp(installerApp);

  writeFileSync(
    join(platformDir, 'README.txt'),
    `JobExt ${VERSION}
============

ONE-CLICK INSTALL (Chrome 137+)
The DMG contains a single app: "Install JobExt.app" — double-click that.

1. Double-click "Install JobExt.app"
2. If macOS warns about unidentified developer: Control+click → Open (first time only)
3. Enter your Mac password when asked (installs JobExt to /Applications)
4. Turn ON Developer mode on the extensions page, then click Continue
5. Pin JobExt in Chrome's toolbar and open the side panel

NOTE: Google removed silent extension loading in Chrome 137.
Our installer automates Load unpacked; Developer mode must be ON once.

DAILY USE: Click JobExt in Chrome toolbar, or open JobExt from Applications/Desktop.
(Do not keep or run "Install JobExt" after setup — use "JobExt" only.)

FIREFOX
Load extensions via about:debugging (temporary) or use Chrome/Edge.

OLLAMA
https://ollama.com/download — then: ollama pull qwen2.5:3b

ZERO-WARNING INSTALL (optional)
Publish to Chrome Web Store, or notarize with an Apple Developer account.
See docs/DISTRIBUTION.md in the GitHub repo.
`,
  );
}

function writeWindowsInstaller(platformDir) {
  const ps1 = readTemplate('windows-install.ps1');
  writeFileSync(join(platformDir, 'Install-JobExt.ps1'), ps1, 'utf8');

  const bat = `@echo off
title JobExt ${VERSION}
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-JobExt.ps1"
`;
  writeFileSync(join(platformDir, 'Install JobExt.bat'), bat, 'utf8');

  writeFileSync(
    join(platformDir, 'README.txt'),
    `JobExt ${VERSION} — Windows
=========================

ONE-CLICK INSTALL
1. Double-click "Install JobExt.bat"
2. Browser opens with JobExt loaded
3. Use the "JobExt" Desktop shortcut from now on
4. Complete AI setup in the extension side panel

OLLAMA: https://ollama.com/download/OllamaSetup.exe
Then: ollama pull qwen2.5:3b
`,
  );
}

function createDmg(sourceDir, dmgPath, volumeName) {
  if (process.platform !== 'darwin') {
    console.log(`  Skipping DMG (not on macOS): ${dmgPath}`);
    return;
  }
  const staging = `${sourceDir}-dmg-staging`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  cpSync(sourceDir, join(staging, volumeName), { recursive: true });
  rmSync(dmgPath, { force: true });
  run(
    `hdiutil create -volname "${volumeName}" -srcfolder "${staging}/${volumeName}" -ov -format UDZO "${dmgPath}"`,
  );
  try {
    run(`xattr -dr com.apple.quarantine "${dmgPath}" 2>/dev/null || true`, { stdio: 'pipe' });
  } catch { /* ignore */ }
  rmSync(staging, { recursive: true, force: true });
}

function createWindowsZip(sourceDir, zipPath) {
  rmSync(zipPath, { force: true });
  if (process.platform === 'win32') {
    run(
      `powershell -NoProfile -Command "Compress-Archive -Path '${sourceDir}\\*' -DestinationPath '${zipPath}' -Force"`,
    );
  } else {
    run(`cd "${sourceDir}" && zip -r "${zipPath}" . -x "*.DS_Store"`);
  }
}

console.log(`\n📦 JobExt release build v${VERSION}\n`);

run('npm run lint');
run('npm test');
run('npm run icons');
run('npm run build');
run('npm run build:firefox');
run('npm run zip');
run('npm run zip:firefox');

const platforms = {
  'macos-intel': { label: 'macOS Intel' },
  'macos-apple-silicon': { label: 'macOS Apple Silicon' },
  windows: { label: 'Windows 64-bit' },
};

mkdirSync(RELEASE, { recursive: true });

for (const [id, meta] of Object.entries(platforms)) {
  const platformDir = join(RELEASE, id);
  rmSync(platformDir, { recursive: true, force: true });
  mkdirSync(platformDir, { recursive: true });

  if (id.startsWith('macos')) {
    prepareMacPlatform(platformDir);
    const dmgName = join(RELEASE, `JobExt-${VERSION}-${id}.dmg`);
    createDmg(platformDir, dmgName, 'JobExt Installer');
  } else {
    copyExtensionAssets(platformDir);
    writeWindowsInstaller(platformDir);
    createWindowsZip(platformDir, join(RELEASE, `JobExt-${VERSION}-windows.zip`));
  }

  console.log(`✔ ${meta.label} → release/${id}/`);
}

writeFileSync(
  join(RELEASE, 'README.md'),
  `# JobExt releases v${VERSION}

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
| Intel | [JobExt-${VERSION}-macos-intel.dmg](./JobExt-${VERSION}-macos-intel.dmg) |
| Apple Silicon | [JobExt-${VERSION}-macos-apple-silicon.dmg](./JobExt-${VERSION}-macos-apple-silicon.dmg) |

### Windows
1. [JobExt-${VERSION}-windows.zip](./JobExt-${VERSION}-windows.zip) → **Install JobExt.bat**
2. Use the **JobExt** desktop shortcut

### Zero warnings?
Publish to [Chrome Web Store](https://chrome.google.com/webstore/devconsole) or notarize with an Apple Developer ID. See [docs/DISTRIBUTION.md](../docs/DISTRIBUTION.md).

Rebuild: \`npm run release\`
`,
);

console.log(`\n✅ Release artifacts in release/\n`);
