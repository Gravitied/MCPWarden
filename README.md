# MCPWarden

MCPWarden is a policy-checkable workflow runtime for MCP-based agent tooling. It lets a model or developer propose a strict JSON workflow, imports available MCP tools, requires explicit safety annotations, derives effects, plans approvals, and only then executes approved tool calls through a brokered runtime.

The short version: MCPWarden is a guardrail layer between agent-generated plans and real MCP tools.

## Why This Exists

MCP makes tools discoverable and composable. That is powerful, but raw tool discovery is not enough to decide whether a workflow is safe to run. A tool name, description, and input schema do not tell you whether the tool reads secrets, writes files, mutates GitHub, executes shell commands, or returns untrusted content that should not become model instructions.

MCPWarden treats tool discovery as capability discovery, not authority. Imported tools stay inspect-only until a human or project configuration gives them:

- `outputTrust`: how outputs may be handled.
- `effectRules`: what authority the tool can exercise for a given call.
- `requiresApproval`: effects that must be explicitly approved before execution.

The runtime then checks a workflow against policy before execution. Unknown tools, missing metadata, denied effects, and approval-required effects fail closed.

## What MCPWarden Provides

- A strict JSON Workflow IR for model-proposed workflows.
- MCP `tools/list` import from fixtures and live stdio MCP servers.
- Manifest overrides for trust labels, effects, approvals, aliases, and descriptions.
- A policy checker that separates allowed, denied, and approval-required effects.
- A replayable runtime trace for workflow execution.
- A local CLI named `mcpw`.
- A localhost service started with `mcpw serve`.
- First-run setup with `mcpw init`.
- Health and readiness checks with `mcpw doctor`.
- Package smoke tests that verify the npm tarball installs and exposes a working binary.

## Install From This Repository

```powershell
pnpm install
pnpm pack
npm install -g .\mcpwarden-0.1.0.tgz
mcpw --version
```

For local development without global install:

```powershell
pnpm install
pnpm cli -- --help
```

## Quickstart

Create starter project files:

```powershell
mcpw init
```

Check install and config health:

```powershell
mcpw doctor
```

Inspect an MCP source:

```powershell
mcpw sources inspect --config examples/mcpw.config.json --source fixture-mcp
```

Export starter safety overrides for a source:

```powershell
mcpw manifests export --config examples/mcpw.config.json --source fixture-mcp
```

Check and plan a workflow that uses an imported MCP tool:

```powershell
mcpw check examples/imported-mcp-tool.workflow.json --config examples/mcpw.config.json
mcpw plan examples/imported-mcp-tool.workflow.json --config examples/mcpw.config.json
```

Run a safe workflow:

```powershell
mcpw run examples/triage-failing-tests.workflow.json --dry-run
```

Start the local service:

```powershell
mcpw serve --config examples/mcpw.config.json
```

Then call:

- `GET http://127.0.0.1:8765/health`
- `GET http://127.0.0.1:8765/sources`
- `POST http://127.0.0.1:8765/workflows/check`
- `POST http://127.0.0.1:8765/workflows/plan`
- `POST http://127.0.0.1:8765/workflows/run`

## Core Concepts

### Workflow IR

The Workflow IR is the stable JSON interface. It supports operations such as `tool.call`, `agent.ask`, `approval.require`, `assert`, and `return`. The IR is intentionally not a programming language and not a shell replacement.

### Tool Manifest

A tool manifest describes a callable tool in terms the policy checker can understand:

- name and description.
- input schema.
- output trust label.
- effect rules.
- optional approval requirements.

### Imported Tool

An imported tool is raw capability information discovered from an external ecosystem such as MCP. Imported tools are not executable until override metadata makes them complete manifests.

### Effect

An effect is a policy-relevant capability such as `read.tests`, `read.repo`, `write.repo`, `write.github.issues`, `read.secrets`, or `shell.exec`.

### Trust Label

Trust labels describe how outputs can flow:

- `trusted`
- `untrusted`
- `secret`
- `artifact`
- `patch`

### Policy

Policy decides which effects are allowed, denied, or approval-required. Policy denies always win over tool overrides.

## Example Workflow

```json
{
  "version": "0.1",
  "workflow": "imported_mcp_tool",
  "steps": [
    {
      "id": "failures",
      "op": "tool.call",
      "tool": "tests.get_failures",
      "args": { "limit": 1 },
      "saveAs": "ArtifactRef<TestFailure[]>"
    }
  ]
}
```

## Example MCP Source Config

```json
{
  "service": {
    "host": "127.0.0.1",
    "port": 8765
  },
  "sources": [
    {
      "id": "local-mcp",
      "kind": "mcp",
      "transport": "stdio",
      "command": "node",
      "args": ["path/to/server.mjs"],
      "defaultPolicy": "deny-unknown",
      "timeoutMs": 5000
    }
  ]
}
```

## Example Override

```json
{
  "sources": {
    "local-mcp": {
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

## Repository Layout

- `src/cli.ts`: command-line entry point.
- `src/service/`: local HTTP service and shared workflow handlers.
- `src/adapters/`: MCP adapters, MCP clients, and tool brokers.
- `src/config/`: config schemas, discovery, and loaders.
- `src/ir/`: strict Workflow IR schemas and validation.
- `src/manifests/`: built-in manifests, override merging, and universal registry.
- `src/policy/`: policy checking and approval planning.
- `src/runtime/`: workflow executor, broker interface, and trace recording.
- `src/trust/`: trust labels and taint helpers.
- `examples/`: runnable sample workflows and configs.
- `templates/`: files written by `mcpw init`.
- `docs/`: detailed architecture, operations, security, and integration docs.
- `tests/`: unit, security, property, e2e, and package smoke tests.

## Documentation

- [Architecture](docs/architecture.md)
- [Getting Started](docs/getting-started.md)
- [Configuration](docs/configuration.md)
- [MCP Integration](docs/mcp-integration.md)
- [Service API](docs/service-api.md)
- [Security Model](docs/security-model.md)
- [Workflow IR](docs/workflow-ir.md)
- [Development Guide](docs/development.md)

## Development

```powershell
pnpm install
pnpm check
pnpm test
pnpm test:security
pnpm test:e2e
pnpm test:package
pnpm bench
```

## What This Is Not

MCPWarden is not a general programming language, not a shell replacement, not a durable workflow scheduler, and not a hosted control plane. It reduces execution risk around model-proposed workflows, but it does not guarantee that a valid workflow is the right workflow for a human goal.
