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

`userChrome` is per-profile, so the main Firefox is untouched. Enable it in
`<profile>/prefs.js`:

```
user_pref("toolkit.legacyuserprofilecustomizations.stylesheet", true);
```

and put in `<profile>/chrome/userChrome.css`:

```css
#nav-bar {
  margin-top: -34px !important;              /* parked out of view ... */
  transition: margin-top 120ms ease-in-out;
}
#navigator-toolbox:hover > #nav-bar,
#nav-bar:focus-within {                      /* ... revealed on top hover / Ctrl+L */
  margin-top: 0 !important;
}
```

Then fully close that profile's windows once (the pref and the CSS are only read
at startup).

## Requirements

- Any browser set as system default, or the optional launcher above
- Linux/macOS/Windows (uses `xdg-open` / `open` / `start`)

## License

MIT