import { writeFileSync, mkdirSync, appendFileSync } from "fs";
import { execSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";

const pendingText = new Map();
const finishedMessages = [];
const LOG_FILE = join(tmpdir(), "opencode-browser-output.log");
const dir = join(tmpdir(), "opencode-browser-output");
mkdirSync(dir, { recursive: true });

function debugLog(...args) {
  try { appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${args.join(" ")}\n`); } catch {}
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function markdownTableToHtml(text) {
  const lines = text.split("\n");
  const result = [];
  let inTable = false;
  let tableLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.includes("|")) {
      tableLines.push(trimmed);
      inTable = true;
    } else if (inTable) {
      const htmlTable = tableLinesToHtml(tableLines);
      if (htmlTable) {
        result.push(htmlTable);
      }
      tableLines = [];
      inTable = false;
      result.push(line);
    } else {
      result.push(line);
    }
  }

  if (tableLines.length > 0) {
    const htmlTable = tableLinesToHtml(tableLines);
    if (htmlTable) {
      result.push(htmlTable);
    }
  }

  return result.join("\n");
}

function tableLinesToHtml(lines) {
  if (lines.length < 2) return null;

  const separatorIdx = lines.findIndex(l => l.match(/^\|[\s\-:|]+\|$/));
  if (separatorIdx === -1 || separatorIdx === lines.length - 1) return null;

  const headers = parseRow(lines[0]);
  const rows = lines.slice(separatorIdx + 1).map(parseRow).filter(r => r.length === headers.length);

  if (rows.length === 0) return null;

  let html = "<table>";
  html += "<thead><tr>" + headers.map(h => `<th>${escapeHtml(h)}</th>`).join("") + "</tr></thead>";
  html += "<tbody>" + rows.map(r => "<tr>" + r.map(c => `<td>${escapeHtml(c)}</td>`).join("") + "</tr>").join("") + "</tbody>";
  html += "</table>";
  return html;
}

function parseRow(line) {
  return line.slice(1, -1).split("|").map(c => c.trim());
}

function markdownToHtml(text) {
  let html = escapeHtml(text);

  html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");

  html = html.replace(/^\*\*\*(.+?)\*\*\*$/gm, "<strong><em>$1</em></strong>");
  html = html.replace(/^___(.+?)___$/gm, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/_(.+?)_/g, "<em>$1</em>");

  html = html.replace(/`{3}(\w+)?\n([\s\S]*?)\n`{3}/g, (_, lang, code) => {
    const langClass = lang ? ` class="language-${lang}"` : "";
    return `<pre><code${langClass}>${code.trim()}</code></pre>`;
  });

  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  html = html.replace(/^>\s*(.+)$/gm, "<blockquote>$1</blockquote>");
  html = html.replace(/^---$/gm, "<hr>");

  html = html.replace(/^[-*+]\s+(.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>");
  html = html.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>)/gs, "<ol>$1</ol>");

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  html = html.replace(/\n\n+/g, "</p><p>");
  html = "<p>" + html + "</p>";
  html = html.replace(/<p>\s*<\/p>/g, "");
  html = html.replace(/<p>\s*(<h[1-6]>)/g, "$1");
  html = html.replace(/(<\/h[1-6]>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*(<table>)/g, "$1");
  html = html.replace(/(<\/table>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*(<ul>)/g, "$1");
  html = html.replace(/(<\/ul>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*(<ol>)/g, "$1");
  html = html.replace(/(<\/ol>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*(<blockquote>)/g, "$1");
  html = html.replace(/(<\/blockquote>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*(<pre>)/g, "$1");
  html = html.replace(/(<\/pre>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*(<hr>)/g, "$1");

  return html;
}

function linkify(text) {
  const urlRegex = /(https?:\/\/[^\s"'<>()]+[^\s"'<>),.;:!?])/g;
  return text.replace(urlRegex, (url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`);
}

function openInBrowser(content) {
  if (!content || content.trim().length < 3) return;

  const withTables = markdownTableToHtml(content);
  const processedContent = markdownToHtml(withTables);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>OpenCode Output</title>
  <style>
    :root {
      --bg: #fff;
      --fg: #111;
      --link: #06c;
      --muted: #666;
      --table-border: #ddd;
      --th-bg: #f5f5f5;
      --tr-even: #fafafa;
      --code-bg: #f4f4f4;
      --blockquote-border: #ccc;
      --hr-color: #eee;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #1a1a1a;
        --fg: #e0e0e0;
        --link: #6ab0ff;
        --muted: #999;
        --table-border: #444;
        --th-bg: #2a2a2a;
        --tr-even: #222;
        --code-bg: #2a2a2a;
        --blockquote-border: #555;
        --hr-color: #333;
      }
    }
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 1rem; line-height: 1.7; background: var(--bg); color: var(--fg); max-width: 900px; margin: 0 auto; }
    a { color: var(--link); text-decoration: none; }
    a:hover { text-decoration: underline; }
    h1 { font-size: 1.8rem; font-weight: 600; margin: 1.5rem 0 0.5rem; border-bottom: 1px solid var(--hr-color); padding-bottom: 0.3rem; }
    h2 { font-size: 1.5rem; font-weight: 600; margin: 1.3rem 0 0.5rem; }
    h3 { font-size: 1.25rem; font-weight: 600; margin: 1rem 0 0.4rem; }
    strong { font-weight: 600; }
    em { font-style: italic; }
    code { font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', monospace; font-size: 0.9em; background: var(--code-bg); padding: 0.15rem 0.4rem; border-radius: 4px; }
    pre { margin: 1rem 0; padding: 1rem; background: var(--code-bg); border-radius: 6px; overflow-x: auto; }
    pre code { background: transparent; padding: 0; font-size: 0.85rem; line-height: 1.6; }
    .language-javascript, .language-js { color: #e8d5a3; }
    .language-typescript, .language-ts { color: #9cdcfe; }
    .language-python, .language-py { color: #c8e8b8; }
    .language-rust, .language-rs { color: #f5c588; }
    .language-go { color: #9cdcfe; }
    .language-bash, .language-sh { color: #d4d4d4; }
    .language-json { color: #ce9178; }
    .language-markdown, .language-md { color: #c3e88d; }
    .language-css { color: #9cdcfe; }
    .language-html, .language-xml { color: #ce9178; }
    blockquote { margin: 1rem 0; padding: 0 1rem; border-left: 3px solid var(--blockquote-border); color: var(--muted); font-style: italic; }
    ul, ol { margin: 0.5rem 0 0.5rem 1.5rem; }
    li { margin: 0.25rem 0; }
    li::marker { color: var(--muted); }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.95rem; }
    th, td { border: 1px solid var(--table-border); padding: 0.5rem 0.75rem; text-align: left; }
    th { background-color: var(--th-bg); font-weight: 600; }
    tr:nth-child(even) { background-color: var(--tr-even); }
    hr { border: none; border-top: 1px solid var(--hr-color); margin: 1.5rem 0; }
    p { margin: 0.5rem 0; }
  </style>
</head>
<body>${linkify(processedContent)}</body>
</html>`;

  const file = join(dir, `output-${Date.now()}.html`);
  writeFileSync(file, html);

  let cmd;
  if (process.platform === "win32") {
    cmd = `start "" "${file}"`;
  } else if (process.platform === "darwin") {
    cmd = `open "${file}"`;
  } else {
    cmd = `xdg-open "${file}"`;
  }
  try {
    execSync(cmd, { timeout: 10000 });
    debugLog("Opened:", file);
  } catch (e) {
    debugLog("Failed to open browser:", e.message);
  }
}

export default async ({ client }) => {
  try { appendFileSync(LOG_FILE, `[${new Date().toISOString()}] PLUGIN LOADED v2.0.0 (markdown+theme)\n`); } catch {}

  return {
    "event": async (event) => {
      const e = event.event || event;
      const props = e.properties || {};

      if (e.type === "message.part.updated") {
        const part = props.part;
        if (!part) return;

        if (part.type === "text" && part.text) {
          const messageID = part.messageID || props.sessionID;
          const prev = pendingText.get(messageID) || "";
          pendingText.set(messageID, prev + part.text);
        }

        if (part.reason === "stop" || part.reason === "complete" || part.type === "step-finish") {
          const messageID = part.messageID || props.sessionID;
          const text = pendingText.get(messageID) || part.text;
          if (text && text.trim().length >= 3) {
            debugLog("FINISHED:", messageID, "len=", text.length);
            finishedMessages.push({ id: messageID, text });
            pendingText.delete(messageID);
          }
        }
      }

      if (e.type === "session.idle") {
        if (finishedMessages.length > 0) {
          const last = finishedMessages[finishedMessages.length - 1];
          debugLog("Opening last final output:", last.id, "len=", last.text.length);
          openInBrowser(last.text);
          finishedMessages.length = 0;
        }
      }
    },
  };
};