# MCPWarden Configuration

MCPWarden uses two project-local JSON files:

- `mcpw.config.json`
- `mcpw.overrides.json`

The config file declares service settings and external tool sources. The overrides file adds safety metadata that raw tool discovery cannot provide.

## Config Discovery

Config discovery order:

1. explicit `--config`.
2. `mcpw.config.json` in the current directory.
3. empty default config with no sources.

Override discovery order:

1. explicit `--overrides` where supported.
2. sibling override path based on the config path.
3. `mcpw.overrides.json` in the current directory.
4. empty override config.

## Service Config

```json
{
  "service": {
    "host": "127.0.0.1",
    "port": 8765
  },
  "sources": []
}
```

Fields:

- `host`: interface for the local HTTP service.
- `port`: port for the local HTTP service. Use `0` in tests to ask the OS for an available port.

## Debug Logging

MCPWarden is quiet by default. Enable structured JSON-line diagnostics with environment variables:

- `MCPW_LOG_LEVEL=debug|info|warn|error|silent`: sets the minimum log level.
- `MCPW_DEBUG=1`: shortcut for debug logging when `MCPW_LOG_LEVEL` is not set.

Logs are written to stderr. Service logs include lifecycle events, request method/path/status/duration, and request ids. MCP logs include source ids, tool names, operation status, and duration. Request headers, request bodies, bearer tokens, and tool arguments are not logged. Sensitive-looking fields such as `token`, `apiKey`, `password`, `secret`, and `authorization` are redacted before emission.

Example:

```powershell
$env:MCPW_LOG_LEVEL = "debug"
mcpw serve --config mcpw.config.json
```

## Verbosity And Output Budgets

Workflow execution can be shaped for humans, agents, or automated clients:

```powershell
mcpw run workflow.json --verbosity compact
mcpw run workflow.json --outputs refs --trace summary --max-output-bytes 4096
```

Service clients can pass the same controls as query parameters:

```text
/workflows/run?verbosity=compact&outputs=refs&trace=summary&maxOutputBytes=4096
```

Use `compact` or `outputs=refs` when tool results are large or likely to be re-fed into a model. Full outputs remain available inside the runtime for later workflow references, while public responses can carry summaries or artifact handles.

## MCP Source Config

Fixture source:

```json
{
  "id": "fixture-mcp",
  "kind": "mcp",
  "transport": "fixture",
  "fixturePath": "tests/fixtures/mcp-tools-list.json",
  "defaultPolicy": "deny-unknown",
  "timeoutMs": 5000
}
```

Stdio source:

```json
{
  "id": "local-mcp",
  "kind": "mcp",
  "transport": "stdio",
  "command": "node",
  "args": ["path/to/server.mjs"],
  "defaultPolicy": "deny-unknown",
  "timeoutMs": 5000
}
```

HTTP source:

```json
{
  "id": "remote-mcp",
  "kind": "mcp",
  "transport": "http",
  "url": "http://127.0.0.1:3000/mcp",
  "defaultPolicy": "deny-unknown",
  "timeoutMs": 5000
}
```

Fields:

- `id`: stable source id used by overrides.
- `kind`: currently `mcp`.
- `transport`: `fixture`, `stdio`, or `http`.
- `fixturePath`: JSON file with MCP `tools/list` response for fixture transport.
- `command`: process command for stdio transport.
- `args`: command arguments for stdio transport.
- `url`: HTTP JSON-RPC MCP endpoint for HTTP transport.
- `timeoutMs`: source operation timeout value for callers.
- `defaultPolicy`: source default posture. The recommended value is `deny-unknown`.

## Policy Packs

Built-in policy packs provide safe starting points:

```powershell
mcpw policy init --profile local-dev
mcpw policy init --profile ci-readonly
mcpw policy init --profile enterprise-strict
mcpw policy init --profile owasp-mcp-top10
```

## Source Lockfiles

Pin imported tool schemas and descriptions before trusting a source in repeatable environments:

```powershell
mcpw sources lock --config mcpw.config.json --out mcpw.lock.json
```

The lockfile records per-tool `schemaHash` and `descriptionHash` values. Schema drift should trigger review before updated tools are allowed to run.

## Overrides

Overrides map source ids and tool names to safety metadata.

```json
{
  "sources": {
    "fixture-mcp": {
      "defaults": {
        "outputTrust": "untrusted"
      },
      "tools": {
        "tests.get_failures": {
          "outputTrust": "artifact",
          "effectRules": [
            { "kind": "static", "effects": ["read.tests"] }
          ],
          "requiresApproval": []
        }
      }
    }
  }
}
```

Tool-specific overrides win over source defaults.

## Effect Rules

Static effect rule:

```json
{ "kind": "static", "effects": ["read.tests"] }
```

Argument-sensitive effect rule:

```json
{
  "kind": "argumentEquals",
  "path": "mode",
  "equals": "apply",
  "effects": ["read.repo", "write.repo"],
  "otherwiseEffects": ["read.repo"]
}
```

Argument-sensitive rules are useful for tools where the same MCP tool can inspect in one mode and mutate in another.

## Trust Labels

Allowed trust labels:

- `trusted`
- `untrusted`
- `secret`
- `artifact`
- `patch`

Use the least privileged trust label that matches the tool output.
