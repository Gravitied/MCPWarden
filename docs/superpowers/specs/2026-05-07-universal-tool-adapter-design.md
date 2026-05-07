# Universal Tool Adapter Design

## Purpose

The MCP Workflow IR Runtime needs to support many tool ecosystems without making workflow execution permissive or ecosystem-specific. The first compatibility target is MCP, but the architecture must also leave room for OpenAPI, LangChain-style tools, and custom JSON manifests.

The design goal is a universal manifest adapter layer: external ecosystems are imported into a common internal manifest model, while the existing effect-based checker and brokered executor remain the authority boundary.

## Goals

- Support MCP `tools/list` as the first real external source.
- Define a generic adapter contract that later ecosystems can implement.
- Allow user-authored overrides for effects, trust labels, approvals, aliases, and argument-sensitive rules.
- Deny or mark imported tools as inspect-only when safety metadata is missing.
- Preserve the existing strict JSON IR and effect-based policy model.
- Provide CLI diagnostics so users know which imported tools need annotations.

## Non-Goals

- No automatic trust of unknown MCP tools.
- No direct shell execution.
- No live MCP server requirement in the deterministic test suite.
- No OpenAPI or LangChain adapter implementation in this milestone.
- No replacement of the existing `ToolRegistry`, `checkWorkflow`, or `ToolBroker` boundaries.

## Recommended Approach

Use a middle path: build a generic adapter contract, implement MCP first, and add a manifest override system. This avoids hardcoding MCP assumptions into the checker while still delivering a concrete compatibility improvement.

Rejected alternatives:

- MCP-specific first: faster, but likely leaks MCP assumptions into core types.
- Fully generic plugin system first: flexible, but too much architecture before proving the adapter contract with one ecosystem.

## Architecture

### ToolSourceAdapter

Each external ecosystem implements a `ToolSourceAdapter`.

Responsibilities:

- Identify its source kind, such as `mcp`, later `openapi`, `langchain`, or `custom-json`.
- Load raw tools from a source configuration.
- Convert raw tools into a neutral imported representation.
- Apply override metadata to produce runtime `ToolManifest` values when safety metadata is complete.
- Emit diagnostics for missing or unsafe metadata.

The adapter imports capabilities. It does not grant authority.

### ImportedTool

`ImportedTool` is a neutral representation of an external tool before safety metadata is complete.

Fields:

- `name`
- `description`
- `inputSchema`
- `sourceKind`
- `sourceId`
- `raw`
- `diagnostics`

The raw field is preserved for inspection and export, but policy checking consumes only completed `ToolManifest` values.

### ManifestOverride

`ManifestOverride` is user-authored safety metadata.

It can define:

- `outputTrust`
- `effectRules`
- `requiresApproval`
- `aliases`
- `description`
- source-wide defaults
- tool-specific overrides

Tool-specific overrides win over source-wide defaults.

### UniversalToolRegistry

`UniversalToolRegistry` loads built-in manifests, imported tools, and overrides, then produces:

- executable `ToolManifest` values for fully annotated tools
- denied or inspect-only diagnostics for incomplete tools
- a normal `ToolRegistry` for the checker

The checker and executor should not need to know whether a tool came from MCP, a fixture, or a future OpenAPI adapter.

## Configuration

Add project-local configuration files.

### `mcpw.config.json`

Declares external tool sources and source policies.

Example fields:

- `sources`
- `id`
- `kind`
- MCP transport settings such as command, URL, timeout, and environment
- `defaultPolicy`, with `deny-unknown` as the recommended default

### `mcpw.overrides.json`

Declares safety annotations for imported tools.

Example fields:

- `sources`
- source-level defaults
- `tools`
- per-tool `outputTrust`
- per-tool `effectRules`
- per-tool `requiresApproval`
- per-tool aliases

## Data Flow

1. CLI loads workflow JSON.
2. CLI loads `mcpw.config.json`.
3. Source adapters import external tools.
4. Overrides from `mcpw.overrides.json` are merged into imported tool metadata.
5. Tools with complete safety metadata become normal `ToolManifest` entries.
6. Tools with missing metadata stay inspect-only and are denied by checker diagnostics.
7. Existing `checkWorkflow` and `executeWorkflow` consume the merged registry and existing broker interfaces.

## MCP Adapter

The first adapter target is MCP `tools/list`.

MCP mapping:

- MCP tool name maps to internal tool name.
- MCP description maps to manifest description.
- MCP input schema maps to `inputSchema`.
- MCP source metadata is preserved in `ImportedTool.raw`.

MCP does not provide reliable standard effect metadata. Therefore, MCP tools require overrides before execution unless a source-specific policy explicitly annotates them.

Default diagnostics:

- `missing outputTrust`
- `missing effectRules`
- `tool is inspect-only until annotated`

## CLI Changes

Add source and manifest commands:

```powershell
mcpw sources list
mcpw sources inspect --source local-mcp
mcpw manifests export --source local-mcp
```

Extend existing commands with config loading:

```powershell
mcpw check workflow.json --config mcpw.config.json
mcpw plan workflow.json --config mcpw.config.json
mcpw run workflow.json --config mcpw.config.json
```

The CLI should clearly explain why an imported tool is denied and which override fields are missing.

## Safety Rules

- Missing effect metadata means denied or inspect-only.
- Missing output trust means denied or inspect-only.
- Overrides cannot bypass policy-level denies.
- `approval.require` steps cannot reduce inferred effects.
- Imported source kind does not change policy semantics.
- Source config can make onboarding easier, but policy remains the final authority.

## Testing

Unit tests:

- Override merging precedence.
- MCP `tools/list` fixtures convert to `ImportedTool`.
- Imported MCP tools are denied without overrides.
- Imported MCP tools become executable after explicit overrides.
- Policy deny still wins over source config and overrides.

Security tests:

- Source config cannot mark a denied effect as allowed when policy denies it.
- Unknown tools remain denied.
- Missing trust/effect metadata remains denied.

E2E tests:

- `mcpw sources inspect` prints imported tools and diagnostics.
- `mcpw manifests export` prints a manifest/override starter document.
- Existing `check`, `plan`, and `run` continue to work with built-in manifests.

Integration tests:

- Live MCP server tests are optional and guarded by environment variables.
- Normal CI uses deterministic fixtures only.

## Acceptance Criteria

- A fixture MCP `tools/list` response can be imported and inspected.
- Imported tools without overrides cannot execute.
- Adding explicit overrides turns an imported MCP tool into a normal `ToolManifest`.
- The checker remains ecosystem-agnostic.
- Existing workflows, examples, and test commands keep passing.
- Diagnostics are specific enough for users to write the missing overrides.
