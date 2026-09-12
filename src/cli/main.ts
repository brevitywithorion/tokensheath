import { createInterface } from "node:readline/promises";
import { stdin as stdinStream } from "node:process";
import { loadDiskStore, saveDiskStore } from "./disk-store.ts";
import { FileAudit } from "./file-audit.ts";
import { formatAuditLines } from "../broker/redact.ts";
import { bumpRevokeEpoch } from "./revoke-watch.ts";
import { runMcp } from "./mcp.ts";
import { sheathHome } from "./home.ts";

function usage(): string {
  return `TokenSheath — sheath the token, unsheath only to act.

  sheath onboard     Save one service key (prompted, never printed)
  sheath status      Show nicknames only
  sheath log         Audit log (no secrets)
  sheath revoke --all  Kill live grants in a running sheath mcp
  sheath mcp         MCP stdio server for Cursor / Claude Code

This process is local. There is no cloud. Secrets never go to stdout.
`;
}

async function prompt(q: string): Promise<string> {
  const rl = createInterface({ input: stdinStream, output: process.stderr });
  const ans = await rl.question(q);
  rl.close();
  return ans.trim();
}

async function onboard(): Promise<void> {
  const nickname = (await prompt("Nickname [my service]: ")) || "my service";
  const base = (await prompt("Base URL [https://api.stripe.com]: ")) || "https://api.stripe.com";
  const header = (await prompt("Header name [Authorization]: ")) || "Authorization";
  const template = (await prompt('Header template [Bearer {{key}}]: ')) || "Bearer {{key}}";
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
  process.stderr.write(`Saved ${nickname} at ${sheathHome()}\n`);
  process.stderr.write("Add to Cursor MCP config:\n");
  process.stderr.write(`{
  "mcpServers": {
    "tokensheath": {
      "command": "sheath",
      "args": ["mcp"]
    }
  }
}\n`);
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

async function main(): Promise<void> {
  const [cmd, flag] = process.argv.slice(2);
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
  if (cmd === "revoke" && flag === "--all") {
    bumpRevokeEpoch();
    process.stderr.write("Revoke epoch written. Running sheath mcp will drop live grants.\n");
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
