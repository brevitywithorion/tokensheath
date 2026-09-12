import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

export function sheathHome(): string {
  return process.env.SHEATH_HOME?.trim() || join(homedir(), ".tokensheath");
}

export function ensureHome(): string {
  const dir = sheathHome();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function keyPath(): string {
  return join(ensureHome(), "master.key");
}

export function storePath(): string {
  return join(ensureHome(), "store.json.enc");
}

export function auditPath(): string {
  return join(ensureHome(), "audit.jsonl");
}

export function revokePath(): string {
  return join(ensureHome(), "revoke.epoch");
}
