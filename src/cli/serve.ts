import http from "node:http";
import { GROKBUILD_CONTRACT, SHEATH_PING_PORT } from "../lib/grokbuild-contract.ts";
import { normalizeBaseUrl } from "../broker/origin.ts";
import { presetById, SERVICE_PRESETS } from "../broker/presets.ts";
import { formatAuditLines } from "../broker/redact.ts";
import { saveDiskStore } from "./disk-store.ts";
import { FileAudit } from "./file-audit.ts";
import { localRuntime } from "./local-runtime.ts";
import { openUrl } from "./open-url.ts";

function isLocalHost(host: string): boolean {
  return host.startsWith("127.0.0.1") || host.startsWith("localhost");
}

function readBody(incoming: http.IncomingMessage, limit = 32_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    incoming.on("data", (c) => {
      body += c;
      if (body.length > limit) incoming.destroy();
    });
    incoming.on("end", () => resolve(body));
    incoming.on("error", reject);
  });
}

function send(res: http.ServerResponse, status: number, data: unknown, type = "application/json"): void {
  const body = type.includes("json") ? JSON.stringify(data) : String(data);
  res.writeHead(status, {
    "content-type": `${type}; charset=utf-8`,
    "cache-control": "no-store",
  });
  res.end(body);
}

function uiPage(): string {
  const presets = SERVICE_PRESETS.map(
    (p) => `<option value="${p.id}">${p.label}</option>`,
  ).join("");
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>TokenSheath</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#0c0e12; color:#e8eaed; font-family:"Instrument Sans", "Segoe UI", system-ui, sans-serif; }
  main { max-width: 36rem; margin:0 auto; padding:2.5rem 1.25rem 4rem; }
  .kicker { font-size:11px; letter-spacing:.18em; text-transform:uppercase; color:#8b919a; }
  h1 { font-size:2rem; font-weight:500; letter-spacing:-.03em; margin:.5rem 0 0; }
  p, li { color:#b7bcc4; line-height:1.5; }
  section { margin-top:2rem; padding-top:1.5rem; border-top:1px solid #23262c; }
  h2 { font-size:11px; letter-spacing:.18em; text-transform:uppercase; color:#8b919a; font-weight:500; }
  label { display:block; font-size:12px; color:#8b919a; margin-top:12px; }
  input, select { width:100%; height:2.75rem; margin-top:4px; border-radius:8px; border:1px solid #2a2e36;
    background:#12151b; color:#e8eaed; padding:0 12px; font:inherit; box-sizing:border-box; }
  button { height:2.75rem; border-radius:8px; border:0; background:#e8eaed; color:#0c0e12; font:inherit; cursor:pointer; padding:0 1rem; }
  button.ghost { background:transparent; color:#e8eaed; border:1px solid #2a2e36; }
  .row { display:flex; gap:.5rem; margin-top:1rem; flex-wrap:wrap; }
  pre { background:#12151b; border:1px solid #23262c; padding:1rem; border-radius:12px; overflow:auto; font-size:12px; color:#b7bcc4; white-space:pre-wrap; }
  .ok { color:#9fe6c3; }
  .err { color:#ffb4a8; }
</style>
<body>
<main>
  <p class="kicker">TokenSheath · secret place</p>
  <h1>Keys stay here. Agents ping. They never see them.</h1>
  <p>Add a service. Anything that talks to TokenSheath asks you first. The model gets the result, not the key.</p>

  <section>
    <h2>Saved</h2>
    <p id="status">Loading…</p>
  </section>

  <section>
    <h2>Add a service</h2>
    <label>What is it
      <select id="preset">${presets}<option value="custom">Something else</option></select>
    </label>
    <label>Nickname
      <input id="nickname" value="Stripe"/>
    </label>
    <label id="url-wrap" style="display:none">Website of the API
      <input id="base" placeholder="https://api.example.com"/>
    </label>
    <label>Secret (never shown to the agent)
      <input id="key" type="password" autocomplete="off"/>
    </label>
    <div class="row">
      <button id="save" type="button">Save</button>
    </div>
    <p id="save-msg"></p>
  </section>

  <section>
    <h2>Give this to Grok Build</h2>
    <p>Paste it into a Grok Build chat. The agent will ping this machine instead of asking for keys.</p>
    <div class="row">
      <button id="copy" type="button">Copy contract</button>
    </div>
    <pre id="contract"></pre>
  </section>
</main>
<script>
const presetMeta = ${JSON.stringify(SERVICE_PRESETS)};
const contract = ${JSON.stringify(GROKBUILD_CONTRACT)};
document.getElementById("contract").textContent = contract;
const preset = document.getElementById("preset");
const nickname = document.getElementById("nickname");
const urlWrap = document.getElementById("url-wrap");
const base = document.getElementById("base");
function applyPreset() {
  const p = presetMeta.find((x) => x.id === preset.value);
  urlWrap.style.display = p ? "none" : "block";
  if (p) nickname.value = p.nickname;
}
preset.addEventListener("change", applyPreset);
applyPreset();
async function refresh() {
  const r = await fetch("/v1/status");
  const j = await r.json();
  const el = document.getElementById("status");
  if (!j.services || !j.services.length) el.textContent = "Nothing saved yet.";
  else el.textContent = j.services.map((s) => s.nickname + " · " + (s.extra || "")).join("\\n");
}
refresh();
document.getElementById("save").onclick = async () => {
  const msg = document.getElementById("save-msg");
  const body = { preset: preset.value, nickname: nickname.value, base_url: base.value, key: document.getElementById("key").value };
  const r = await fetch("/v1/services", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  document.getElementById("key").value = "";
  msg.className = j.ok ? "ok" : "err";
  msg.textContent = j.ok ? "Saved. Agents can ping now." : (j.message || "Could not save.");
  refresh();
};
document.getElementById("copy").onclick = async () => {
  await navigator.clipboard.writeText(contract);
  document.getElementById("copy").textContent = "Copied";
};
</script>
</body>
</html>`;
}

export async function runServe(port = SHEATH_PING_PORT): Promise<void> {
  const { store, runtime } = await localRuntime("agent");
  const server = http.createServer(async (incoming, res) => {
    const host = incoming.headers.host ?? "";
    if (!isLocalHost(host)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const url = new URL(incoming.url ?? "/", "http://127.0.0.1");
    try {
      if (incoming.method === "GET" && url.pathname === "/") {
        send(res, 200, uiPage(), "text/html");
        return;
      }
      if (incoming.method === "GET" && (url.pathname === "/grokbuild.md" || url.pathname === "/v1/contract")) {
        send(res, 200, GROKBUILD_CONTRACT, "text/markdown");
        return;
      }
      if (incoming.method === "GET" && url.pathname === "/v1/status") {
        send(res, 200, { ok: true, services: store.publicCreds(), ping: "/v1/request" });
        return;
      }
      if (incoming.method === "GET" && url.pathname === "/v1/log") {
        send(res, 200, { ok: true, log: formatAuditLines(FileAudit.loadRecent(80), store.secrets()) });
        return;
      }
      if (incoming.method === "POST" && url.pathname === "/v1/services") {
        const raw = JSON.parse((await readBody(incoming)) || "{}") as {
          preset?: string;
          nickname?: string;
          base_url?: string;
          key?: string;
        };
        const preset = presetById(raw.preset);
        const baseRaw = preset?.base_url || raw.base_url || "";
        const norm = normalizeBaseUrl(baseRaw);
        if (!norm.ok) {
          send(res, 400, { ok: false, error: "origin_denied", message: "Need a full https website for the API." });
          return;
        }
        const key = (raw.key ?? "").trim();
        if (!key) {
          send(res, 400, { ok: false, error: "missing_key", message: "Paste the secret here, not in the chat." });
          return;
        }
        store.upsertStatic({
          nickname: (raw.nickname || preset?.nickname || "my service").trim(),
          header_name: preset?.header_name || "Authorization",
          header_template: preset?.header_template || "Bearer {{key}}",
          base_url: norm.url.origin,
          key,
        });
        await saveDiskStore(store);
        send(res, 200, { ok: true, nickname: store.staticKey()?.nickname, origin: norm.url.origin });
        return;
      }
      if (incoming.method === "POST" && url.pathname === "/v1/request") {
        const raw = JSON.parse((await readBody(incoming)) || "{}") as {
          method?: string;
          path?: string;
          json?: unknown;
        };
        const result = await runtime.invoke("static.request", {
          method: raw.method ?? "GET",
          path: raw.path,
          json: raw.json,
        });
        send(res, result.ok ? 200 : 400, result);
        return;
      }
      res.writeHead(404);
      res.end();
    } catch (err) {
      send(res, 400, {
        ok: false,
        error: "bad_request",
        message: err instanceof Error ? err.message : "bad request",
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  const url = `http://127.0.0.1:${port}/`;
  process.stderr.write(`TokenSheath is open. Agents ping POST ${url}v1/request\n`);
  openUrl(url);
}
