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

## Requirements

- Any browser set as system default
- Linux/macOS/Windows (uses `xdg-open` / `open` / `start`)

## License

MIT