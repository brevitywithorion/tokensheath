# TokenSheath

**The model never sees the key.**

Sheath the token. Unsheath only to act. TokenSheath is a local authority broker: the agent requests a named action, you approve it on this machine, the credential is injected on the wire and never returned to the model.

Need **Node.js 22+**. Windows works. Git Bash is optional.

## Windows (PowerShell)

```powershell
git clone https://github.com/brevitywithorion/tokensheath.git
cd tokensheath
npm install
node bin/sheath.mjs onboard
node bin/sheath.mjs status
```

Cursor MCP config — use `node`, not bash. Put **your** clone path in:

```json
{
  "mcpServers": {
    "tokensheath": {
      "command": "node",
      "args": [
        "C:\\Users\\YOU\\tokensheath\\bin\\sheath.mjs",
        "mcp"
      ]
    }
  }
}
```

Then in Cursor: save a test-mode Stripe (or any GET) key via `onboard`, ask the agent to call `static.request`. A local approval tab opens. Allow once.

```powershell
node bin/sheath.mjs log
node bin/sheath.mjs revoke --all
```

Store: `%USERPROFILE%\.tokensheath` (override with `SHEATH_HOME`).

## macOS / Linux

```
git clone https://github.com/brevitywithorion/tokensheath.git
cd tokensheath
npm install
./bin/sheath onboard
./bin/sheath mcp
```

## Honest limits

A same-user agent with shell can still read `~/.tokensheath`. The promise is **model context**, not an OS sandbox. This is not a hosted API.

`tokensheath.com` looked unregistered at pick-time. Register it before announcing.
