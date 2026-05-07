# MCP Workflow IR Runtime

Strict JSON workflow IR for MCP-style agent execution.

## Quickstart

```powershell
pnpm install
pnpm check
pnpm test
pnpm test:security
pnpm test:e2e
pnpm test:package
pnpm bench
pnpm pack
npm install -g .\mcp-workflow-ir-runtime-0.1.0.tgz
mcpw --version
mcpw init
mcpw doctor
mcpw sources inspect --config examples/mcpw.config.json --source fixture-mcp
mcpw manifests export --config examples/mcpw.config.json --source fixture-mcp
mcpw check examples/imported-mcp-tool.workflow.json --config examples/mcpw.config.json
mcpw plan examples/imported-mcp-tool.workflow.json --config examples/mcpw.config.json
mcpw run examples/triage-failing-tests.workflow.json --dry-run
mcpw serve --config examples/mcpw.config.json
```

## What This Is

This is a policy-checkable execution layer for model-proposed workflows. It validates strict JSON IR, infers effects from manifests, derives approval requirements, executes through broker interfaces, can inspect MCP tool sources, and records replayable traces.

## What This Is Not

This is not a general programming language, not a shell replacement, and not a durable workflow engine. It reduces execution risk, but it does not guarantee semantic plan quality.
