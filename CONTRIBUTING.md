# Contributing

MCPWarden is a TypeScript project using pnpm, Vitest, ESLint, and the official MCP TypeScript SDK.

## Setup

```powershell
pnpm install
pnpm check
pnpm test
```

## Development Workflow

1. Create a focused branch.
2. Add or update tests before changing behavior.
3. Keep changes scoped to one concern.
4. Run the relevant focused tests.
5. Run the full release check before asking for review:

```powershell
pnpm release:check
```

## Security-Sensitive Changes

Changes touching these areas need focused regression tests:

- `src/policy/`
- `src/service/`
- `src/runtime/`
- `src/manifests/`
- `src/adapters/mcp*`

When changing policy, trust, or service behavior, include tests under `tests/security/` that fail on the old behavior.

## Commit Style

Use concise conventional-style commit messages:

- `feat: add ...`
- `fix: prevent ...`
- `docs: document ...`
- `test: cover ...`
- `chore: update ...`

## Pull Request Checklist

- Tests added or updated for behavior changes.
- `pnpm check` passes.
- `pnpm test` passes.
- `pnpm test:package` passes when package contents or CLI behavior changes.
- Docs updated for user-visible behavior.
- Security impact considered for MCP, workflow, local service, and secret-handling paths.
