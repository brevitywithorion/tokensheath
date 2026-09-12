import { existsSync, readFileSync, watch, writeFileSync } from "node:fs";
import type { GrantStore } from "../broker/grants.ts";
import { revokePath } from "./home.ts";

export function bumpRevokeEpoch(): void {
  writeFileSync(revokePath(), `${Date.now()}\n`, { encoding: "utf8", mode: 0o600 });
}

export function watchRevoke(grants: GrantStore, onRevoke: () => void): void {
  const path = revokePath();
  if (!existsSync(path)) writeFileSync(path, "0\n", { encoding: "utf8", mode: 0o600 });
  let last = readFileSync(path, "utf8").trim();
  watch(path, () => {
    try {
      const now = readFileSync(path, "utf8").trim();
      if (now && now !== last) {
        last = now;
        grants.revokeAll();
        onRevoke();
      }
    } catch {
      /* ignore torn reads */
    }
  });
}
