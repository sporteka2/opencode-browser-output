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
  return s.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, """);
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

function linkify(text) {
  const urlRegex = /(https?:\/\/[^\s"'<>()]+[^\s"'<>),.;:!?])/g;
  return escapeHtml(text).replace(urlRegex, (url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`);
}

function openInBrowser(content) {
  if (!content || content.trim().length < 3) return;

  const processedContent = markdownTableToHtml(content);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>OpenCode Output</title>
  <style>
    body { font-family: sans-serif; padding: 1rem; white-space: pre-wrap; line-height: 1.6; }
    a { color: #06c; }
    a:hover { text-decoration: underline; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; }
    th { background-color: #f5f5f5; }
    tr:nth-child(even) { background-color: #fafafa; }
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
  try { appendFileSync(LOG_FILE, `[${new Date().toISOString()}] PLUGIN LOADED\n`); } catch {}

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