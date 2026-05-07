# Changelog

All notable changes to MCPWarden are documented here.

## 0.1.0 - 2026-05-07

Initial public release candidate.

### Added

- Strict JSON Workflow IR validation.
- CLI command `mcpw` with `init`, `doctor`, `check`, `plan`, `run`, `serve`, source inspection, and manifest export.
- Local HTTP service for workflow check, plan, and run operations.
- MCP `tools/list` import from fixture and stdio sources.
- Manifest overrides for imported tool trust labels, effects, approvals, aliases, and descriptions.
- Fail-closed imported tool behavior when trust/effect metadata is missing.
- Policy checker for allowed, denied, and approval-required effects.
- Trust-flow checks for secret and untrusted values.
- Trust-aware redaction of secret step outputs.
- Bearer-token and browser-origin protections for local service endpoints.
- Package smoke test that packs, installs, and validates the `mcpw` binary.

### Security

- Default policy denies `read.secrets` and `shell.exec`.
- Approval-required workflows do not run through the service runtime.
- Imported MCP tools remain inspect-only until annotated.
- Non-health service endpoints require authorization and JSON POST bodies.
