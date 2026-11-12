# opencode-browser-output

Plugin for opencode that opens the final assistant output in a browser window.

## Why

Useful when you have a small screen: no need to keep scrolling up in the terminal to read the full output. The plugin opens the final response in a separate browser window.

## Features

- Opens only the **final** assistant response (not intermediate steps)

## Installation

Add to your opencode config:

```json
{
  "plugin": [
    "opencode-browser-output"
  ]
}
```

Or reference by local path:

```json
{
  "plugin": [
    "/path/to/opencode-browser-output"
  ]
}
```

## How it works

1. Listens for `message.part.updated` events
2. Accumulates text parts from assistant messages
3. On `session.idle` (session complete), takes the last finished message
4. Creates an HTML file with the text
5. Opens it in the system default browser

## Desktop integration (optional)

On Linux/Cinnamon you can make the output windows a **separate application**: own
Firefox profile, own `WM_CLASS`, own panel icon — so the panel groups them apart
from your main Firefox and shows that icon in Alt+Tab / hover previews.

```bash
# 1. dedicated profile
firefox-dev -CreateProfile opencode-output      # ~/.mozilla/firefox/<hash>.opencode-output

# 2. icon (any 48px SVG works) + desktop entry
install -Dm644 opencode-output.svg ~/.local/share/icons/hicolor/scalable/apps/
install -Dm644 opencode-output.desktop ~/.local/share/applications/
update-desktop-database ~/.local/share/applications
```

`opencode-output.desktop` (key part — the class must match the launcher):

```ini
[Desktop Entry]
Type=Application
Name=OpenCode Output
Exec=/home/user/.local/bin/opencode-output-browser %u
Icon=opencode-output
StartupWMClass=opencode-output
```

`~/.local/bin/opencode-output-browser`:

```bash
#!/usr/bin/env bash
PROFILE=$(grep -A2 'Name=opencode-output' ~/.mozilla/firefox/profiles.ini \
           | awk -F= '/^Path=/{print $2; exit}')
exec firefox-dev --class opencode-output \
     --profile ~/.mozilla/firefox/$PROFILE --new-window "$@"
```

The plugin uses that launcher automatically when it exists and falls back to the
default browser handler otherwise.

### Hide the URL bar in that profile

Firefox *does* still load `userChrome.css` — the switch is the
**`toolkit.legacyUserProfileCustomizations.stylesheets`** pref (camelCase, and
with the trailing *s*), which has to live in the profile's **`user.js`**. The
lowercase `prefs.js` spelling is silently ignored, which is what made this look
dead before.

```bash
# profile/user.js
user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);
```

```css
/* profile/chrome/userChrome.css */
#nav-bar      { display: none !important; }   /* the URL panel */
#PersonalToolbar { display: none !important; }
```

Copy both into `<profile>/` (files from `profile/` in this repo), then fully
close every window of that profile once — `user.js` is only read at startup.

`bin/opencode-output-browser` starts that profile (`--class opencode-output`,
paired with the `.desktop` file above) and falls back to the GTK viewer when
the profile or Firefox is missing.

`config.json` (`~/.config/opencode-browser-output/`, created on first launch):

```json
{
  "openErrors": false,
  "zoom": 1.1
}
```

### Chromeless viewer (alternative)

`bin/opencode-output-viewer` is a small GTK3 + WebKitGTK window with no toolbar
at all, its own `WM_CLASS`, persisted zoom (`Ctrl+wheel`, `Ctrl+-`/`+/0`) and
the GTK theme pinned into `prefers-color-scheme`. Install with:

```bash
install -Dm755 bin/opencode-output-viewer bin/opencode-output-browser ~/.local/bin/
```

The browser entry point uses the Firefox profile by default and the viewer only
as a fallback; swap the order in `bin/opencode-output-browser` to prefer it.

## Requirements

- Any browser set as system default, or the optional launcher above
- Linux/macOS/Windows (uses `xdg-open` / `open` / `start`)

## License

MIT
### Open links in the default browser

The output page lives in a window without a URL bar, so links must not open
there - they go to the system default browser instead. A page cannot launch
another browser by itself, so links are wrapped into the `opencode-open://`
URI scheme and the OS dispatches it to `bin/opencode-open-url`
(`opencode-output-protocol.desktop` in this repo):

```bash
install -Dm755 bin/opencode-open-url ~/.local/bin/
install -Dm644 opencode-output-protocol.desktop ~/.local/share/applications/
xdg-mime default opencode-output-protocol.desktop x-scheme-handler/opencode-open
update-desktop-database ~/.local/share/applications
```

The handler decodes the URL and runs `xdg-open`, so the link opens in your
default browser.
