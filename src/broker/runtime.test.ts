import assert from "node:assert/strict";
import test from "node:test";
import { BrokerRuntime } from "./runtime.ts";
import { MemoryStore } from "./store.ts";
import { createMockGithubFetch, createMockGithubState, demoGithubToken } from "./mock/github.ts";
import { createMockStaticFetch, demoStaticKey } from "./mock/static.ts";
import type { ConsentChoice } from "./types.ts";

function setup(choice: ConsentChoice | (() => ConsentChoice) = "allow_once") {
  const store = new MemoryStore();
  const ghState = createMockGithubState();
  store.upsertGithub({
    nickname: ghState.login,
    account_login: ghState.login,
    access_token: demoGithubToken(),
    token_type: "bearer",
  });
  store.upsertStatic({
    nickname: "stripe test",
    header_name: "Authorization",
    header_template: "Bearer {{key}}",
    base_url: "https://api.stripe.com",
    key: demoStaticKey(),
  });
  let reconnects = 0;
  const runtime = new BrokerRuntime({
    store,
    githubFetch: createMockGithubFetch(ghState),
    staticFetch: createMockStaticFetch(demoStaticKey()),
    agentName: "Cursor",
    sessionId: "ses_test",
    hooks: {
      requestConsent: async () => (typeof choice === "function" ? choice() : choice),
      requestGithubReconnect: async () => {
        reconnects += 1;
        ghState.force401 = false;
        store.upsertGithub({
          nickname: ghState.login,
          account_login: ghState.login,
          access_token: demoGithubToken(),
          token_type: "bearer",
        });
        return true;
      },
    },
  });
  return { runtime, store, ghState, reconnects: () => reconnects };
}

test("missing cred fails closed without a token prompt", async () => {
  const store = new MemoryStore();
  const runtime = new BrokerRuntime({
    store,
    githubFetch: async () => new Response("{}", { status: 500 }),
    staticFetch: async () => new Response("{}", { status: 500 }),
    hooks: {
      requestConsent: async () => "allow_session",
      requestGithubReconnect: async () => false,
    },
  });
  const res = await runtime.invoke("github.notifications.list");
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error, "missing_cred");
});

test("github 401 triggers reconnect then retries", async () => {
  const { runtime, ghState, reconnects } = setup("allow_session");
  ghState.force401 = true;
  const res = await runtime.invoke("github.notifications.list", { per_page: 5 });
  assert.equal(res.ok, true);
  assert.equal(reconnects(), 1);
});

test("session read grant skips a second consent; write still asks", async () => {
  let consents = 0;
  const { runtime } = setup(() => {
    consents += 1;
    return "allow_session";
  });
  const a = await runtime.invoke("github.notifications.list");
  const b = await runtime.invoke("github.issues.search", { q: "open" });
  const c = await runtime.invoke("github.issues.comment", {
    owner: "acme",
    repo: "broker",
    issue_number: 12,
    body: "Looks good — shipping the redactor.",
  });
  const d = await runtime.invoke("github.issues.comment", {
    owner: "acme",
    repo: "broker",
    issue_number: 12,
    body: "Second comment should prompt again.",
  });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(c.ok, true);
  assert.equal(d.ok, true);
  assert.equal(consents, 3);
});

test("unknown tool is default-deny before consent", async () => {
  let consents = 0;
  const { runtime } = setup(() => {
    consents += 1;
    return "allow_once";
  });
  const res = await runtime.invoke("shell.exec", { cmd: "cat ~/.tokensheath" });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error, "unknown_tool");
  assert.equal(consents, 0);
});

test("once grant does not cover a different request", async () => {
  let consents = 0;
  const { runtime } = setup(() => {
    consents += 1;
    return "allow_once";
  });
  const a = await runtime.invoke("static.request", { method: "GET", path: "/v1/balance" });
  const b = await runtime.invoke("static.request", { method: "GET", path: "/v1/charges" });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(consents, 2);
});

test("named service is required when two keys are saved", async () => {
  let consents = 0;
  const { runtime, store } = setup(() => {
    consents += 1;
    return "allow_once";
  });
  store.upsertStatic({
    nickname: "OpenAI",
    header_name: "Authorization",
    header_template: "Bearer {{key}}",
    base_url: "https://api.openai.com",
    key: "sk-demo",
  });
  const none = await runtime.invoke("static.request", { method: "GET", path: "/v1/balance" });
  assert.equal(none.ok, false);
  if (!none.ok) assert.equal(none.error, "missing_cred");
  const byName = await runtime.invoke("static.request", {
    method: "GET",
    path: "/v1/balance",
    service: "stripe test",
  });
  assert.equal(byName.ok, true);
  assert.equal(consents, 1);
});

test("session read is limited to the approved path prefix", async () => {
  let consents = 0;
  const { runtime } = setup(() => {
    consents += 1;
    return "allow_session";
  });
  const a = await runtime.invoke("static.request", { method: "GET", path: "/v1/balance" });
  const b = await runtime.invoke("static.request", { method: "GET", path: "/v1/charges" });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(consents, 2);
});
