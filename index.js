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

function linkify(text) {
  const urlRegex = /(https?:\/\/[^\s"'<>()]+[^\s"'<>),.;:!?])/g;
  return escapeHtml(text).replace(urlRegex, (url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`);
}

function openInBrowser(content) {
  if (!content || content.trim().length < 3) return;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>OpenCode Output</title>
  <style>
    body { font-family: sans-serif; padding: 2rem; white-space: pre-wrap; line-height: 1.6; }
    a { color: #06c; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>${linkify(content)}</body>
</html>`;

  const file = join(dir, `output-${Date.now()}.html`);
  writeFileSync(file, html);

  let cmd;
  if (process.platform === "win32") {
    cmd = `start "" "${file}"`;
  } else if (process.platform === "darwin") {
    cmd = `open -n "${file}"`;
  } else {
    const firefox = ["/usr/bin/firefox-bin", "firefox", "firefox-dev"].find((b) =>
      b.includes("/") ? require("fs").existsSync(b) : require("child_process").execSync(`which ${b}`).toString().trim(),
    );
    if (firefox) {
      cmd = `"${firefox}" --new-window "file://${file}"`;
    } else {
      cmd = `xdg-open "${file}"`;
    }
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

        // Собираем текст ассистента по сообщению (части типа "text")
        if (part.type === "text" && part.text) {
          const messageID = part.messageID || props.sessionID;
          const prev = pendingText.get(messageID) || "";
          pendingText.set(messageID, prev + part.text);
        }

        // Завершение шага — запоминаем финальный текст сообщения
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

      // Сессия завершена — открываем ТОЛЬКО последний финальный вывод
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