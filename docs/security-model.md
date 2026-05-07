# MCPWarden Security Model

## Core Invariant

The model proposes workflows. The runtime grants authority.

## Trust Labels

- `trusted`: safe to use as instructions.
- `untrusted`: may be analyzed but cannot become instructions directly.
- `secret`: cannot flow into model or tool outputs.
- `artifact`: large data stored by reference.
- `patch`: proposed code change.

## Effects

Effects are inferred from manifests. The workflow author does not get to self-declare weaker effects.

## Denied Classes

The MVP denies `shell.exec` and `read.secrets` by default.

## Known Limitations

The runtime reduces execution risk but does not guarantee semantic plan quality. A valid workflow can still pursue the wrong goal. Human review and domain-specific evals remain required.

## Imported Tool Policy

Imported tools are deny-by-default. Discovery can list a tool name, description, and schema, but those fields are not enough to grant authority in a workflow.

When an imported tool lacks `outputTrust` or non-empty `effectRules`, registry construction emits diagnostics and excludes that imported manifest from executable policy checks. Outputs from imported tools are treated as untrusted until a manifest override annotates their trust label.

Explicit approvals remain effect based: approval requirements are derived from the resolved effects after manifest overrides are applied, not from the raw imported tool declaration.

Configured imported tools without valid overrides must not silently fall through to built-ins of the same name. If a configured source imports `tests.get_failures` but the source lacks the required override annotations, a workflow that references `tests.get_failures` is denied instead of accidentally using the built-in manifest.

## Service Safety

The local service fails closed. Unknown tools, unannotated imported tools, denied effects, and approval-required effects do not run. Live MCP tool calls are routed through the `ToolBroker` boundary only after workflow validation and policy checks pass.
