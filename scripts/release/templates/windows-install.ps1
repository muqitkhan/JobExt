# JobExt VERSION_PLACEHOLDER — Windows installer (Chrome 137+ needs Load unpacked)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms

$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SrcExt = Join-Path $Dir "extensions\chrome-mv3"
$InstallDir = Join-Path $env:LOCALAPPDATA "JobExt"
$DestExt = Join-Path $InstallDir "chrome-mv3"

if (-not (Test-Path $SrcExt)) {
    [System.Windows.Forms.MessageBox]::Show("Extension files missing. Re-download the installer.", "JobExt", "OK", "Error")
    exit 1
}

Write-Host "[JobExt] Installing to $InstallDir ..."
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
if (Test-Path $DestExt) { Remove-Item -Recurse -Force $DestExt }
Copy-Item -Recurse $SrcExt $DestExt
$ffSrc = Join-Path $Dir "extensions\firefox-mv2"
if (Test-Path $ffSrc) {
    Copy-Item -Recurse $ffSrc (Join-Path $InstallDir "firefox-mv2") -Force
}

Set-Clipboard -Value $DestExt
explorer.exe $DestExt

function Open-ExtensionsPage {
    $chrome = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
    $chrome86 = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
    $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
    $edge86 = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    if (Test-Path $chrome) { Start-Process $chrome "chrome://extensions/"; return }
    if (Test-Path $chrome86) { Start-Process $chrome86 "chrome://extensions/"; return }
    if (Test-Path $edge) { Start-Process $edge "edge://extensions/"; return }
    if (Test-Path $edge86) { Start-Process $edge86 "edge://extensions/"; return }
    Start-Process "https://www.google.com/chrome/"
}

Open-ExtensionsPage

$msg = @"
JobExt files installed to:
$DestExt

(Folder path copied to clipboard)

Chrome 137+ requires one step:
1. Turn ON Developer mode
2. Click Load unpacked
3. Select the opened folder (Ctrl+V path)

4. Pin JobExt from the extensions menu
5. Click JobExt icon to open the side panel
"@

[System.Windows.Forms.MessageBox]::Show($msg, "Almost done — Load unpacked", "OK", "Information")

# Desktop shortcut opens extensions helper
$Wsh = New-Object -ComObject WScript.Shell
$lnk = Join-Path ([Environment]::GetFolderPath("Desktop")) "JobExt.lnk"
$helper = Join-Path $Dir "Install JobExt.bat"
$sc = $Wsh.CreateShortcut($lnk)
$sc.TargetPath = $helper
$sc.Description = "JobExt setup helper"
$sc.Save()
