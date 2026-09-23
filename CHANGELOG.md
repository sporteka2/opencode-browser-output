# Changelog

All notable changes to this project will be documented in this file.

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