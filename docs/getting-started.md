# Getting Started With MCPWarden

This guide starts from a local checkout and ends with a running `mcpw` CLI and local service.

## Requirements

- Node.js 22 or newer.
- pnpm.
- PowerShell, Windows Terminal, or another shell that can run Node commands.
- Optional: a local MCP server if you want live stdio discovery.

## Install Dependencies

```powershell
pnpm install
```

## Verify The Checkout

```powershell
pnpm check
pnpm test
```

`pnpm check` builds the production package and runs ESLint. `pnpm test` runs unit, security, property, e2e, and package smoke tests.

## Build A Downloadable Tarball

```powershell
pnpm pack
```

This creates:

```text
mcpwarden-0.1.0.tgz
```

## Install The CLI Globally

```powershell
npm install -g .\mcpwarden-0.1.0.tgz
mcpw --version
```

The binary remains `mcpw` because it is short and convenient at the terminal.

## Initialize A Project

```powershell
mcpw init
```

This writes:

- `mcpw.config.json`
- `mcpw.overrides.json`
- `example.workflow.json`

Existing files are not overwritten.

## Run Diagnostics

```powershell
mcpw doctor
```

For machine-readable output:

```powershell
mcpw doctor --json
```

Doctor checks:

- Node runtime.
- MCPWarden package version.
- config parse.
- source discovery.
- imported tool diagnostics.

## Inspect A Source

```powershell
mcpw sources inspect --config examples/mcpw.config.json --source fixture-mcp
```

This prints missing annotations for imported tools.

## Export Starter Overrides

```powershell
mcpw manifests export --config examples/mcpw.config.json --source fixture-mcp
```

Use the output as a starting point for `mcpw.overrides.json`.

## Check And Plan Workflows

```powershell
mcpw check examples/imported-mcp-tool.workflow.json --config examples/mcpw.config.json
mcpw plan examples/imported-mcp-tool.workflow.json --config examples/mcpw.config.json
```

`check` fails on denied effects or unresolved imported tools. `plan` prints effects, approvals, diagnostics, and denied reasons.

## Run A Workflow

```powershell
mcpw run examples/triage-failing-tests.workflow.json --dry-run
```

Execution returns JSON with:

- `ok`
- `trace`
- `outputs`
- `error` when execution fails

## Start The Service

```powershell
mcpw serve --config examples/mcpw.config.json
```

The service prints two lines: the listening URL and a bearer token. Keep that token local and send it on every endpoint except `/health`.

The service listens on the configured host and port. Defaults are:

```json
{
  "service": {
    "host": "127.0.0.1",
    "port": 8765
  }
}
```

Check health:

```powershell
Invoke-RestMethod http://127.0.0.1:8765/health
```

Call authenticated endpoints:

```powershell
$headers = @{ Authorization = "Bearer <printed-token>" }
Invoke-RestMethod http://127.0.0.1:8765/sources -Headers $headers
```
