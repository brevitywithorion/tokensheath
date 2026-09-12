import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDiskStore, saveDiskStore } from "./disk-store.ts";
import { bumpRevokeEpoch } from "./revoke-watch.ts";
import { revokePath, storePath } from "./home.ts";

test("disk store round-trips a static key without writing it in plaintext", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sheath-"));
  process.env.SHEATH_HOME = dir;
  const store = await loadDiskStore();
  store.upsertStatic({
    nickname: "demo",
    header_name: "Authorization",
    header_template: "Bearer {{key}}",
    base_url: "https://api.stripe.com",
    key: "sk_test_" + "z".repeat(24),
  });
  await saveDiskStore(store);
  const blob = readFileSync(storePath(), "utf8");
  assert.equal(blob.includes("sk_test_"), false);
  const loaded = await loadDiskStore();
  assert.equal(loaded.staticKey()?.nickname, "demo");
  assert.equal(loaded.staticKey()?.key.startsWith("sk_test_"), true);
  bumpRevokeEpoch();
  assert.match(readFileSync(revokePath(), "utf8"), /\d+/);
  delete process.env.SHEATH_HOME;
});
