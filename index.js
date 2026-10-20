import { writeFileSync, readFileSync, mkdirSync, appendFileSync, readdirSync, statSync, unlinkSync } from "fs";
import { execSync } from "child_process";
import { homedir } from "os";
import { join } from "path";

// V2: text blocks are streamed as session.text.delta / session.text.ended.
// Keyed by `${assistantMessageID}#${ordinal}`, with lastKey pointing at the
// most recent block so session.idle can open the final answer.
const texts = new Map();
let lastKey = null;
let openedKey = null;
const dir = join(homedir(), ".cache", "opencode-browser-output");
const LOG_FILE = join(dir, "plugin.log");
const CLAIM_FILE = join(dir, "last-open.json");
const CLAIM_TTL = 15000;
const MAX_FILES = 500;
mkdirSync(dir, { recursive: true });

// OpenCode loads one plugin instance per active location (directory), and every
// instance subscribes to the same global event stream. Cross-instance claim so
// only the first instance opens the browser for a given message.
function claimOpen(key) {
  const payload = JSON.stringify({ key, ts: Date.now() });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      writeFileSync(CLAIM_FILE, payload, { flag: "wx" });
      return true;
    } catch (e) {
      if (e.code !== "EEXIST") return true;
      try {
        const cur = JSON.parse(readFileSync(CLAIM_FILE, "utf8"));
        if (cur.key === key && Date.now() - cur.ts < CLAIM_TTL) return false;
      } catch {}
      try { unlinkSync(CLAIM_FILE); } catch {}
    }
  }
  return true;
}

