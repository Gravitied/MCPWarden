# MCPWarden Development Guide

## Setup

```powershell
pnpm install
```

## Daily Checks

```powershell
pnpm check
pnpm test
```

## Full Verification

```powershell
pnpm check
pnpm test
pnpm test:effectiveness
pnpm test:security
pnpm test:e2e
pnpm test:package
```

## Build

```powershell
pnpm build
```

The production build uses `tsconfig.build.json` and emits runtime files into `dist/`.

## Package Smoke Test

```powershell
pnpm test:package
```

This test:

1. runs `npm pack`.
2. inspects the tarball file list.
3. installs the tarball into a temporary project.
4. verifies that `npx mcpw --version` works.

## Source Style

- TypeScript modules use ESM.
- Runtime source lives under `src/`.
- Tests live under `tests/`.
- Manual file edits should stay focused and small.
- Prefer structured parsing and schemas over stringly typed validation.

## Test Types

- `tests/unit`: focused behavior tests.
- `tests/security`: policy and safety boundary tests.
- `tests/property`: property-based Workflow IR validation tests.
- `tests/e2e`: CLI and package smoke tests.
- `tests/bench`: benchmark harnesses.

## Adding A Tool Source Adapter

1. Define or reuse a source config schema.
2. Implement `ToolSourceAdapter`.
3. Convert raw source tools into `ImportedTool`.
4. Preserve raw source data for diagnostics.
5. Require overrides before creating executable manifests.
6. Add unit tests for import and diagnostics.
7. Add security tests that prove missing metadata stays denied.

## Adding A Broker

1. Implement `ToolBroker`.
2. Keep connection setup and teardown inside the broker.
3. Route only approved workflow calls to the broker.
4. Close external connections after calls.
5. Add tests with fake clients and at least one integration-style fixture where possible.

## Release Checklist

- `pnpm release:check`
- `pnpm check`
- `pnpm test`
- `pnpm test:security`
- `pnpm test:e2e`
- `pnpm test:package`
- `npm pack --dry-run --json --ignore-scripts`
- Inspect package contents for `dist/cli.js`.
- Confirm package contents exclude `src/`, `tests/`, `coverage/`, and `dist/tests/`.

See [Release Process](release.md) for tag and npm publish steps.
