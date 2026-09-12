import assert from "node:assert/strict";
import test from "node:test";
import { AuditLog } from "./audit.ts";
import { MemoryStore } from "./store.ts";

test("audit formatter never prints store secrets", async () => {
  const store = new MemoryStore();
  const token = "gho_" + "s".repeat(36);
  const key = "sk_test_" + "k".repeat(24);
  store.upsertGithub({
    nickname: "demo-user",
    account_login: "demo-user",
    access_token: token,
    token_type: "bearer",
  });
  store.upsertStatic({
    nickname: "stripe",
    header_name: "Authorization",
    header_template: "Bearer {{key}}",
    base_url: "https://api.stripe.com",
    key,
  });
  const audit = new AuditLog();
  audit.append({
    tool: "github.notifications.list",
    cred_id: store.github()!.id,
    ticket: "tkt_demo",
    decision: "allow_once",
    http_status: 200,
    detail: "GET /notifications",
  });
  const text = audit.format(store.secrets());
  assert.equal(text.includes(token), false);
  assert.equal(text.includes(key), false);
  assert.match(text, /GET \/notifications/);
});
