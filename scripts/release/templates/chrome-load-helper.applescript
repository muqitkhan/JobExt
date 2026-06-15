on run argv
	set extPath to item 1 of argv
	set the clipboard to extPath

	display dialog "JobExt will finish loading into Chrome.

IMPORTANT — select this exact folder:
" & extPath & "

Do NOT select:
• ~/JobExt (source code — no manifest)
• The DMG volume or Install JobExt.app

Steps:
1. Turn ON \"Developer mode\" (top-right).
2. Click Continue — we open Load unpacked and paste the path for you." buttons {"Cancel", "Continue"} default button "Continue" with title "Install JobExt in Chrome"

	tell application "Google Chrome"
		activate
		if (count of windows) is 0 then
			make new window
		end if
		set URL of active tab of front window to "chrome://extensions/"
	end tell

	delay 2

	tell application "System Events"
		tell process "Google Chrome"
			set frontmost to true
			try
				click button "Load unpacked" of front window
			on error
				try
					click (first button whose name contains "Load unpacked")
				on error
					display dialog "Click \"Load unpacked\" on the extensions page, then click OK." buttons {"OK"} default button "OK" with title "One more click"
				end try
			end try
		end tell
	end tell

	delay 1.2

	tell application "System Events"
		keystroke "g" using {command down, shift down}
		delay 0.7
		keystroke "v" using command down
		delay 0.4
		key code 36
		delay 0.5
		key code 36
	end tell

	display notification "If JobExt appears in chrome://extensions, click its toolbar icon to open the side panel." with title "JobExt installed"
end run
