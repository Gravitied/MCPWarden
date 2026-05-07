# MCP Workflow IR Runtime

Strict JSON workflow IR for MCP-style agent execution.

## Commands

```powershell
pnpm install
pnpm check
pnpm test
pnpm test:security
pnpm test:e2e
pnpm bench
pnpm cli check examples/triage-failing-tests.workflow.json
pnpm cli plan examples/apply-patch.workflow.json
pnpm cli run examples/triage-failing-tests.workflow.json --dry-run
pnpm cli sources inspect --config examples/mcpw.config.json --source fixture-mcp
pnpm cli manifests export --config examples/mcpw.config.json --source fixture-mcp
pnpm cli check examples/imported-mcp-tool.workflow.json --config examples/mcpw.config.json
```

## What This Is

This is a policy-checkable execution layer for model-proposed workflows. It validates strict JSON IR, infers effects from manifests, derives approval requirements, executes through mock broker interfaces, and records replayable traces.

## What This Is Not

This is not a general programming language, not a shell replacement, and not a durable workflow engine. It reduces execution risk, but it does not guarantee semantic plan quality.
