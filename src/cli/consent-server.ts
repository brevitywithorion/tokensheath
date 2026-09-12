import http from "node:http";
import type { AddressInfo } from "node:net";
import { CONSENT_TIMEOUT_MS, type ConsentChoice, type ConsentRequest } from "../broker/types.ts";
import { openUrl } from "./open-url.ts";

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&" + "amp;")
    .replaceAll("<", "&" + "lt;")
    .replaceAll(">", "&" + "gt;")
    .replaceAll('"', "&" + "quot;");
}

function actionLine(req: ConsentRequest): string {
  const p = req.preview;
  if (p.kind === "static") return `${p.method} ${p.url}`;
  if (p.kind === "github_comment") return `Comment on ${p.owner}/${p.repo}#${p.issue_number}`;
  return req.toolLabel;
}

function page(req: ConsentRequest): string {
  const write = req.risk !== "read";
  const preview =
    req.preview.kind === "github_comment"
      ? `<pre>${escapeHtml(req.preview.body)}</pre>`
      : req.preview.kind === "static" && req.preview.json != null
        ? `<pre>${escapeHtml(JSON.stringify(req.preview.json, null, 2))}</pre>`
        : "";
  const sessionBtn = write
    ? ""
    : `<button name="choice" value="allow_session">Allow reads this session</button>`;
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>TokenSheath — approval</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; min-height:100dvh; display:flex; align-items:flex-end; justify-content:center;
    background:rgba(0,0,0,.55); font-family: "Instrument Sans", "Segoe UI", system-ui, sans-serif; }
  @media (min-width: 640px) { body { align-items:center; } }
  .card { width:min(28rem,100%); background:#f4f0e8; color:#161513; border-radius:28px; padding:1.5rem;
    box-shadow: 0 24px 80px rgba(0,0,0,.45); }
  .kicker { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#5c5852; display:flex; justify-content:space-between; }
  h1 { font-size:1.5rem; font-weight:500; letter-spacing:-.03em; line-height:1.2; margin:.75rem 0 1rem; }
  dl { display:grid; grid-template-columns:6.5rem 1fr; gap:.4rem 0.75rem; font-size:.9rem; margin:0; }
  dt { color:#5c5852; }
  dd { margin:0; overflow-wrap:anywhere; }
  p.note { color:#5c5852; font-size:.9rem; }
  pre { background:rgba(22,21,19,.06); padding:1rem; border-radius:12px; white-space:pre-wrap; font-size:12px; }
  form { display:grid; gap:.5rem; margin-top:1.25rem; grid-template-columns: ${write ? "1fr 1fr" : "1fr 1fr 1fr"}; }
  button { height:2.75rem; border-radius:8px; border:1px solid rgba(22,21,19,.15); background:transparent; cursor:pointer; font:inherit; }
  button[value="deny"] { color:#5c5852; }
  button[value="allow_once"] { ${write ? "background:#161513;color:#f4f0e8;border-color:#161513;" : ""} }
  button[value="allow_session"] { background:#161513;color:#f4f0e8;border-color:#161513; }
</style>
<body>
  <div class="card">
    <div class="kicker"><span>Agent approval required</span><span>${escapeHtml(req.risk)}</span></div>
    <h1>${escapeHtml(actionLine(req))}</h1>
    <dl>
      <dt>Who</dt><dd>${escapeHtml(req.agentName)}</dd>
      <dt>What</dt><dd>${escapeHtml(req.toolLabel)}</dd>
      <dt>Where</dt><dd>${escapeHtml(req.preview.kind === "static" ? req.preview.url : req.credNickname)}</dd>
      <dt>Credential</dt><dd>${escapeHtml(req.credNickname)} · never shown</dd>
    </dl>
    ${preview}
    <p class="note">${
      write
        ? "Every write needs its own approval. The agent does not receive the key."
        : "Allow once = this request only. Allow reads this session = later reads skip the prompt. Writes still ask."
    }</p>
    <form method="POST" action="/decide">
      <input type="hidden" name="nonce" value="${escapeHtml(req.nonce)}"/>
      <button name="choice" value="deny">Deny</button>
      <button name="choice" value="allow_once">Allow once</button>
      ${sessionBtn}
    </form>
  </div>
</body>
</html>`;
}

export function requestConsentBrowser(req: ConsentRequest, agentHint = "MCP client"): Promise<ConsentChoice | "timeout"> {
  req.agentName = req.agentName || agentHint;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (choice: ConsentChoice | "timeout") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      resolve(choice);
    };
    const server = http.createServer((incoming, res) => {
      const host = incoming.headers.host ?? "";
      if (!host.startsWith("127.0.0.1") && !host.startsWith("localhost")) {
        res.writeHead(403);
        res.end();
        return;
      }
      const url = new URL(incoming.url ?? "/", "http://127.0.0.1");
      if (incoming.method === "GET" && url.pathname === "/consent") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(page(req));
        return;
      }
      if (incoming.method === "POST" && url.pathname === "/decide") {
        let body = "";
        incoming.on("data", (c) => {
          body += c;
          if (body.length > 4000) incoming.destroy();
        });
        incoming.on("end", () => {
          const params = new URLSearchParams(body);
          if (params.get("nonce") !== req.nonce) {
            res.writeHead(400);
            res.end("bad nonce");
            return;
          }
          const choice = params.get("choice");
          const ok =
            choice === "deny" || choice === "allow_once" || choice === "allow_session" ? choice : null;
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          res.end(
            `<!doctype html><meta charset="utf-8"/><title>TokenSheath</title><body style="font-family:system-ui;background:#0c0e12;color:#e8eaed;padding:2rem">Saved. You can close this tab.</body>`,
          );
          if (ok) finish(ok);
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
    const timer = setTimeout(() => finish("timeout"), CONSENT_TIMEOUT_MS);
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      const url = `http://127.0.0.1:${port}/consent`;
      process.stderr.write(`TokenSheath: approval required\n${url}\n`);
      openUrl(url);
    });
  });
}
