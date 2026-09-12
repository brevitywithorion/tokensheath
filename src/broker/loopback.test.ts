import assert from "node:assert/strict";
import test from "node:test";
import { allowLocalPost, isLoopbackHostHeader } from "./loopback.ts";

test("host header is exact loopback, not a prefix", () => {
  assert.equal(isLoopbackHostHeader("127.0.0.1"), true);
  assert.equal(isLoopbackHostHeader("127.0.0.1:8787"), true);
  assert.equal(isLoopbackHostHeader("localhost:8787"), true);
  assert.equal(isLoopbackHostHeader("127.0.0.1.evil.example"), false);
  assert.equal(isLoopbackHostHeader("evil.example"), false);
});

test("cross-site browser posts are refused; native agents are allowed", () => {
  assert.equal(allowLocalPost({ origin: "https://evil.example" }), false);
  assert.equal(allowLocalPost({ "sec-fetch-site": "cross-site" }), false);
  assert.equal(allowLocalPost({ origin: "http://127.0.0.1:8787" }), true);
  assert.equal(allowLocalPost({}), true);
});
