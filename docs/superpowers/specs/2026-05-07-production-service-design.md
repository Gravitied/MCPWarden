# Production Service Design

## Purpose

Make MCP Workflow IR Runtime a production-ready downloadable tool that a user can install, start, connect to MCP servers, and use without editing the repository. The first production milestone should preserve the existing security model while closing the current gaps around packaging, live MCP connectivity, service startup, and first-run ergonomics.

The current project already validates strict workflow JSON, checks effects against policy, imports fixture-backed MCP `tools/list` data, and runs workflows through a broker boundary. The next step is to turn that into a real user-facing product: an installable `mcpw` CLI with a local service mode and a live MCP-backed tool broker.

## Goals

- Publishable npm package that installs a working `mcpw` binary.
- Package tarball contains only runtime files, templates, docs, and examples needed by users.
- `mcpw init` creates starter config, override, and workflow files.
- `mcpw doctor` verifies install health, config validity, source reachability, and MCP tool discovery.
- `mcpw serve` starts a local production service with health and workflow endpoints.
- Live stdio MCP support for `sources[].transport = "stdio"` using the official TypeScript MCP SDK.
- Existing fixture transport remains for deterministic tests and examples.
- Runtime execution can call imported MCP tools through a real broker instead of only the mock broker.
- Missing effect or trust annotations remain denied by default.
- README quickstart starts from global install or local package tarball and ends with a usable command.

## Non-Goals

- No hosted cloud service.
- No multi-tenant auth.
- No durable queue or workflow scheduler.
- No broad plugin marketplace.
- No automatic trust inference for MCP tools.
- No full HTTP MCP transport in the first production milestone unless stdio is completed and the SDK surface makes HTTP a small follow-up.

## Recommended Approach

Ship an npm-installable CLI that can also run as a local service.

This keeps the smallest useful product surface:

- Users can install it with npm or from a local tarball.
- The CLI remains useful for direct checks, plans, source inspection, and workflow runs.
- The local service unlocks "start it and use it" workflows for other local tools.
- Live MCP integration is isolated behind adapter and broker interfaces, so SDK changes do not spread through policy or IR code.

Rejected alternatives:

- CLI-only: simpler packaging, but it does not satisfy "production service" strongly enough.
- Docker-first: useful as a separate packaging milestone after npm install and local service mode work.
- Full daemon plus persistent state: too much infrastructure before live MCP execution is proven.

## Architecture

### Package Layout

The package should build to a clean runtime layout:

- `dist/cli.js` or a corrected `bin` path that points to the actual compiled CLI.
- `dist/index.js` and public runtime modules.
- bundled templates under `templates/`.
- examples and docs that support onboarding.
- no `src/`, `tests/`, `coverage/`, or generated test builds in the npm tarball.

The package should set `private: false` only when publish metadata is correct. It should define `files`, `bin`, `exports`, `engines`, `prepack`, and smoke-test scripts.

### CLI Commands

Keep the existing commands:

- `mcpw check <workflow>`
- `mcpw plan <workflow>`
- `mcpw run <workflow>`
- `mcpw sources list`
- `mcpw sources inspect`
- `mcpw manifests export`

Add production commands:

- `mcpw init`: writes starter `mcpw.config.json`, `mcpw.overrides.json`, and an example workflow if they do not exist.
- `mcpw doctor`: checks Node version, package metadata, config parse, source discovery, missing overrides, and service readiness.
- `mcpw serve`: starts the local service.

CLI output should support human-readable text by default and JSON output via `--json` for automation.

### Local Service

`mcpw serve` starts an HTTP service bound to localhost by default.

Endpoints:

- `GET /health`: returns service status, version, uptime, and config path.
- `GET /sources`: returns configured sources and diagnostics.
- `POST /workflows/check`: validates and policy-checks a workflow payload.
- `POST /workflows/plan`: returns effects, approvals, diagnostics, and denied effects.
- `POST /workflows/run`: runs approved workflows and returns outputs plus trace.

The service should fail closed:

- unknown tools are denied.
- missing annotations are denied.
- policy denies always win.
- approval-required workflows do not run in this milestone.

### Live MCP Integration

The existing `McpToolsListAdapter` should grow from fixture-only support to live source loading.

For `stdio` sources, config should include:

```json
{
  "id": "local-filesystem",
  "kind": "mcp",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
  "defaultPolicy": "deny-unknown",
  "timeoutMs": 5000
}
```

The adapter connects to the MCP server, calls `tools/list`, converts tools into `ImportedTool` records, and closes the connection. A new MCP-backed `ToolBroker` connects to the same source and executes `tools/call` for approved workflow steps.

The official MCP docs list TypeScript as a Tier 1 SDK and describe SDK support for MCP clients connecting to servers. The npm package currently used by MCP examples is `@modelcontextprotocol/sdk`, with v1.x remaining the production recommendation while v2 is still in development:

- https://modelcontextprotocol.io/docs/sdk
- https://github.com/modelcontextprotocol/typescript-sdk
- https://www.npmjs.com/package/@modelcontextprotocol/sdk

### Configuration

Continue using project-local JSON config:

- `mcpw.config.json`: source definitions and service settings.
- `mcpw.overrides.json`: explicit trust, effects, approvals, aliases, and descriptions.

Add optional service settings:

```json
{
  "service": {
    "host": "127.0.0.1",
    "port": 8765
  },
  "sources": []
}
```

Config discovery order:

1. explicit `--config`.
2. `mcpw.config.json` in the current directory.
3. no-source default config.

Override discovery should use `--overrides` when provided, otherwise a sibling `mcpw.overrides.json`.

### Error Handling

Production commands should return typed error codes:

- `CONFIG_INVALID`
- `SOURCE_NOT_FOUND`
- `MCP_CONNECT_FAILED`
- `MCP_TOOLS_LIST_FAILED`
- `WORKFLOW_INVALID`
- `POLICY_DENIED`
- `APPROVAL_REQUIRED`
- `TOOL_CALL_FAILED`

Human output should be concise. JSON output should include `{ ok, code, message, details }`.

### Testing

Unit tests:

- package metadata helpers.
- config discovery and service config defaults.
- CLI init file creation without overwriting existing files.
- doctor result codes.
- service route handlers.
- MCP broker call routing with a fake client.

E2E tests:

- package smoke test builds, packs, installs into a temp project, and runs `mcpw --version`.
- `mcpw init` creates usable files in a temp directory.
- `mcpw doctor --config examples/mcpw.config.json` exits 0 for fixture sources.
- `mcpw serve --config examples/mcpw.config.json --port 0` responds to `/health`.
- imported fixture workflow still checks and plans successfully.

Security tests:

- live/imported MCP tools without overrides stay denied.
- policy deny wins over overrides and service run.
- service run refuses approval-required effects.
- MCP tool call errors do not expose secrets or process internals.

Manual verification:

- `npm pack --dry-run` shows the intended file list.
- install tarball into a temporary directory.
- run `mcpw init`, `mcpw doctor`, `mcpw sources inspect`, and `mcpw serve`.

## Acceptance Criteria

- A user can build a tarball with `npm pack`, install it in a clean temp directory, and run `mcpw --version`.
- `mcpw init` creates starter files that `mcpw doctor` accepts.
- `mcpw serve` starts on localhost and returns healthy status.
- Fixture-backed MCP examples continue to work.
- A stdio MCP server can be inspected through `tools/list`.
- An approved imported MCP tool can be called through the runtime broker.
- Unannotated imported MCP tools are denied.
- The npm tarball does not include source, tests, coverage, or built test output.
- README documents the install, init, inspect, doctor, serve, check, plan, and run flow.
