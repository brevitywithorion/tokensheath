import { createInterface } from "node:readline/promises";
import { stdin as stdinStream } from "node:process";
import { loadDiskStore, saveDiskStore } from "./disk-store.ts";
import { FileAudit } from "./file-audit.ts";
import { formatAuditLines } from "../broker/redact.ts";
import { bumpRevokeEpoch } from "./revoke-watch.ts";
import { runMcp } from "./mcp.ts";
import { sheathHome } from "./home.ts";
import { BrokerRuntime } from "../broker/runtime.ts";
import { GrantStore } from "../broker/grants.ts";
import { requestConsentBrowser } from "./consent-server.ts";
import { normalizeBaseUrl } from "../broker/origin.ts";
import { runServe } from "./serve.ts";
import { SHEATH_PING_PORT } from "../lib/grokbuild-contract.ts";
import { missingCredMessage } from "../broker/store.ts";

function usage(): string {
  return `TokenSheath — sheath the token, unsheath only to act.

  sheath onboard              Save one service key (prompted, never printed)
  sheath status               Show nicknames only
  sheath serve                Window: add a key, copy Grok Build contract
  sheath call GET /todos/1    One request — opens an approval tab
  sheath log                  Audit log (no secrets)
  sheath revoke --all         Kill live grants
  sheath mcp                  MCP stdio (Cursor / Claude Code later)

This process is local. There is no cloud. Secrets never go to stdout.
`;
}

async function prompt(q: string): Promise<string> {
  const rl = createInterface({ input: stdinStream, output: process.stderr });
  const ans = await rl.question(q);
  rl.close();
  return ans.trim();
}

function windowsMcpHint(): string {
  const home = process.env.USERPROFILE || process.env.HOME || "C:\\\\Users\\\\YOU";
  const path = `${home}\\tokensheath\\bin\\sheath.mjs`.replaceAll("\\", "\\\\");
  return `{
  "mcpServers": {
    "tokensheath": {
      "command": "node",
      "args": ["${path}", "mcp"]
    }
  }
}
`;
}

async function onboard(): Promise<void> {
  const nickname = (await prompt("Nickname [my service]: ")) || "my service";
  const baseRaw = (await prompt("Base URL [https://jsonplaceholder.typicode.com]: ")) || "https://jsonplaceholder.typicode.com";
  const baseNorm = normalizeBaseUrl(baseRaw);
  if (!baseNorm.ok) {
    process.stderr.write(`${baseNorm.message} Use a full URL like https://jsonplaceholder.typicode.com\n`);
    process.exit(1);
  }
  const base = baseNorm.url.origin;
  const header = (await prompt("Header name [Authorization]: ")) || "Authorization";
  const template = (await prompt("Header template [Bearer {{key}}]: ")) || "Bearer {{key}}";
  const key = await prompt("Key (never shown to the model): ");
  if (!key) {
    process.stderr.write("No key. Aborted.\n");
    process.exit(1);
  }
  const store = await loadDiskStore();
  store.upsertStatic({
    nickname,
    header_name: header,
    header_template: template,
    base_url: base,
    key,
  });
  await saveDiskStore(store);
  process.stderr.write(`Saved ${nickname} → ${base} at ${sheathHome()}\n`);
  process.stderr.write("Try a request (no Cursor needed):\n");
  process.stderr.write("  node bin/sheath.mjs call GET /todos/1\n");
  process.stderr.write("Or open the window:\n");
  process.stderr.write("  node bin/sheath.mjs serve\n");
  process.stderr.write("Later, Cursor MCP config:\n");
  process.stderr.write(windowsMcpHint());
}

async function status(): Promise<void> {
  const store = await loadDiskStore();
  const creds = store.publicCreds();
  if (!creds.length) {
    process.stderr.write("No credentials. Run: sheath onboard\n");
    return;
  }
  for (const c of creds) {
    process.stderr.write(`${c.nickname}  ${c.kind}  ${c.extra}\n`);
  }
}

async function log(): Promise<void> {
  const store = await loadDiskStore();
  const events = FileAudit.loadRecent(80);
  process.stdout.write(`${formatAuditLines(events, store.secrets())}\n`);
}

function parseJsonFlag(argv: string[]): unknown {
  const i = argv.indexOf("--json");
  if (i === -1) return undefined;
  const raw = argv[i + 1];
  if (!raw) return undefined;
  return JSON.parse(raw);
}

function parseNamed(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i === -1) return undefined;
  return argv[i + 1];
}

async function call(argv: string[]): Promise<void> {
  const method = (argv[0] ?? "GET").toUpperCase();
  const path = argv[1];
  if (!path || !path.startsWith("/")) {
    process.stderr.write("Usage: sheath call GET /todos/1 [--service Name]\n");
    process.exit(1);
  }
  const json = parseJsonFlag(argv);
  const service = parseNamed(argv, "--service");
  const store = await loadDiskStore();
  if (!store.staticKey(service)) {
    process.stderr.write(`${missingCredMessage(store, "static.request", service)}\n`);
    process.exit(1);
  }
  const grants = new GrantStore();
  const audit = new FileAudit();
  const runtime = new BrokerRuntime({
    store,
    grants,
    audit,
    agentName: "PowerShell",
    githubFetch: fetch,
    staticFetch: fetch,
    hooks: {
      requestConsent: (req) => requestConsentBrowser(req, "PowerShell"),
      requestGithubReconnect: async () => false,
    },
  });
  process.stderr.write("Approval tab opening — Allow once.\n");
  const result = await runtime.invoke("static.request", { method, path, json, service });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const [cmd, flag] = argv;
  if (!cmd || cmd === "-h" || cmd === "--help") {
    process.stderr.write(usage());
    return;
  }
  if (cmd === "onboard") {
    await onboard();
    return;
  }
  if (cmd === "status") {
    await status();
    return;
  }
  if (cmd === "log") {
    await log();
    return;
  }
  if (cmd === "call") {
    await call(argv.slice(1));
    return;
  }
  if (cmd === "serve") {
    const port = Number(process.env.SHEATH_PORT) || SHEATH_PING_PORT;
    await runServe(port);
    return;
  }
  if (cmd === "revoke" && flag === "--all") {
    bumpRevokeEpoch();
    process.stderr.write("Revoke epoch written.\n");
    return;
  }
  if (cmd === "mcp") {
    await runMcp();
    return;
  }
  process.stderr.write(usage());
  process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : "failed"}\n`);
  process.exit(1);
});
