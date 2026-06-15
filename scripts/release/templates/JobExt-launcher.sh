#!/bin/bash
# JobExt — open Chrome/Edge and guide extension load (Chrome 137+ blocks --load-extension).
set -euo pipefail

EXT_DIR="${HOME}/Library/Application Support/JobExt/chrome-mv3"

if [[ ! -d "$EXT_DIR" ]]; then
  osascript -e 'display alert "JobExt is not installed" message "Open the JobExt DMG and double-click Install JobExt.app first." as critical' 2>/dev/null || true
  exit 1
fi

if [[ ! -f "${EXT_DIR}/manifest.json" ]]; then
  osascript -e "display alert \"Extension files are broken\" message \"manifest.json is missing. Run Install JobExt.app again.\" as critical" 2>/dev/null || true
  exit 1
fi

printf '%s' "$EXT_DIR" | pbcopy 2>/dev/null || true
open -R "${EXT_DIR}/manifest.json"

CHOICE=$(osascript 2>/dev/null <<EOF || echo "Open Chrome"
set extPath to "$EXT_DIR"
set dlg to display dialog "Load THIS folder in Chrome (Load unpacked):

" & extPath & "

Or use Desktop shortcut: JobExt Extension (Chrome)

Do NOT select ~/JobExt or the DMG — those have no manifest.json." buttons {"Open Edge", "Open Chrome", "OK"} default button "Open Chrome" with title "Open JobExt"
return button returned of dlg
EOF
)

open_browser() {
  local app="$1"
  local url="$2"
  if [[ -d "/Applications/${app}.app" ]]; then
    open -a "$app" "$url"
    return 0
  fi
  return 1
}

case "$CHOICE" in
  "Open Edge")
    open_browser "Microsoft Edge" "edge://extensions/" || open_browser "Google Chrome" "chrome://extensions/"
    ;;
  "Open Chrome")
    open_browser "Google Chrome" "chrome://extensions/" || open_browser "Microsoft Edge" "edge://extensions/"
    ;;
esac

exit 0
