# Changelog

All notable changes to this project will be documented in this file.

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