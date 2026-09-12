import assert from "node:assert/strict";
import test from "node:test";
import { GrantStore, isReadTool } from "./grants.ts";

test("allow-once does not authorize a second call", () => {
  const g = new GrantStore();
  const grant = g.create({
    sessionId: "s1",
    credId: "c1",
    tool: "github.notifications.list",
    mode: "once",
  });
  g.consume(grant);
  assert.equal(g.find("s1", "github.notifications.list", "c1"), undefined);
});

test("session read grant covers other GitHub reads but not comments", () => {
  const g = new GrantStore();
  g.create({
    sessionId: "s1",
    credId: "c1",
    tool: "github.notifications.list",
    mode: "session",
  });
  assert.ok(g.find("s1", "github.issues.search", "c1"));
  assert.equal(g.find("s1", "github.issues.comment", "c1"), undefined);
  assert.equal(isReadTool("github.issues.comment"), false);
});

test("session grant on static GET does not cover POST", () => {
  const g = new GrantStore();
  g.create({
    sessionId: "s1",
    credId: "c1",
    tool: "static.request",
    mode: "session",
    method: "GET",
  });
  assert.ok(g.find("s1", "static.request", "c1", "GET"));
  assert.equal(g.find("s1", "static.request", "c1", "POST"), undefined);
});

test("revoke --all makes existing grants unusable", () => {
  const g = new GrantStore();
  g.create({
    sessionId: "s1",
    credId: "c1",
    tool: "github.notifications.list",
    mode: "session",
  });
  g.revokeAll();
  assert.equal(g.find("s1", "github.notifications.list", "c1"), undefined);
  assert.equal(g.activeCount(), 0);
});
