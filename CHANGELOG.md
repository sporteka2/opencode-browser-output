# Changelog

All notable changes to this project will be documented in this file.

## [2.3.1] - 2026-11-10

### Fixed
- Zoom no longer resets per page: the opened page is written to a fixed path
  `output.html`, so Firefox's per-URL zoom preference carries over to every new
  output window (`localStorage` was tried first and dropped — Firefox keeps
  `file://` origins in memory only, so nothing survives a page change)
- Answers/questions open for the session that produced the tracked text, not for
  every session on the shared event stream (a retrying/failing background
  session used to open a window every ~10 minutes)
- `return` inside the `for await` event loop no longer kills the subscription
  (`continue` + reconnect with backoff); previously one skipped event stopped
  all browser opens until a config reload

## [2.2.8] - 2026-11-02

### Fixed
- Questions with options open in the browser again after the OpenCode 2.2.5
  update: they are no longer announced via `form.created` but arrive as a
  `question` tool call, so the tool name is tracked from
  `session.tool.input.started` and the page opens on `session.tool.called`
  (also covers the octto question tools)
- One window per question: the tool path and the legacy `form.created` path
  share one claim key keyed by `messageID`
- Browser launch is a detached async `spawn` instead of `execSync`, which died
  with `ETIMEDOUT` whenever the browser was busy

## [2.2.0] - 2026-10-20

### Added
- Restored opening questions in browser (V1 feature ported to V2)
- Questions now handled via `form.created` events with `metadata.kind === "question"`
- Renders form fields: string, multiselect, boolean with options and descriptions

### Fixed
- **Duplicate browser windows** — cross-instance claim file (`last-open.json`) prevents multiple plugin instances (one per active OpenCode location) from opening the same output twice
- Version bump in package.json now matches log output

### Changed
- Updated for OpenCode V2 plugin API: `setup(ctx)` returns cleanup function, `ctx.event.subscribe()` with AbortSignal
- Internal event handling migrated from `message.part.updated` / `question.asked` (removed in V2) to `session.text.delta` / `session.text.ended` / `session.step.ended` / `session.idle` / `form.created`

## [2.0.0] - 2026-09-26

### Added
- Markdown rendering with TUI-like styling and syntax highlighting for common languages
- Sentinel-token protection for tables, code blocks, links and blockquotes so nested markup is not mangled
- Light/dark themes via `prefers-color-scheme`
- Automatic cleanup: only the 20 most recent `output-*.html` files are kept

### Changed
- Output directory moved from `os.tmpdir()` to `~/.cache/opencode-browser-output` — the tmpfs `/tmp` on some systems runs under a per-user quota, and `EDQUOT` failures produced silent empty files
- Log file moved alongside the output directory (`plugin.log`)

### Fixed
- `writeFileSync` is now wrapped in try/catch and logs the error code, so disk/quota failures are no longer swallowed

## [1.1.0] - 2025-09-19

### Added
- Markdown table to HTML table conversion
- CSS styling for rendered tables (borders, header background, alternating row colors)

## [1.0.0] - 2025-09-19

### Added
- Initial release
- Opens final assistant output in system default browser
- Works on small screens — avoids terminal scrolling
- Opens only the last final response (not intermediate steps)
- URL auto-linking (clickable links with `target="_blank"`)
- Cross-platform: `xdg-open` (Linux), `open` (macOS), `start` (Windows)
- Session completion detection via `session.idle` event