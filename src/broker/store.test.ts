import assert from "node:assert/strict";
import test from "node:test";
import { MemoryStore, credForTool, missingCredMessage } from "./store.ts";

function add(store: MemoryStore, nickname: string, host: string) {
  return store.upsertStatic({
    nickname,
    header_name: "Authorization",
    header_template: "Bearer {{key}}",
    base_url: host,
    key: `dummy-${nickname}`,
  });
}

test("named services keep both keys and resolve by nickname", () => {
  const store = new MemoryStore();
  add(store, "Stripe", "https://api.stripe.com");
  add(store, "OpenAI", "https://api.openai.com");
  assert.equal(store.staticKeys().length, 2);
  assert.equal(store.staticKey("stripe")?.base_url, "https://api.stripe.com");
  assert.equal(store.staticKey("OpenAI")?.nickname, "OpenAI");
  assert.equal(credForTool(store, "static.request") , undefined);
  assert.equal(credForTool(store, "static.request", "Stripe")?.nickname, "Stripe");
  assert.match(missingCredMessage(store, "static.request"), /Say which service/);
});

test("same nickname updates instead of duplicating", () => {
  const store = new MemoryStore();
  const a = add(store, "Stripe", "https://api.stripe.com");
  const b = add(store, "stripe", "https://api.stripe.com");
  assert.equal(store.staticKeys().length, 1);
  assert.equal(a.id, b.id);
});

test("a single service can omit the name", () => {
  const store = new MemoryStore();
  add(store, "Stripe", "https://api.stripe.com");
  assert.equal(store.staticKey()?.nickname, "Stripe");
});
