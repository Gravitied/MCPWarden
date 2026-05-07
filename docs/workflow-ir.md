# Workflow IR

MCPWarden executes strict JSON workflows. The IR is the stable interface. A textual DSL may be added later, but it must compile to this IR.

## Operations

- `tool.call`: invoke a manifest-declared tool through the broker.
- `agent.ask`: call a named agent through the agent registry.
- `context.collect`: collect bounded context references.
- `artifact.summarize`: summarize an artifact reference.
- `assert`: enforce a deterministic condition.
- `approval.require`: request explicit approval but never reduce inferred effects.
- `return`: produce the final workflow result.

## Authority

Workflows have no ambient authority. Effects are inferred from tool and agent manifests. Policy decides whether each effect is allowed, denied, or approvable.

## Configurable External Tool Sources

External tools are loaded from explicit source configuration instead of being treated as ambient runtime capabilities. The current universal registry supports MCP-style sources and keeps the source contract adapter-based so other ecosystems can be added without changing workflow IR.

An MCP fixture source can be configured for local inspection and tests:

```json
{
  "sources": [
    {
      "id": "fixture-mcp",
      "kind": "mcp",
      "transport": "fixture",
      "fixturePath": "tests/fixtures/mcp-tools-list.json",
      "defaultPolicy": "deny-unknown",
      "timeoutMs": 5000
    }
  ]
}
```

The override manifest supplies the policy-relevant parts that raw tool discovery cannot safely infer: `outputTrust`, `effectRules`, optional descriptions, and approval metadata. Imported tools are inspect-only and denied by default until an override supplies both `outputTrust` and non-empty `effectRules`.

```powershell
pnpm cli sources inspect --config examples/mcpw.config.json --source fixture-mcp
pnpm cli manifests export --config examples/mcpw.config.json --source fixture-mcp
pnpm cli check examples/imported-mcp-tool.workflow.json --config examples/mcpw.config.json
```

## Local Service

`mcpw serve` exposes localhost-only HTTP endpoints for health, source diagnostics, workflow checks, workflow plans, and approved workflow runs. The service uses the same validation, registry, and policy checker as the CLI.

Endpoints:

- `GET /health`
- `GET /sources`
- `POST /workflows/check`
- `POST /workflows/plan`
- `POST /workflows/run`

`/workflows/run` refuses denied and approval-required effects. Live MCP tool calls stay behind the `ToolBroker` boundary.
