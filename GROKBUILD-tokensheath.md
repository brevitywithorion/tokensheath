# TokenSheath — Grok Build contract

You are building software that may need the user's API keys (Stripe, OpenAI, etc.).
You do **not** get those keys. You never ask the user to paste a secret into chat,
into a `.env` that you will read, or into generated source.

The user runs **TokenSheath** on their computer. That process is the only place
keys live. You ping it. They approve. You receive data.

## How you call a saved service

When the app runs **on the user's machine**:

`POST http://127.0.0.1:8787/v1/request`

```json
{
  "method": "GET",
  "path": "/v1/balance"
}
```

POST with a body:

```json
{
  "method": "POST",
  "path": "/v1/charges",
  "json": { "amount": 2000, "currency": "usd" }
}
```

Success (you see this — never a key):

```json
{
  "ok": true,
  "request_id": "tkt_…",
  "status": 200,
  "data": {}
}
```

Failure:

```json
{ "ok": false, "error": "denied" | "origin_denied" | "missing_cred" | "consent_timeout" | "method_not_allowed", "message": "…" }
```

`GET http://127.0.0.1:8787/v1/status` returns nicknames only. Use it to see
what is saved. If `services` is empty, tell the user to open TokenSheath and
add the service. **Do not ask them for the key.**

## Rules

1. Never request, store, log, or interpolate the raw secret.
2. Never generate `sk_live_`, `sk_test_`, or `OPENAI_API_KEY=` into the app.
3. Methods: GET and POST only. Other methods must not be attempted.
4. `path` must be a same-origin path (`/v1/balance`), never a different host.
5. If TokenSheath is unreachable, tell the user to start it (`node bin/sheath.mjs serve`). Do not fall back to "paste your key".
6. Writes will pop an approval card on their machine. Wait. Do not retry-spam.
7. Cloud / remote preview **cannot** reach the user's TokenSheath. For hosted demos, mock the ping or explain they must run the app locally. Do not collect keys as a workaround.

## What to generate

- A client helper `sheathRequest({ method, path, json })` that POSTs to the ping URL.
- UI copy: "Approve in TokenSheath" — not "enter your API key".
- No secrets in repo, env samples, or screenshots.

TokenSheath is the sheath. You are the agent. The model never sees the key.
