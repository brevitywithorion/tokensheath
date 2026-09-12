import assert from "node:assert/strict";
import test from "node:test";
import { resolveSameOriginUrl } from "./origin.ts";
import { staticRequest } from "./staticApi.ts";
import type { StaticCredential } from "./types.ts";

const cred: StaticCredential = {
  id: "crd_1",
  kind: "static_key",
  nickname: "stripe test",
  header_name: "Authorization",
  header_template: "Bearer {{key}}",
  base_url: "https://api.stripe.com",
  key: "sk_test_" + "a".repeat(24),
  created_at: new Date().toISOString(),
};

test("origin lock rejects off-host paths without calling network", async () => {
  let called = 0;
  const fetchImpl: typeof fetch = async () => {
    called += 1;
    return new Response("{}");
  };
  for (const path of [
    "https://evil.example/steal",
    "//evil.example",
    "https://api.stripe.com.evil/",
    "/foo/../secret",
  ]) {
    const resolved = resolveSameOriginUrl(cred.base_url, path);
    assert.equal(resolved.ok, false);
    await assert.rejects(
      () => staticRequest({ cred, method: "GET", path, fetchImpl }),
      /not allowed|origin/i,
    );
  }
  assert.equal(called, 0);
});

test("origin lock allows same-origin relative paths", () => {
  const ok = resolveSameOriginUrl("https://api.stripe.com", "/v1/balance");
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.url.toString(), "https://api.stripe.com/v1/balance");
});

test("base URL without https is normalized", () => {
  const ok = resolveSameOriginUrl("jsonplaceholder.typicode.com", "/todos/1");
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.url.origin, "https://jsonplaceholder.typicode.com");
});
