import assert from "node:assert/strict";
import test from "node:test";
import { REDACTED, containsSecret, redact } from "./redact.ts";

test("redactor strips sensitive keys and secret-shaped values", () => {
  const input = {
    access_token: "not-a-real-token-value-but-key-is-sensitive",
    Authorization: "Bearer abc",
    nested: {
      note: "ghp_" + "x".repeat(20),
      stripe: "sk_test_" + "y".repeat(20),
      ok: "hello",
    },
    list: ["sk_live_" + "z".repeat(20), "fine"],
  };
  const out = redact(input) as {
    access_token: string;
    Authorization: string;
    nested: { note: string; stripe: string; ok: string };
    list: string[];
  };
  assert.equal(out.access_token, REDACTED);
  assert.equal(out.Authorization, REDACTED);
  assert.equal(out.nested.note, REDACTED);
  assert.equal(out.nested.stripe, REDACTED);
  assert.equal(out.nested.ok, "hello");
  assert.equal(out.list[0], REDACTED);
  assert.equal(out.list[1], "fine");
  assert.equal(containsSecret(out), false);
  assert.equal(containsSecret(input), true);
});
