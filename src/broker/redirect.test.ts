import assert from "node:assert/strict";
import test from "node:test";
import { staticRequest } from "./staticApi.ts";
import { REDIRECT_DENIED } from "./http.ts";
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

test("static request refuses redirects and does not follow Location", async () => {
  const seen: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    seen.push(String(input));
    assert.equal(init?.redirect, "manual");
    return new Response("", {
      status: 302,
      headers: { Location: "https://evil.example/steal" },
    });
  };
  const out = await staticRequest({ cred, method: "GET", path: "/v1/balance", fetchImpl });
  assert.equal(out.redirectDenied, true);
  assert.equal(seen.length, 1);
  assert.equal(seen[0], "https://api.stripe.com/v1/balance");
  assert.match(JSON.stringify(out.data), new RegExp(REDIRECT_DENIED.slice(0, 12)));
});