function debugLog(...args) {
  try { appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${args.join(" ")}\n`); } catch {}
}

function prune() {
  try {
    const files = readdirSync(dir)
      .filter((f) => f.startsWith("output-") && f.endsWith(".html"))
      .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const { f } of files.slice(MAX_FILES)) unlinkSync(join(dir, f));
  } catch {}
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
  const tables = [];
  text = text.replace(/<table>[\s\S]*?<\/table>/g, (m) => {
    const token = `\u0000TABLE${tables.length}\u0000`;
    tables.push(m);
    return token;
  });

  const codeBlocks = [];
  text = text.replace(/```(\w*)[ \t]*\n([\s\S]*?)\n?```/g, (_, lang, code) => {
    const token = `\u0000CODE${codeBlocks.length}\u0000`;
    codeBlocks.push({ lang: lang || "", code: code.trim() });
    return token;
  });

  const anchors = [];
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const token = `\u0000LINK${anchors.length}\u0000`;
    anchors.push(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`);
    return token;
  });
  const urlRegex = /(https?:\/\/[^\s"'<>()*`]+[^\s"'<>),.;:!?*_`])/g;
  text = text.replace(urlRegex, (url) => {
    const token = `\u0000LINK${anchors.length}\u0000`;
    anchors.push(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`);
    return token;
  });

  const blockquotes = [];
  text = text.replace(/^(?:&gt;|>)[ \t]?(.+)$/gm, (_, line) => {
    const token = `\u0000QUOTE${blockquotes.length}\u0000`;
    blockquotes.push(line);
    return token;
  });

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

  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  html = html.replace(/^---\s*$/gm, "<hr>");

  html = html.replace(/^[-*+]\s+(.+)$/gm, '<li class="ul">$1</li>');
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li class="ol">$1</li>');
  html = html.replace(/(?:<li class="ul">.*?<\/li>\n?)+/g, (m) => "<ul>" + m.replace(/\s*class="ul"/g, "").replace(/\n/g, "") + "</ul>");
  html = html.replace(/(?:<li class="ol">.*?<\/li>\n?)+/g, (m) => "<ol>" + m.replace(/\s*class="ol"/g, "").replace(/\n/g, "") + "</ol>");

  html = html.replace(/\n\n+/g, "</p><p>");
  html = "<p>" + html + "</p>";

  html = html.replace(/\u0000LINK(\d+)\u0000/g, (_, i) => anchors[+i]);
  html = html.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => {
    const cb = codeBlocks[+i];
    const cls = cb.lang ? ` class="language-${cb.lang}"` : "";
    return `<pre><code${cls}>${escapeHtml(cb.code)}</code></pre>`;
  });
  html = html.replace(/\u0000QUOTE(\d+)\u0000/g, (_, i) => `<blockquote>${escapeHtml(blockquotes[+i])}</blockquote>`);
  html = html.replace(/\u0000TABLE(\d+)\u0000/g, (_, i) => tables[+i]);

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
    pre { margin: 1rem 0; padding: 1rem; background: var(--code-bg); border: 1px solid var(--table-border); border-radius: 6px; overflow-x: auto; }
    pre code { background: transparent; padding: 0; font-size: 0.85rem; line-height: 1.6; }
    @media (prefers-color-scheme: dark) {
      .language-javascript, .language-js { color: #dcdcaa; }
      .language-typescript, .language-ts { color: #4ec9b0; }
      .language-python, .language-py { color: #9cdcfe; }
      .language-rust, .language-rs { color: #dcdcaa; }
      .language-go { color: #4ec9b0; }
      .language-bash, .language-sh { color: #d4d4d4; }
      .language-json { color: #ce9178; }
      .language-markdown, .language-md { color: #d7ba7d; }
      .language-css { color: #9cdcfe; }
      .language-html, .language-xml { color: #ce9178; }
    }
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
    p:first-child, h1:first-child, h2:first-child, h3:first-child { margin-top: 0; }
  </style>
</head>
<body>${processedContent}</body>
</html>`;

  prune();
  const file = join(dir, `output-${Date.now()}.html`);
  try {
    writeFileSync(file, html);
  } catch (e) {
    debugLog("Failed to write file:", e.code, e.message);
    return;
  }

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

// V2: questions arrive as `form.created` with metadata.kind === "question".
// Fields are Form.Field (string/number/integer/boolean/multiselect/external),
// options are { value, label, description }.
function formToMarkdown(form) {
  const parts = [];
  const title = (form.title || "").trim();
  if (title && title.toLowerCase() !== "questions") parts.push(`## ${title}`);
  for (const f of form.fields || []) {
    if (f.hidden) continue;
    let md = `## ${f.title || f.key}`;
    if (f.description) md += `\n${f.description}`;
    if (Array.isArray(f.options) && f.options.length > 0) {
      md += "\n" + f.options.map((o, i) => `${i + 1}. **${o.label}**${o.description ? " — " + o.description : ""}`).join("\n");
    } else if (f.type === "boolean") {
      md += "\n1. **Да**\n2. **Нет**";
    }
    if (f.type === "multiselect") md += "\n\n_можно выбрать несколько вариантов_";
    if (f.custom) md += "\n\n_можно ввести свой вариант_";
    parts.push(md);
  }
  return parts.join("\n\n");
}

function openQuestion(form) {
  const md = formToMarkdown(form);
  if (!md.trim()) return;
  const msgID = form.metadata?.tool?.messageID;
  const pendingKey = msgID ? [...texts.keys()].find((k) => k.startsWith(msgID + "#")) : null;
  const pending = pendingKey ? texts.get(pendingKey) : "";
  const content = pending && pending.trim().length >= 3 ? pending.trim() + "\n\n" + md : md;
  const openKey = `form#${form.id}`;
  debugLog("QUESTION ASKED:", form.fields?.length, "fields, pending len=", pending.length, "key=", openKey);
  if (!claimOpen(openKey)) {
    debugLog("SKIP open (question) already claimed by another instance:", openKey);
    return;
  }
  // The text shown with the question must not be opened again on step:stop.
  if (pendingKey) openedKey = pendingKey;
  openInBrowser(content);
}

try { appendFileSync(LOG_FILE, `[${new Date().toISOString()}] PLUGIN LOADED v2.2.0 (form.created questions)\n`); } catch {}

export default {
  id: "browser-output",
  setup: async (ctx) => {
    debugLog("SETUP ENTERED (v2)");
    const controller = new AbortController();

    const maybeOpen = (reason) => {
      const text = lastKey ? texts.get(lastKey) : "";
      if (!text || text.trim().length < 3) {
        debugLog("SKIP open (" + reason + ") lastKey=", lastKey);
        return;
      }
      if (lastKey === openedKey) {
        debugLog("SKIP open (" + reason + ") already opened:", lastKey);
        return;
      }
      debugLog("FINISHED (" + reason + "):", lastKey, "len=", text.length);
      openedKey = lastKey;
      if (!claimOpen(lastKey)) {
        debugLog("SKIP open (" + reason + ") already claimed by another instance:", lastKey);
        return;
      }
      openInBrowser(text);
    };

    void (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        const type = event.type;
        const data = event.data || {};

        if (type === "session.text.delta") {
          const id = data.assistantMessageID || data.sessionID;
          const key = `${id}#${data.ordinal}`;
          lastKey = key;
          texts.set(key, (texts.get(key) || "") + (data.delta || ""));
        } else if (type === "session.text.ended") {
          const id = data.assistantMessageID || data.sessionID;
          const key = `${id}#${data.ordinal}`;
          lastKey = key;
          if (typeof data.text === "string" && data.text.length) texts.set(key, data.text);
          debugLog("TEXT ENDED:", key, "len=", (texts.get(key) || "").length);
        } else if (type === "session.step.ended") {
          const finish = data.finish;
          if (finish && finish !== "tool-calls" && finish !== "unknown") {
            maybeOpen("step:" + finish);
          }
        } else if (type === "session.idle") {
          maybeOpen("idle");
          texts.clear();
          lastKey = null;
        } else if (type === "form.created") {
          const form = data.form;
          if (form?.metadata?.kind === "question") {
            openQuestion(form);
          } else {
            debugLog("FORM EVENT (ignored):", form?.title || type);
          }
        } else if (/form|question/.test(type)) {
          debugLog("QUESTION/FORM EVENT:", type, JSON.stringify(data).slice(0, 400));
        }
      }
    })();
    return () => controller.abort();
  },
};