# TokenSheath

**The model never sees the key.**

Local credential broker for agents. The agent requests an action. You approve it. TokenSheath injects the credential on the wire. The model never holds the secret.

Need **Node.js 22+**. Windows, macOS, and Linux.

## Zero Trust

- **Default deny.** Unknown tools never run. No credential moves without a grant.
- **Verify every request.** Origin, method, and body are bound to the approval. Tickets are single-use.
- **Least privilege.** Session reads: 15 min / 20 calls / this origin. Writes: once.
- **Assume the agent is hostile.** It is untrusted. The key never enters model context.

This is not an OS sandbox. A same-user shell can still read `~/.tokensheath`.


## What it does

- **At rest:** AES-GCM. `master.key` is mode 0600.
- **On the wire:** origin lock. Redirects refused. MVP methods: GET and POST.
- **Consent:** reads may be once, or a session of **15 min · 20 calls · this origin · reads only**. Writes are always once.
- **Revoke:** `sheath revoke --all` writes a watched epoch. A running `sheath mcp` drops live grants.
- **Audit:** JSONL without secrets.

## Try it (no Cursor)

```powershell
git clone https://github.com/brevitywithorion/tokensheath.git
cd tokensheath
npm install
node bin/sheath.mjs onboard
```

Use a throwaway or dummy key. Example origin: `https://jsonplaceholder.typicode.com`.

```powershell
node bin/sheath.mjs call GET /todos/1
node bin/sheath.mjs log
node bin/sheath.mjs revoke --all
```

An approval tab opens on this machine. Allow once. The printed JSON must not contain the key.

## Cursor / Claude Code later

```json
{
  "mcpServers": {
    "tokensheath": {
      "command": "node",
      "args": ["C:\\Users\\YOU\\tokensheath\\bin\\sheath.mjs", "mcp"]
    }
  }
}
```

On macOS/Linux, `./bin/sheath mcp` is the same process.

Store: `~/.tokensheath` or `%USERPROFILE%\.tokensheath` (`SHEATH_HOME` overrides).

## Why not .env

`.env` puts the key in the same context as the model. TokenSheath keeps the key out of that context and asks you before using it.

## License / contact

Source is here while the product domain is in motion. Report vulnerabilities via GitHub Security Advisories on this repo. Do not file a public issue with a working exploit.
