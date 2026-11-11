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

**Chromeless viewer (recommended).** `bin/opencode-output-viewer` is a small
GTK3 + WebKitGTK window with no toolbar at all — no URL bar, no tab strip —
plus its own `WM_CLASS` and a persisted zoom (`Ctrl+wheel`, `Ctrl+-`/`+/0`,
stored in `config.json`). Install:

```bash
install -Dm755 bin/opencode-output-viewer ~/.local/bin/
install -Dm755 bin/opencode-output-browser ~/.local/bin/
```

`opencode-output-browser` is the entry point the plugin calls: it prefers the
viewer and falls back to the Firefox profile below when the viewer is missing.
Both set `--class`/`WM_CLASS` to `opencode-output`, which is what pairs the
windows with the `.desktop` file shown above.

> Firefox 157 no longer loads `userChrome.css`, so the toolbar can no longer be
> hidden with a stylesheet — that is what the viewer replaces. `userChrome` was
> tried (`chrome/userChrome.css` + `toolkit.legacyuserprofilecustomizations.styleset`)
> and verified not to be applied.

`config.json` (`~/.config/opencode-browser-output/`, created on first launch):

```json
{
  "openErrors": false,
  "zoom": 1.2
}
```

## Requirements

- Any browser set as system default, or the optional launcher above
- Linux/macOS/Windows (uses `xdg-open` / `open` / `start`)

## License

MIT