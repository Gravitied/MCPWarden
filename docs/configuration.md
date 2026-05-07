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

Fields:

- `id`: stable source id used by overrides.
- `kind`: currently `mcp`.
- `transport`: `fixture`, `stdio`, or reserved `http`.
- `fixturePath`: JSON file with MCP `tools/list` response for fixture transport.
- `command`: process command for stdio transport.
- `args`: command arguments for stdio transport.
- `url`: reserved for HTTP transport.
- `timeoutMs`: source operation timeout value for callers.
- `defaultPolicy`: source default posture. The recommended value is `deny-unknown`.

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
