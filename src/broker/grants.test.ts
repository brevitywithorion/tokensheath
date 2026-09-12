import assert from "node:assert/strict";
import test from "node:test";
import { GrantStore, isReadTool } from "./grants.ts";
import { requestFingerprint, type RequestIntent } from "./policy.ts";

function intent(partial: Partial<RequestIntent> & Pick<RequestIntent, "tool" | "method" | "url">): RequestIntent {
  const fingerprint =
    partial.fingerprint ??
    requestFingerprint({
      tool: partial.tool,
      method: partial.method,
      url: partial.url,
      body: partial.body,
    });
  return {
    credId: partial.credId ?? "c1",
    origin: partial.origin ?? new URL(partial.url).origin,
    path: partial.path ?? new URL(partial.url).pathname,
    read: partial.read ?? partial.method === "GET",
    fingerprint,
    body: partial.body,
    tool: partial.tool,
    method: partial.method,
    url: partial.url,
  };
}

test("allow-once does not authorize a second call", () => {
  const g = new GrantStore();
  const i = intent({
    tool: "github.notifications.list",
    method: "GET",
    url: "https://api.github.com/notifications",
  });
  const grant = g.create({
    sessionId: "s1",
    credId: "c1",
    tool: i.tool,
    mode: "once",
    origin: i.origin,
    fingerprint: i.fingerprint,
    method: i.method,
  });
  g.consume(grant);
  assert.equal(g.find("s1", i), undefined);
});

test("session read grant covers other GitHub reads but not comments", () => {
  const g = new GrantStore();
  const list = intent({
    tool: "github.notifications.list",
    method: "GET",
    url: "https://api.github.com/notifications",
  });
  g.create({
    sessionId: "s1",
    credId: "c1",
    tool: list.tool,
    mode: "session",
    origin: list.origin,
    fingerprint: list.fingerprint,
    method: "GET",
  });
  const search = intent({
    tool: "github.issues.search",
    method: "GET",
    url: "https://api.github.com/search/issues?q=open",
  });
  const comment = intent({
    tool: "github.issues.comment",
    method: "POST",
    url: "https://api.github.com/repos/acme/tokensheath/issues/12/comments",
    body: { body: "hi" },
    read: false,
  });
  assert.ok(g.find("s1", search));
  assert.equal(g.find("s1", comment), undefined);
  assert.equal(isReadTool("github.issues.comment"), false);
});

test("session grant on static GET does not cover POST", () => {
  const g = new GrantStore();
  const get = intent({
    tool: "static.request",
    method: "GET",
    url: "https://api.stripe.com/v1/balance",
  });
  g.create({
    sessionId: "s1",
    credId: "c1",
    tool: "static.request",
    mode: "session",
    method: "GET",
    origin: get.origin,
    fingerprint: get.fingerprint,
  });
  const post = intent({
    tool: "static.request",
    method: "POST",
    url: "https://api.stripe.com/v1/charges",
    body: { amount: 2000 },
    read: false,
  });
  assert.ok(g.find("s1", get));
  assert.equal(g.find("s1", post), undefined);
});

test("session grant is origin-bound", () => {
  const g = new GrantStore();
  const stripe = intent({
    tool: "static.request",
    method: "GET",
    url: "https://api.stripe.com/v1/balance",
  });
  g.create({
    sessionId: "s1",
    credId: "c1",
    tool: "static.request",
    mode: "session",
    method: "GET",
    origin: stripe.origin,
    fingerprint: stripe.fingerprint,
  });
  const foreign = intent({
    tool: "static.request",
    method: "GET",
    url: "https://evil.example/steal",
  });
  assert.equal(g.find("s1", foreign), undefined);
});

test("once grant is fingerprint-bound", () => {
  const g = new GrantStore();
  const balance = intent({
    tool: "static.request",
    method: "GET",
    url: "https://api.stripe.com/v1/balance",
  });
  g.create({
    sessionId: "s1",
    credId: "c1",
    tool: "static.request",
    mode: "once",
    method: "GET",
    origin: balance.origin,
    fingerprint: balance.fingerprint,
  });
  const other = intent({
    tool: "static.request",
    method: "GET",
    url: "https://api.stripe.com/v1/charges",
  });
  assert.ok(g.find("s1", balance));
  assert.equal(g.find("s1", other), undefined);
});

test("ticket cannot be reused or rebound", () => {
  const g = new GrantStore();
  const i = intent({
    tool: "static.request",
    method: "GET",
    url: "https://api.stripe.com/v1/balance",
  });
  const grant = g.create({
    sessionId: "s1",
    credId: "c1",
    tool: i.tool,
    mode: "once",
    origin: i.origin,
    fingerprint: i.fingerprint,
    method: i.method,
  });
  const ticket = g.issueTicket(grant, i);
  assert.ok(g.takeTicket(ticket.id, i));
  assert.equal(g.takeTicket(ticket.id, i), undefined);
  const other = intent({
    tool: "static.request",
    method: "GET",
    url: "https://api.stripe.com/v1/customers",
  });
  const t2 = g.issueTicket(grant, i);
  assert.equal(g.takeTicket(t2.id, other), undefined);
});

test("revoke --all makes existing grants unusable", () => {
  const g = new GrantStore();
  const i = intent({
    tool: "github.notifications.list",
    method: "GET",
    url: "https://api.github.com/notifications",
  });
  g.create({
    sessionId: "s1",
    credId: "c1",
    tool: i.tool,
    mode: "session",
    origin: i.origin,
    fingerprint: i.fingerprint,
    method: "GET",
  });
  g.revokeAll();
  assert.equal(g.find("s1", i), undefined);
  assert.equal(g.activeCount(), 0);
});
