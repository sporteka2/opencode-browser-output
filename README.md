# opencode-plugin-browser-output

Opencode plugin that opens the final assistant output in a browser window.

## Why

Useful when you have a small screen and don't want to keep scrolling up in the terminal to see the full output. The plugin opens the final response in a browser window where it's easier to read.

## Features

- Opens only the **final** assistant response (not intermediate steps)
- Opens in a **new browser window** (Firefox `--new-window`)

## Installation

Add to your opencode config:

```json
{
  "plugin": [
    "opencode-plugin-browser-output"
  ]
}
```

Or install globally and reference by path:

```json
{
  "plugin": [
    "/path/to/opencode-plugin-browser-output"
  ]
}
```

## How it works

1. Listens for `message.part.updated` events
2. Accumulates text parts from assistant messages
3. On `session.idle` (session complete), takes the last finished message
4. Creates an HTML file with the text
5. Opens it in Firefox with `--new-window`

## Requirements

- Firefox (`firefox-bin`, `firefox`, or `firefox-dev` in PATH)
- Linux/macOS/Windows (uses `xdg-open` / `open` / `start` as fallback)

## License

MIT