# Add-in icon assets

The Outlook manifest references `icon-16.png`, `icon-32.png`, `icon-64.png`,
`icon-80.png`, `icon-128.png`. Drop them into this folder before sideloading.
Brand-approved artwork ships in a separate PR (see `.claude/rules/ui.md` §11).
Until then, any 1:1 PNG at the correct pixel dimensions is sufficient for
local development — the sideload flow will 404 on missing icons but the
taskpane will still load.
