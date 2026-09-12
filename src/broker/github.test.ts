import assert from "node:assert/strict";
import test from "node:test";
import { githubRequest } from "./github.ts";
import { redact } from "./redact.ts";
import { createMockGithubFetch, createMockGithubState, demoGithubToken } from "./mock/github.ts";

test("github client sends Authorization and does not copy it into the result", async () => {
  const state = createMockGithubState();
  const seen: string[] = [];
  const inner = createMockGithubFetch(state);
  const fetchImpl: typeof fetch = async (input, init) => {
    seen.push(new Headers(init?.headers).get("Authorization") ?? "");
    assert.equal(init?.redirect, "manual");
    return inner(input, init);
  };
  const res = await githubRequest({
    token: demoGithubToken(),
    path: "/notifications",
    fetchImpl,
  });
  assert.equal(res.status, 200);
  assert.equal(seen[0], `Bearer ${demoGithubToken()}`);
  const payload = { status: res.status, data: redact(res.data) };
  const dumped = JSON.stringify(payload);
  assert.equal(dumped.includes("Authorization"), false);
  assert.equal(dumped.includes("Bearer"), false);
  assert.equal(dumped.includes(demoGithubToken()), false);
  assert.equal(Array.isArray(res.data), true);
});
