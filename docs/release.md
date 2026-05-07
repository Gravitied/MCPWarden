# Release Process

This document describes the public release checklist for MCPWarden.

## Preconditions

- `main` is clean.
- `CHANGELOG.md` has an entry for the version.
- `package.json` version matches `src/packageInfo.ts`.
- `README.md` and `docs/` describe any user-visible behavior changes.
- Security-sensitive changes include tests in `tests/security/`.

## Local Verification

Run:

```powershell
pnpm install
pnpm release:check
```

`pnpm release:check` runs build, lint, all tests, package smoke testing, and dependency audit.

Inspect the package contents:

```powershell
npm pack --dry-run --json
```

The tarball should include:

- `dist/`
- `templates/`
- `examples/`
- `docs/`
- `README.md`
- `LICENSE`
- `CHANGELOG.md`
- `SECURITY.md`
- `package.json`

## GitHub Release

1. Create a version tag:

```powershell
git tag v0.1.0
git push origin v0.1.0
```

2. Confirm CI passes on the tag.
3. Create a GitHub release using the matching `CHANGELOG.md` entry.

## npm Publish

The GitHub release workflow publishes to npm when a `v*` tag is pushed. It uses `npm publish --provenance` and requires the repository secret `NPM_TOKEN`.

Manual publish fallback:

```powershell
pnpm release:check
npm publish --provenance --access public
```
