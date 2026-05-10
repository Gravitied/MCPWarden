# MCPWarden Service API

`mcpw serve` starts a localhost HTTP service around the same validation, registry, policy, and execution pipeline used by the CLI.

## Start The Service

```powershell
mcpw serve --config mcpw.config.json
```

Startup prints the listening URL and a bearer token:

```text
mcpw service listening at http://127.0.0.1:8765
mcpw service token <token>
```

Options:

- `--config <path>`
- `--overrides <path>`
- `--host <host>`
- `--port <port>`
- `--auth-token <token>`

Default service settings:

```json
{
  "host": "127.0.0.1",
  "port": 8765
}
```

## GET /health

Returns service status.

This is the only unauthenticated endpoint.

Example response:

```json
{
  "ok": true,
  "version": "0.1.0",
  "uptimeMs": 1234,
  "configPath": "C:\\project\\mcpw.config.json"
}
```

## GET /sources

Returns configured sources, imported tool names, and diagnostics.

Required header:

```http
Authorization: Bearer <token>
```

Example response:

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
  ],
  "diagnostics": [
    "fixture-mcp:repo.apply_patch missing outputTrust"
  ],
  "importedTools": ["tests.get_failures", "repo.apply_patch"]
}
```

## POST /workflows/check

Validates and policy-checks a workflow. It does not execute the workflow.

Required headers:

```http
Authorization: Bearer <token>
Content-Type: application/json
```

Request body:

```json
{
  "version": "0.1",
  "workflow": "imported_mcp_tool",
  "steps": [
    {
      "id": "failures",
      "op": "tool.call",
      "tool": "tests.get_failures",
      "args": { "limit": 1 }
    }
  ]
}
```

Successful response:

```json
{
  "ok": true,
  "status": 200,
  "workflow": "imported_mcp_tool",
  "effects": ["read.tests"],
  "approvals": { "required": [] },
  "diagnostics": []
}
```

## POST /workflows/plan

Currently returns the same structured result as `/workflows/check`. Use this endpoint when the caller wants a policy and approval preview without implying execution.

## POST /workflows/run

Runs a workflow only if it validates, has no denied effects, and requires no approvals.

Successful response includes:

- `ok`
- `trace`
- `outputs`
- `metrics`

Query options:

- `verbosity=compact|normal|debug`: preset output and trace detail.
- `outputs=full|summary|refs`: controls public step output shape.
- `trace=full|summary`: controls trace shape.
- `maxOutputBytes=<bytes>`: stores larger public outputs as artifact refs.
- `maxTraceEvents=<count>`: caps returned trace events in summary mode.
- `maxItems=<count>`: caps summary items and object keys.
- `parallel=true`: runs independent workflow steps concurrently.
- `stream=events`: returns `application/x-ndjson` with trace event lines followed by a final result line.

Example compact run:

```powershell
Invoke-RestMethod "$url/workflows/run?verbosity=compact&outputs=refs&trace=summary" -Method Post -Headers $headers -ContentType "application/json" -Body $workflowJson
```

Example streamed run:

```powershell
Invoke-WebRequest "$url/workflows/run?stream=events" -Method Post -Headers $headers -ContentType "application/json" -Body $workflowJson
```

## GET /security/scan

Runs the MCP threat scanner against configured sources and executable manifests.

The report includes total tools, finding counts, overall risk, and findings for tool poisoning, schema poisoning, shadowing, Unicode obfuscation, dangerous effects, and missing metadata.

## GET /runs

Lists persisted run records when `runStorePath` is configured in the embedding service options. Returns an empty array when no run store is configured.

## GET /runs/:id

Returns one persisted run record when `runStorePath` is configured.

## GET /dashboard

Returns a dependency-light local HTML dashboard with source, run, and security finding summaries.

Failure responses include:

- `ok: false`
- `code`
- `message`

Common error codes:

- `WORKFLOW_INVALID`
- `POLICY_DENIED`
- `APPROVAL_REQUIRED`
- `UNAUTHORIZED`
- `FORBIDDEN_ORIGIN`
- `UNSUPPORTED_MEDIA_TYPE`
- `INVALID_JSON`
- `PAYLOAD_TOO_LARGE`
- `NOT_FOUND`
- `INTERNAL_ERROR`

## Debug Logging

Set `MCPW_LOG_LEVEL=debug|info|warn|error` or `MCPW_DEBUG=1` before starting `mcpw serve` to emit structured JSON-line diagnostics to stderr. Logs include service lifecycle events, request ids, methods, paths, statuses, durations, and MCP tool/source operation status. MCPWarden does not log request bodies, authorization headers, bearer tokens, or tool arguments, and sensitive-looking values are redacted.

## Security Notes

The service is intended for local use. Bind to `127.0.0.1` unless you have added an external network security layer. Non-health endpoints require a bearer token, reject browser `Origin` headers, and require JSON content for POST requests. Approval-required workflows do not run in the current service runtime.
