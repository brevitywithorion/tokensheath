import assert from "node:assert/strict";
import test from "node:test";
import { buildIntent, grantCovers, requestFingerprint } from "./policy.ts";
import { MemoryStore } from "./store.ts";
import { demoStaticKey } from "./mock/static.ts";

function staticCred() {
  const store = new MemoryStore();
  return store.upsertStatic({
    nickname: "stripe test",
    header_name: "Authorization",
    header_template: "Bearer {{key}}",
    base_url: "https://api.stripe.com",
    key: demoStaticKey(),
  });
}

test("buildIntent default-denies unknown tools and foreign hosts", () => {
  const cred = staticCred();
  const unknown = buildIntent("shell.exec", {}, cred);
  assert.equal("error" in unknown, true);
  const steal = buildIntent("static.request", { method: "GET", path: "https://evil.example/x" }, cred);
  assert.equal("error" in steal, true);
  if ("error" in steal) assert.equal(steal.error, "origin_denied");
  const ok = buildIntent("static.request", { method: "GET", path: "/v1/balance" }, cred);
  assert.equal("error" in ok, false);
});

test("POST body is part of the fingerprint", () => {
  const a = requestFingerprint({
    tool: "static.request",
    method: "POST",
    url: "https://api.stripe.com/v1/charges",
    body: { amount: 2000 },
  });
  const b = requestFingerprint({
    tool: "static.request",
    method: "POST",
    url: "https://api.stripe.com/v1/charges",
    body: { amount: 5000 },
  });
  assert.notEqual(a, b);
});

test("read grant never covers a write even on the same origin", () => {
  const cred = staticCred();
  const get = buildIntent("static.request", { method: "GET", path: "/v1/balance" }, cred);
  if ("error" in get) throw new Error(get.message);
  const grant = {
    id: "grn_1",
    cred_id: cred.id,
    tool: "static.request",
    scope: "read" as const,
    mode: "session" as const,
    expires_at: Date.now() + 60_000,
    max_calls: 20,
    calls_used: 0,
    session_id: "s",
    origin: get.origin,
    fingerprint: "",
  };
  const post = buildIntent(
    "static.request",
    { method: "POST", path: "/v1/charges", json: { amount: 1 } },
    cred,
  );
  if ("error" in post) throw new Error(post.message);
  assert.equal(grantCovers(grant, get), true);
  assert.equal(grantCovers(grant, post), false);
});
