# MCP Integration

MCPWarden integrates with MCP through source adapters and tool brokers.

## Supported Transport Modes

### Fixture

Fixture transport reads a deterministic MCP `tools/list` response from a JSON file. It is used by tests, examples, and offline documentation.

```json
{
  "id": "fixture-mcp",
  "kind": "mcp",
  "transport": "fixture",
  "fixturePath": "tests/fixtures/mcp-tools-list.json"
}
```

### Stdio

Stdio transport starts a local MCP server process and communicates through the official MCP TypeScript SDK.

```json
{
  "id": "stdio-real",
  "kind": "mcp",
  "transport": "stdio",
  "command": "node",
  "args": ["tests/fixtures/stdio-mcp-server.mjs"]
}
```

## Discovery Flow

1. Load `mcpw.config.json`.
2. For each MCP source, call `tools/list`.
3. Convert MCP tools into neutral imported tool records.
4. Load `mcpw.overrides.json`.
5. Merge source defaults and tool-specific overrides.
6. Promote fully annotated tools into executable manifests.
7. Keep incomplete tools inspect-only and emit diagnostics.

## Execution Flow

When a workflow calls a live imported MCP tool:

1. The workflow is validated.
2. Effects are inferred from the completed manifest.
3. Policy is checked.
4. Approval-required effects are refused by the current service runtime.
5. The `McpToolBroker` opens an MCP client connection.
6. The broker calls the MCP tool.
7. The connection is closed.
8. The executor records output and trace events.

## Failure Behavior

MCPWarden fails closed for:

- source not found.
- MCP connection failure.
- invalid `tools/list` response.
- missing `outputTrust`.
- missing or empty `effectRules`.
- policy denied effects.
- approval-required effects during service execution.
- unknown tool source during broker routing.

## Testing Live MCP

The repository includes `tests/fixtures/stdio-mcp-server.mjs`, a tiny MCP server fixture used to prove real stdio discovery and service execution.

Relevant tests:

- `tests/unit/mcp-adapter.test.ts`
- `tests/unit/mcp-broker.test.ts`
- `tests/unit/service.test.ts`

Run them with:

```powershell
pnpm test tests/unit/mcp-adapter.test.ts tests/unit/mcp-broker.test.ts tests/unit/service.test.ts
```
