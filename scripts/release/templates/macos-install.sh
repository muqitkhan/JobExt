#!/bin/bash
# JobExt one-click installer for macOS
set -euo pipefail

if [[ -n "${INSTALLER_ROOT:-}" && -d "${INSTALLER_ROOT}/extensions" ]]; then
  BUNDLE_DIR="${INSTALLER_ROOT}"
else
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  if [[ -d "${SCRIPT_DIR}/extensions" ]]; then
    BUNDLE_DIR="${SCRIPT_DIR}"
  elif [[ -d "${SCRIPT_DIR}/../../extensions" ]]; then
    BUNDLE_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
  else
    BUNDLE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
  fi
fi

EXT_SRC="${BUNDLE_DIR}/extensions/chrome-mv3"
FF_SRC="${BUNDLE_DIR}/extensions/firefox-mv2"
EXT_DEST="${HOME}/Library/Application Support/JobExt/chrome-mv3"
INSTALL_ROOT="${HOME}/Library/Application Support/JobExt"
LAUNCHER_SRC="${BUNDLE_DIR}/JobExt.app"
HELPER_SCRIPT="${INSTALLER_RESOURCES:-${BUNDLE_DIR}}/chrome-load-helper.applescript"
LAUNCHER_DEST="/Applications/JobExt.app"

log() { echo "[JobExt] $*"; }

fail() {
  osascript -e "display alert \"Install failed\" message \"$1\" as critical" 2>/dev/null || true
  exit 1
}

if [[ ! -d "$EXT_SRC" ]]; then
  fail "Extension files not found. Re-download the installer."
fi

if [[ ! -f "${EXT_SRC}/manifest.json" ]]; then
  fail "Invalid extension bundle (manifest.json missing). Re-download the installer."
fi

if [[ ! -d "$LAUNCHER_SRC" ]]; then
  fail "JobExt app files not found inside the installer. Re-download the DMG."
fi

log "Installing extension files…"
mkdir -p "${INSTALL_ROOT}"
rm -rf "${INSTALL_ROOT}/chrome-mv3" "${INSTALL_ROOT}/firefox-mv2"
ditto "${EXT_SRC}" "${INSTALL_ROOT}/chrome-mv3"
[[ -d "$FF_SRC" ]] && ditto "${FF_SRC}" "${INSTALL_ROOT}/firefox-mv2"
xattr -dr com.apple.quarantine "${INSTALL_ROOT}" 2>/dev/null || true

if [[ ! -f "${EXT_DEST}/manifest.json" ]]; then
  fail "Extension install failed — manifest.json not found at:
${EXT_DEST}"
fi

log "Installing JobExt to Applications…"
install_launcher() {
  local src="$1"
  local dest="/Applications/JobExt.app"
  local user_dest="${HOME}/Applications/JobExt.app"

  if ditto "${src}" "${dest}" 2>/dev/null; then
    LAUNCHER_DEST="${dest}"
    log "Installed to ${dest}"
  else
    log "Requesting permission to install in /Applications…"
    if osascript -e "do shell script \"rm -rf '${dest}' && ditto '${src}' '${dest}' && xattr -dr com.apple.quarantine '${dest}' 2>/dev/null || true && chmod +x '${dest}/Contents/MacOS/JobExt' 2>/dev/null || true\" with administrator privileges" 2>/dev/null; then
      LAUNCHER_DEST="${dest}"
      log "Installed to ${dest}"
    else
      mkdir -p "${HOME}/Applications"
      rm -rf "${user_dest}"
      ditto "${src}" "${user_dest}"
      LAUNCHER_DEST="${user_dest}"
      log "Installed to ${user_dest} (admin install skipped)"
    fi
  fi

  if [[ "${LAUNCHER_DEST}" == "${dest}" ]]; then
    rm -rf "${user_dest}" 2>/dev/null || true
  else
    rm -rf "${dest}" 2>/dev/null || true
  fi

  chmod +x "${LAUNCHER_DEST}/Contents/MacOS/JobExt" 2>/dev/null || true
  xattr -dr com.apple.quarantine "${LAUNCHER_DEST}" 2>/dev/null || true
  codesign --force --deep -s - "${LAUNCHER_DEST}" 2>/dev/null || true
}

install_launcher "${LAUNCHER_SRC}"

log "Creating Desktop shortcuts…"
osascript <<EOF 2>/dev/null || true
tell application "Finder"
  try
    delete alias file "JobExt" of desktop
  end try
  try
    delete alias file "JobExt Extension (Chrome)" of desktop
  end try
  make alias file to POSIX file "${LAUNCHER_DEST}" at desktop
  make alias file to POSIX file "${EXT_DEST}" at desktop with properties {name:"JobExt Extension (Chrome)"}
end tell
EOF

printf '%s' "${EXT_DEST}" | pbcopy 2>/dev/null || true
open -R "${EXT_DEST}/manifest.json"

if [[ -d "/Applications/Google Chrome.app" ]]; then
  open -a "Google Chrome" "chrome://extensions/"
elif [[ -d "/Applications/Microsoft Edge.app" ]]; then
  open -a "Microsoft Edge" "edge://extensions/"
fi

if [[ -f "${HELPER_SCRIPT}" ]]; then
  log "Guiding Chrome extension load…"
  osascript "${HELPER_SCRIPT}" "${EXT_DEST}" 2>/dev/null || true
else
  osascript -e "display dialog \"Select this folder in Load unpacked:

${EXT_DEST}

Do NOT select ~/JobExt or the DMG.\" buttons {\"OK\"} default button \"OK\" with title \"Load JobExt in Chrome\"" 2>/dev/null || true
fi

open -R "${LAUNCHER_DEST}" 2>/dev/null || true

osascript <<EOF 2>/dev/null || true
display dialog "JobExt is installed.

Chrome: Load unpacked → select Desktop shortcut \"JobExt Extension (Chrome)\"

Daily use: Applications → JobExt, or the JobExt icon in Chrome.

Do not use ~/JobExt — that is source code, not the extension." buttons {"OK"} default button "OK" with title "Installation complete"
EOF

configure_ollama_for_extensions() {
  if [[ ! -d "/Applications/Ollama.app" ]]; then
    return 0
  fi

  log "Configuring Ollama for JobExt…"
  local origins='chrome-extension://*,moz-extension://*,safari-web-extension://*'
  launchctl setenv OLLAMA_ORIGINS "$origins" 2>/dev/null || true

  local plist="${HOME}/Library/LaunchAgents/com.jobext.ollama-origins.plist"
  mkdir -p "${HOME}/Library/LaunchAgents"
  cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.jobext.ollama-origins</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>launchctl setenv OLLAMA_ORIGINS "${origins}"</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
PLIST

  launchctl bootout "gui/$(id -u)/com.jobext.ollama-origins" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$plist" 2>/dev/null || launchctl load "$plist" 2>/dev/null || true

  if pgrep -x Ollama >/dev/null 2>&1 || pgrep -x ollama >/dev/null 2>&1; then
    killall Ollama 2>/dev/null || true
    sleep 1
    open -a Ollama 2>/dev/null || true
  fi
}

configure_ollama_for_extensions

exit 0
