# Production Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn MCP Workflow IR Runtime into an installable `mcpw` package with a local service mode, first-run setup, health checks, and live stdio MCP support.

**Architecture:** Keep policy and workflow execution boundaries intact. Add production surfaces around them: clean package build, config discovery, init/doctor commands, a small Node HTTP service, and an MCP-backed `ToolBroker` behind the existing broker interface. The CLI should use the same helpers as the service so checks, plans, and runs behave consistently.

**Tech Stack:** TypeScript, Node.js 22+, Commander, Zod, Vitest, Node `http`, Node `fs/promises`, `@modelcontextprotocol/sdk` v1.x.

---

## File Structure

- Create `tsconfig.build.json`: production-only TypeScript build config that emits `src/cli.ts` to `dist/cli.js` and excludes tests.
- Modify `package.json`: make package publishable, correct `bin`, add `files`, `exports`, `engines`, `prepack`, smoke scripts, and MCP SDK dependency.
- Create `templates/mcpw.config.json`: starter fixture config for `mcpw init`.
- Create `templates/mcpw.overrides.json`: starter empty overrides file.
- Create `templates/example.workflow.json`: starter safe workflow.
- Create `src/packageInfo.ts`: central runtime name/version constants.
- Create `src/config/paths.ts`: config and override discovery helpers.
- Modify `src/config/config.ts`: add `service` config defaults.
- Modify `src/config/loadConfig.ts`: support explicit overrides path and config discovery.
- Create `src/cli/init.ts`: init command implementation.
- Create `src/cli/doctor.ts`: doctor command implementation.
- Create `src/cli/output.ts`: human/JSON command response helpers.
- Create `src/service/httpService.ts`: local HTTP service and route handlers.
- Create `src/service/workflowHandlers.ts`: shared check/plan/run workflow operations for CLI and service.
- Create `src/adapters/mcpClient.ts`: small MCP client abstraction with SDK-backed and fake implementations.
- Modify `src/adapters/mcpToolsListAdapter.ts`: support fixture and stdio `tools/list` through `McpClientFactory`.
- Create `src/adapters/mcpToolBroker.ts`: MCP-backed `ToolBroker` implementation for approved runs.
- Create `src/adapters/compositeToolBroker.ts`: broker that routes imported tools to MCP and built-in/demo tools to the mock broker.
- Modify `src/cli.ts`: wire `init`, `doctor`, `serve`, JSON output, config discovery, and real broker selection.
- Modify `src/index.ts`: export public production APIs.
- Modify `README.md`: document install, init, doctor, inspect, serve, check, plan, run, package smoke flow.
- Create `tests/unit/config-paths.test.ts`: config discovery tests.
- Create `tests/unit/init.test.ts`: init command tests.
- Create `tests/unit/doctor.test.ts`: doctor command tests.
- Create `tests/unit/service.test.ts`: route handler tests.
- Create `tests/unit/mcp-broker.test.ts`: MCP broker fake-client tests.
- Create `tests/security/service-policy.test.ts`: service policy boundary tests.
- Modify `tests/unit/mcp-adapter.test.ts`: stdio MCP client factory coverage.
- Modify `tests/e2e/cli.test.ts`: init, doctor, serve, JSON output coverage.
- Create `tests/e2e/package-smoke.test.ts`: npm pack/install smoke test.

---

### Task 1: Clean Downloadable Package

**Files:**
- Create: `tsconfig.build.json`
- Modify: `package.json`
- Create: `src/packageInfo.ts`
- Modify: `src/cli.ts`
- Modify: `src/index.ts`
- Test: `tests/e2e/package-smoke.test.ts`

- [ ] **Step 1: Write failing package smoke test**

Create `tests/e2e/package-smoke.test.ts`:

```ts
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);

describe("npm package smoke test", () => {
  it("packs, installs, and exposes a working mcpw binary", async () => {
    const temp = await mkdtemp(join(tmpdir(), "mcpw-package-"));
    try {
      const { stdout: packStdout } = await exec("npm", ["pack", "--silent"], { cwd: process.cwd() });
      const tarball = join(process.cwd(), packStdout.trim().split(/\r?\n/).at(-1) ?? "");
      const { stdout: contents } = await exec("npm", ["pack", "--dry-run"], { cwd: process.cwd() });

      expect(contents).toContain("dist/cli.js");
      expect(contents).not.toContain("dist/tests/");
      expect(contents).not.toContain("src/cli.ts");
      expect(contents).not.toContain("coverage/");

      await exec("npm", ["init", "-y"], { cwd: temp });
      await exec("npm", ["install", tarball], { cwd: temp });
      const command = process.platform === "win32" ? "npx.cmd" : "npx";
      const { stdout } = await exec(command, ["mcpw", "--version"], { cwd: temp });

      expect(stdout.trim()).toBe("0.1.0");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }, 120000);
});
```

- [ ] **Step 2: Run package smoke test and verify failure**

Run: `pnpm test tests/e2e/package-smoke.test.ts`

Expected: FAIL because the package still points `bin.mcpw` at `./dist/cli.js` while the build emits `dist/src/cli.js`, and the tarball includes `src/` and built tests.

- [ ] **Step 3: Add production build config**

Create `tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["tests", "coverage", "dist", "node_modules"]
}
```

- [ ] **Step 4: Add package info module**

Create `src/packageInfo.ts`:

```ts
export const packageName = "mcp-workflow-ir-runtime";
export const runtimeVersion = "0.1.0";
```

- [ ] **Step 5: Use package info in CLI and public exports**

Modify `src/cli.ts` imports and `program.version`:

```ts
import { runtimeVersion } from "./packageInfo.js";

program.name("mcpw").description("Policy-checkable workflow IR runtime for MCP agents").version(runtimeVersion);
```

Modify `src/index.ts`:

```ts
export * from "./packageInfo.js";
```

Remove the previous inline `export const runtimeVersion = "0.1.0";` from `src/index.ts`.

- [ ] **Step 6: Update package metadata**

Modify `package.json`:

```json
{
  "name": "mcp-workflow-ir-runtime",
  "version": "0.1.0",
  "private": false,
  "type": "module",
  "bin": {
    "mcpw": "./dist/cli.js"
  },
  "exports": {
    ".": "./dist/index.js",
    "./package.json": "./package.json"
  },
  "files": [
    "dist",
    "templates",
    "examples",
    "docs",
    "README.md",
    "package.json"
  ],
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "check": "pnpm build && pnpm lint",
    "lint": "eslint .",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest",
    "test:security": "vitest run tests/security",
    "test:e2e": "vitest run tests/e2e",
    "test:package": "vitest run tests/e2e/package-smoke.test.ts",
    "bench": "vitest bench tests/bench",
    "cli": "tsx src/cli.ts",
    "prepack": "pnpm build"
  },
  "dependencies": {
    "@commander-js/extra-typings": "^13.0.0",
    "@modelcontextprotocol/sdk": "^1.17.5",
    "commander": "^13.0.0",
    "zod": "^3.24.0"
  }
}
```

Keep the existing `devDependencies` block.

- [ ] **Step 7: Run package smoke test**

Run: `pnpm test tests/e2e/package-smoke.test.ts`

Expected: PASS and `npm pack --dry-run` output includes `dist/cli.js` and excludes `src/` and `dist/tests/`.

- [ ] **Step 8: Commit**

Run:

```powershell
git add package.json pnpm-lock.yaml tsconfig.build.json src/packageInfo.ts src/cli.ts src/index.ts tests/e2e/package-smoke.test.ts
git commit -m "build: package mcpw as installable runtime"
```

---

### Task 2: Config Discovery And First-Run Init

**Files:**
- Create: `templates/mcpw.config.json`
- Create: `templates/mcpw.overrides.json`
- Create: `templates/example.workflow.json`
- Create: `src/config/paths.ts`
- Modify: `src/config/config.ts`
- Modify: `src/config/loadConfig.ts`
- Create: `src/cli/init.ts`
- Modify: `src/cli.ts`
- Test: `tests/unit/config-paths.test.ts`
- Test: `tests/unit/init.test.ts`
- Modify: `tests/e2e/cli.test.ts`

- [ ] **Step 1: Write failing config discovery tests**

Create `tests/unit/config-paths.test.ts`:

```ts
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverConfigPaths } from "../../src/config/paths.js";

describe("config path discovery", () => {
  it("uses explicit config and sibling overrides", async () => {
    const cwd = await mkdir(join(tmpdir(), `mcpw-paths-${Date.now()}`), { recursive: true });
    try {
      const configPath = join(cwd, "custom.config.json");
      const overridesPath = join(cwd, "custom.overrides.json");
      await writeFile(configPath, "{}");
      await writeFile(overridesPath, "{}");

      const paths = await discoverConfigPaths({ cwd, configPath });

      expect(paths.configPath).toBe(resolve(configPath));
      expect(paths.overridesPath).toBe(resolve(overridesPath));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("falls back to mcpw.config.json in cwd", async () => {
    const cwd = await mkdir(join(tmpdir(), `mcpw-paths-${Date.now()}`), { recursive: true });
    try {
      await writeFile(join(cwd, "mcpw.config.json"), "{}");
      const paths = await discoverConfigPaths({ cwd });
      expect(paths.configPath).toBe(resolve(cwd, "mcpw.config.json"));
      expect(paths.overridesPath).toBe(resolve(cwd, "mcpw.overrides.json"));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Write failing init tests**

Create `tests/unit/init.test.ts`:

```ts
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initializeProject } from "../../src/cli/init.js";

describe("mcpw init", () => {
  it("creates starter config, overrides, and workflow files", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "mcpw-init-"));
    try {
      const result = await initializeProject({ cwd });

      expect(result.created.map((item) => item.name).sort()).toEqual([
        "example.workflow.json",
        "mcpw.config.json",
        "mcpw.overrides.json"
      ]);
      expect(await readFile(join(cwd, "mcpw.config.json"), "utf8")).toContain("\"sources\"");
      expect(await readFile(join(cwd, "example.workflow.json"), "utf8")).toContain("\"workflow\"");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("does not overwrite existing files", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "mcpw-init-"));
    try {
      await writeFile(join(cwd, "mcpw.config.json"), "{\"sentinel\":true}");
      const result = await initializeProject({ cwd });

      expect(result.skipped.map((item) => item.name)).toContain("mcpw.config.json");
      expect(await readFile(join(cwd, "mcpw.config.json"), "utf8")).toBe("{\"sentinel\":true}");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 3: Run new unit tests and verify failure**

Run: `pnpm test tests/unit/config-paths.test.ts tests/unit/init.test.ts`

Expected: FAIL because `src/config/paths.ts` and `src/cli/init.ts` do not exist.

- [ ] **Step 4: Add template files**

Create `templates/mcpw.config.json`:

```json
{
  "service": {
    "host": "127.0.0.1",
    "port": 8765
  },
  "sources": []
}
```

Create `templates/mcpw.overrides.json`:

```json
{
  "sources": {}
}
```

Create `templates/example.workflow.json`:

```json
{
  "version": "0.1",
  "workflow": "starter_workflow",
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

- [ ] **Step 5: Add service config schema**

Modify `src/config/config.ts` so `mcpwConfigSchema` includes service defaults:

```ts
export const serviceConfigSchema = z.object({
  host: z.string().default("127.0.0.1"),
  port: z.number().int().min(0).max(65535).default(8765)
});

export const mcpwConfigSchema = z.object({
  service: serviceConfigSchema.default({}),
  sources: z.array(mcpSourceConfigSchema).default([])
});
```

Export `ServiceConfig`:

```ts
export type ServiceConfig = z.infer<typeof serviceConfigSchema>;
```

- [ ] **Step 6: Implement config discovery**

Create `src/config/paths.ts`:

```ts
import { access } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

export type ConfigPathInput = {
  cwd?: string;
  configPath?: string;
  overridesPath?: string;
};

export type DiscoveredConfigPaths = {
  configPath?: string;
  overridesPath?: string;
};

export async function discoverConfigPaths(input: ConfigPathInput = {}): Promise<DiscoveredConfigPaths> {
  const cwd = resolve(input.cwd ?? process.cwd());
  const configPath = input.configPath ? resolve(cwd, input.configPath) : await existingPath(resolve(cwd, "mcpw.config.json"));
  const overridesPath = input.overridesPath
    ? resolve(cwd, input.overridesPath)
    : configPath
      ? siblingOverridesPath(configPath)
      : await existingPath(resolve(cwd, "mcpw.overrides.json"));

  return { configPath, overridesPath };
}

function siblingOverridesPath(configPath: string): string {
  const filename = basename(configPath);
  return resolve(dirname(configPath), filename.endsWith("config.json") ? filename.replace(/config\.json$/, "overrides.json") : "mcpw.overrides.json");
}

async function existingPath(path: string): Promise<string | undefined> {
  try {
    await access(path);
    return path;
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 7: Update config loaders**

Modify `src/config/loadConfig.ts`:

```ts
import { readFile } from "node:fs/promises";
import { parseManifestOverrides, parseMcpwConfig, type ManifestOverrides, type McpwConfig } from "./config.js";
import { discoverConfigPaths, type ConfigPathInput } from "./paths.js";

export async function loadMcpwConfig(path = "mcpw.config.json"): Promise<McpwConfig> {
  try {
    return parseMcpwConfig(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (isNotFound(error)) return parseMcpwConfig({});
    throw error;
  }
}

export async function loadManifestOverrides(path = "mcpw.overrides.json"): Promise<ManifestOverrides> {
  try {
    return parseManifestOverrides(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (isNotFound(error)) return { sources: {} };
    throw error;
  }
}

export async function loadConfigBundle(input: ConfigPathInput = {}): Promise<{
  config: McpwConfig;
  overrides: ManifestOverrides;
  configPath?: string;
  overridesPath?: string;
}> {
  const paths = await discoverConfigPaths(input);
  const config = paths.configPath ? await loadMcpwConfig(paths.configPath) : parseMcpwConfig({});
  const overrides = paths.overridesPath ? await loadManifestOverrides(paths.overridesPath) : { sources: {} };
  return { config, overrides, configPath: paths.configPath, overridesPath: paths.overridesPath };
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
```

- [ ] **Step 8: Implement init helper**

Create `src/cli/init.ts`:

```ts
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type InitResultItem = { name: string; path: string };
export type InitResult = { created: InitResultItem[]; skipped: InitResultItem[] };

const templateDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "templates");

const files = [
  { name: "mcpw.config.json", template: "mcpw.config.json" },
  { name: "mcpw.overrides.json", template: "mcpw.overrides.json" },
  { name: "example.workflow.json", template: "example.workflow.json" }
];

export async function initializeProject(input: { cwd?: string } = {}): Promise<InitResult> {
  const cwd = resolve(input.cwd ?? process.cwd());
  await mkdir(cwd, { recursive: true });
  const result: InitResult = { created: [], skipped: [] };

  for (const file of files) {
    const target = join(cwd, file.name);
    try {
      await copyFile(join(templateDir, file.template), target, 1);
      result.created.push({ name: file.name, path: target });
    } catch (error) {
      if (isAlreadyExists(error)) {
        result.skipped.push({ name: file.name, path: target });
        continue;
      }
      throw error;
    }
  }

  return result;
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
```

- [ ] **Step 9: Wire `mcpw init`**

Modify `src/cli.ts`:

```ts
import { initializeProject } from "./cli/init.js";
```

Add before `sourcesCommand`:

```ts
program.command("init").description("Create starter mcpw config and workflow files").action(async () => {
  const result = await initializeProject();
  for (const item of result.created) console.log(`created ${item.name}`);
  for (const item of result.skipped) console.log(`exists  ${item.name}`);
});
```

- [ ] **Step 10: Add init e2e coverage**

Append to `tests/e2e/cli.test.ts`:

```ts
  it("initializes starter project files", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "mcpw-cli-init-"));
    try {
      const { stdout } = await runCli(["init"], cwd);
      expect(stdout).toContain("created mcpw.config.json");
      expect(await readFile(join(cwd, "mcpw.config.json"), "utf8")).toContain("\"sources\"");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
```

Update the test imports and helper:

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cliPath = resolve("src/cli.ts");

async function runCli(args: string[], cwd = process.cwd()) {
  return exec(process.execPath, ["--import", "tsx", cliPath, ...args], { cwd });
}
```

- [ ] **Step 11: Run init tests**

Run: `pnpm test tests/unit/config-paths.test.ts tests/unit/init.test.ts tests/e2e/cli.test.ts`

Expected: PASS.

- [ ] **Step 12: Commit**

Run:

```powershell
git add templates src/config src/cli/init.ts src/cli.ts tests/unit/config-paths.test.ts tests/unit/init.test.ts tests/e2e/cli.test.ts
git commit -m "feat: add first-run init and config discovery"
```

---

### Task 3: Doctor Command And Typed Output

**Files:**
- Create: `src/cli/output.ts`
- Create: `src/cli/doctor.ts`
- Modify: `src/cli.ts`
- Test: `tests/unit/doctor.test.ts`
- Modify: `tests/e2e/cli.test.ts`

- [ ] **Step 1: Write failing doctor tests**

Create `tests/unit/doctor.test.ts`:

```ts
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runDoctor } from "../../src/cli/doctor.js";

describe("doctor", () => {
  it("passes for fixture config with discoverable tools", async () => {
    const result = await runDoctor({ configPath: "examples/mcpw.config.json" });

    expect(result.ok).toBe(true);
    expect(result.checks.map((check) => check.code)).toContain("CONFIG_OK");
    expect(result.checks.map((check) => check.code)).toContain("SOURCE_OK");
  });

  it("reports invalid config as CONFIG_INVALID", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "mcpw-doctor-"));
    try {
      const configPath = join(cwd, "mcpw.config.json");
      await writeFile(configPath, "{");
      const result = await runDoctor({ configPath });

      expect(result.ok).toBe(false);
      expect(result.checks.some((check) => check.code === "CONFIG_INVALID")).toBe(true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run doctor test and verify failure**

Run: `pnpm test tests/unit/doctor.test.ts`

Expected: FAIL because `src/cli/doctor.ts` does not exist.

- [ ] **Step 3: Implement output helpers**

Create `src/cli/output.ts`:

```ts
export type CommandEnvelope<TDetails = unknown> =
  | { ok: true; details: TDetails }
  | { ok: false; code: string; message: string; details?: TDetails };

export function printEnvelope(envelope: CommandEnvelope, json = false): void {
  if (json) {
    console.log(JSON.stringify(envelope, null, 2));
    return;
  }

  if (envelope.ok) {
    console.log("OK");
    if (typeof envelope.details === "string") console.log(envelope.details);
    return;
  }

  console.error(`${envelope.code}: ${envelope.message}`);
}
```

- [ ] **Step 4: Implement doctor helper**

Create `src/cli/doctor.ts`:

```ts
import { readFile } from "node:fs/promises";
import { ZodError } from "zod";
import { parseMcpwConfig } from "../config/config.js";
import { loadConfigBundle } from "../config/loadConfig.js";
import { demoTools } from "../manifests/demoManifests.js";
import { buildUniversalToolRegistry } from "../manifests/universalRegistry.js";
import { runtimeVersion } from "../packageInfo.js";

export type DoctorCheck = { code: string; ok: boolean; message: string };
export type DoctorResult = { ok: boolean; version: string; checks: DoctorCheck[] };

export async function runDoctor(input: { configPath?: string; overridesPath?: string } = {}): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  checks.push({ code: "NODE_OK", ok: true, message: `node ${process.version}` });
  checks.push({ code: "PACKAGE_OK", ok: true, message: `mcpw ${runtimeVersion}` });

  try {
    if (input.configPath) parseMcpwConfig(JSON.parse(await readFile(input.configPath, "utf8")));
    const bundle = await loadConfigBundle(input);
    checks.push({ code: "CONFIG_OK", ok: true, message: bundle.configPath ?? "using empty default config" });

    const registry = await buildUniversalToolRegistry({
      builtInTools: demoTools,
      sources: bundle.config.sources,
      overrides: bundle.overrides
    });

    checks.push({
      code: "SOURCE_OK",
      ok: true,
      message: `${registry.importedTools.length} imported tools, ${registry.diagnostics.length} diagnostics`
    });
  } catch (error) {
    checks.push({
      code: error instanceof ZodError ? "CONFIG_INVALID" : "MCP_TOOLS_LIST_FAILED",
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    });
  }

  return { ok: checks.every((check) => check.ok), version: runtimeVersion, checks };
}
```

- [ ] **Step 5: Wire `mcpw doctor` and `--json`**

Modify `src/cli.ts`:

```ts
import { runDoctor } from "./cli/doctor.js";

program.command("doctor")
  .option("--config <path>")
  .option("--overrides <path>")
  .option("--json", "print JSON output")
  .action(async (options: { config?: string; overrides?: string; json?: boolean }) => {
    const result = await runDoctor({ configPath: options.config, overridesPath: options.overrides });
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      for (const check of result.checks) console.log(`${check.ok ? "OK" : "FAIL"} ${check.code} ${check.message}`);
    }
    if (!result.ok) process.exitCode = 1;
  });
```

- [ ] **Step 6: Add doctor e2e coverage**

Append to `tests/e2e/cli.test.ts`:

```ts
  it("runs doctor in JSON mode", async () => {
    const { stdout } = await runCli(["doctor", "--config", "examples/mcpw.config.json", "--json"]);
    const result = JSON.parse(stdout);
    expect(result.ok).toBe(true);
    expect(result.checks.some((check: { code: string }) => check.code === "SOURCE_OK")).toBe(true);
  });
```

- [ ] **Step 7: Run doctor tests**

Run: `pnpm test tests/unit/doctor.test.ts tests/e2e/cli.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```powershell
git add src/cli/doctor.ts src/cli/output.ts src/cli.ts tests/unit/doctor.test.ts tests/e2e/cli.test.ts
git commit -m "feat: add mcpw doctor"
```

---

### Task 4: Local HTTP Service

**Files:**
- Create: `src/service/workflowHandlers.ts`
- Create: `src/service/httpService.ts`
- Modify: `src/cli.ts`
- Modify: `src/index.ts`
- Test: `tests/unit/service.test.ts`
- Test: `tests/security/service-policy.test.ts`
- Modify: `tests/e2e/cli.test.ts`

- [ ] **Step 1: Write failing service unit tests**

Create `tests/unit/service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createService } from "../../src/service/httpService.js";

describe("local service", () => {
  it("serves health and sources endpoints", async () => {
    const service = await createService({ configPath: "examples/mcpw.config.json", port: 0 });
    await service.start();
    try {
      const health = await fetch(`${service.url}/health`).then((response) => response.json());
      expect(health.ok).toBe(true);
      expect(health.version).toBe("0.1.0");

      const sources = await fetch(`${service.url}/sources`).then((response) => response.json());
      expect(sources.sources[0].id).toBe("fixture-mcp");
    } finally {
      await service.stop();
    }
  });

  it("checks workflows through the service", async () => {
    const service = await createService({ configPath: "examples/mcpw.config.json", port: 0 });
    await service.start();
    try {
      const response = await fetch(`${service.url}/workflows/check`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          version: "0.1",
          workflow: "imported_mcp_tool",
          steps: [{ id: "failures", op: "tool.call", tool: "tests.get_failures", args: { limit: 1 } }]
        })
      });
      const result = await response.json();
      expect(response.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.effects).toContain("read.tests");
    } finally {
      await service.stop();
    }
  });
});
```

- [ ] **Step 2: Write failing service security tests**

Create `tests/security/service-policy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createService } from "../../src/service/httpService.js";

describe("service policy boundaries", () => {
  it("refuses approval-required workflow runs", async () => {
    const service = await createService({ configPath: "examples/mcpw.config.json", port: 0 });
    await service.start();
    try {
      const response = await fetch(`${service.url}/workflows/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          version: "0.1",
          workflow: "mutating",
          steps: [{ id: "apply", op: "tool.call", tool: "repo.apply_patch", args: { mode: "apply", patch: {} } }]
        })
      });
      const result = await response.json();
      expect(response.status).toBe(403);
      expect(result.code).toBe("APPROVAL_REQUIRED");
    } finally {
      await service.stop();
    }
  });
});
```

- [ ] **Step 3: Run service tests and verify failure**

Run: `pnpm test tests/unit/service.test.ts tests/security/service-policy.test.ts`

Expected: FAIL because service modules do not exist.

- [ ] **Step 4: Implement shared workflow handlers**

Create `src/service/workflowHandlers.ts`:

```ts
import { MockAgentRegistry } from "../adapters/mockAgents.js";
import { MockToolBroker } from "../adapters/mockTools.js";
import { InMemoryArtifactStore } from "../artifacts/artifactStore.js";
import type { McpwConfig, ManifestOverrides } from "../config/config.js";
import { validateWorkflow } from "../ir/validate.js";
import { demoTools } from "../manifests/demoManifests.js";
import { buildUniversalToolRegistry } from "../manifests/universalRegistry.js";
import { checkWorkflow } from "../policy/checker.js";
import type { Policy } from "../policy/policy.js";
import { executeWorkflow } from "../runtime/executor.js";
import type { ToolBroker } from "../runtime/broker.js";

export type WorkflowOperationDeps = {
  config: McpwConfig;
  overrides: ManifestOverrides;
  policy: Policy;
  broker?: ToolBroker;
};

export async function checkWorkflowPayload(payload: unknown, deps: WorkflowOperationDeps) {
  const validation = validateWorkflow(payload);
  if (!validation.ok) return { ok: false, status: 400, code: "WORKFLOW_INVALID", message: validation.errors.join("\n") };

  const registryResult = await buildUniversalToolRegistry({
    builtInTools: demoTools,
    sources: deps.config.sources,
    overrides: deps.overrides
  });
  const result = checkWorkflow(validation.workflow, registryResult.registry, deps.policy);
  const denied = result.denied;
  if (denied.length > 0) return { ok: false, status: 403, code: "POLICY_DENIED", message: denied.join("\n") };
  return { ok: true, status: 200, workflow: validation.workflow.workflow, effects: result.effects, approvals: result.approvals, diagnostics: registryResult.diagnostics };
}

export async function runWorkflowPayload(payload: unknown, deps: WorkflowOperationDeps) {
  const checked = await checkWorkflowPayload(payload, deps);
  if (!checked.ok) return checked;
  if (checked.approvals.required.length > 0) {
    return { ok: false, status: 403, code: "APPROVAL_REQUIRED", message: `approval required: ${checked.approvals.required.join(",")}` };
  }

  const validation = validateWorkflow(payload);
  if (!validation.ok) return { ok: false, status: 400, code: "WORKFLOW_INVALID", message: validation.errors.join("\n") };

  const result = await executeWorkflow(validation.workflow, {
    broker: deps.broker ?? new MockToolBroker(),
    agents: new MockAgentRegistry(),
    artifacts: new InMemoryArtifactStore()
  });
  return { ok: result.ok, status: result.ok ? 200 : 500, ...result };
}
```

- [ ] **Step 5: Implement HTTP service**

Create `src/service/httpService.ts`:

```ts
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { loadConfigBundle } from "../config/loadConfig.js";
import { demoTools } from "../manifests/demoManifests.js";
import { buildUniversalToolRegistry } from "../manifests/universalRegistry.js";
import { runtimeVersion } from "../packageInfo.js";
import type { Policy } from "../policy/policy.js";
import { checkWorkflowPayload, runWorkflowPayload } from "./workflowHandlers.js";

const defaultPolicy: Policy = {
  allow: ["read.tests", "read.repo", "agent.debugger", "agent.coder", "run.tests"],
  requireApproval: ["write.repo", "write.github.issues"],
  deny: ["read.secrets", "shell.exec"]
};

export type ServiceOptions = {
  configPath?: string;
  overridesPath?: string;
  host?: string;
  port?: number;
  policy?: Policy;
};

export async function createService(options: ServiceOptions = {}) {
  const bundle = await loadConfigBundle({ configPath: options.configPath, overridesPath: options.overridesPath });
  const startedAt = Date.now();
  let server: Server | undefined;
  let url = "";

  server = createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        return send(response, 200, { ok: true, version: runtimeVersion, uptimeMs: Date.now() - startedAt, configPath: bundle.configPath });
      }
      if (request.method === "GET" && request.url === "/sources") {
        const registry = await buildUniversalToolRegistry({ builtInTools: demoTools, sources: bundle.config.sources, overrides: bundle.overrides });
        return send(response, 200, { sources: bundle.config.sources, diagnostics: registry.diagnostics, importedTools: registry.importedTools.map((tool) => tool.name) });
      }
      if (request.method === "POST" && request.url === "/workflows/check") {
        const result = await checkWorkflowPayload(await readJson(request), { config: bundle.config, overrides: bundle.overrides, policy: options.policy ?? defaultPolicy });
        return send(response, result.status, result);
      }
      if (request.method === "POST" && request.url === "/workflows/plan") {
        const result = await checkWorkflowPayload(await readJson(request), { config: bundle.config, overrides: bundle.overrides, policy: options.policy ?? defaultPolicy });
        return send(response, result.status, result);
      }
      if (request.method === "POST" && request.url === "/workflows/run") {
        const result = await runWorkflowPayload(await readJson(request), { config: bundle.config, overrides: bundle.overrides, policy: options.policy ?? defaultPolicy });
        return send(response, result.status, result);
      }
      return send(response, 404, { ok: false, code: "NOT_FOUND", message: "unknown endpoint" });
    } catch (error) {
      return send(response, 500, { ok: false, code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) });
    }
  });

  return {
    get url() {
      return url;
    },
    async start() {
      const host = options.host ?? bundle.config.service.host;
      const port = options.port ?? bundle.config.service.port;
      await new Promise<void>((resolve) => server!.listen(port, host, resolve));
      const address = server!.address() as AddressInfo;
      url = `http://${address.address}:${address.port}`;
    },
    async stop() {
      await new Promise<void>((resolve, reject) => server!.close((error) => (error ? reject(error) : resolve())));
    }
  };
}

function send(response: { writeHead(status: number, headers: Record<string, string>): void; end(body: string): void }, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
```

- [ ] **Step 6: Wire `mcpw serve`**

Modify `src/cli.ts`:

```ts
import { createService } from "./service/httpService.js";

program.command("serve")
  .option("--config <path>")
  .option("--overrides <path>")
  .option("--host <host>")
  .option("--port <port>")
  .action(async (options: { config?: string; overrides?: string; host?: string; port?: string }) => {
    const service = await createService({
      configPath: options.config,
      overridesPath: options.overrides,
      host: options.host,
      port: options.port ? Number(options.port) : undefined
    });
    await service.start();
    console.log(`mcpw service listening at ${service.url}`);
  });
```

- [ ] **Step 7: Export service APIs**

Append to `src/index.ts`:

```ts
export * from "./service/httpService.js";
export * from "./service/workflowHandlers.js";
```

- [ ] **Step 8: Add serve e2e coverage**

Append to `tests/e2e/cli.test.ts`:

```ts
  it("starts service and responds to health", async () => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/cli.ts", "serve", "--config", "examples/mcpw.config.json", "--port", "0"], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"]
    });
    try {
      const line = await onceStdoutLine(child);
      const url = line.match(/http:\/\/[^\s]+/)?.[0];
      expect(url).toBeDefined();
      const health = await fetch(`${url}/health`).then((response) => response.json());
      expect(health.ok).toBe(true);
    } finally {
      child.kill();
    }
  });
```

Add helper imports and function:

```ts
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

function onceStdoutLine(child: ChildProcessWithoutNullStreams): Promise<string> {
  return new Promise((resolve, reject) => {
    child.stdout.once("data", (data) => resolve(String(data)));
    child.stderr.once("data", (data) => reject(new Error(String(data))));
  });
}
```

- [ ] **Step 9: Run service tests**

Run: `pnpm test tests/unit/service.test.ts tests/security/service-policy.test.ts tests/e2e/cli.test.ts`

Expected: PASS.

- [ ] **Step 10: Commit**

Run:

```powershell
git add src/service src/cli.ts src/index.ts tests/unit/service.test.ts tests/security/service-policy.test.ts tests/e2e/cli.test.ts
git commit -m "feat: add local mcpw service"
```

---

### Task 5: Live Stdio MCP Adapter And Broker

**Files:**
- Create: `src/adapters/mcpClient.ts`
- Modify: `src/adapters/mcpToolsListAdapter.ts`
- Create: `src/adapters/mcpToolBroker.ts`
- Create: `src/adapters/compositeToolBroker.ts`
- Modify: `src/service/workflowHandlers.ts`
- Modify: `src/cli.ts`
- Modify: `src/index.ts`
- Modify: `tests/unit/mcp-adapter.test.ts`
- Create: `tests/unit/mcp-broker.test.ts`
- Modify: `tests/security/imported-tools-policy.test.ts`

- [ ] **Step 1: Write failing MCP adapter stdio factory test**

Append to `tests/unit/mcp-adapter.test.ts`:

```ts
  it("loads stdio tools through an MCP client factory", async () => {
    const adapter = new McpToolsListAdapter({
      clientFactory: {
        async createClient() {
          return {
            async listTools() {
              return fixtureMcpToolsList;
            },
            async callTool() {
              return { content: [] };
            },
            async close() {}
          };
        }
      }
    });

    const tools = await adapter.loadTools({
      id: "stdio-mcp",
      kind: "mcp",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
      defaultPolicy: "deny-unknown",
      timeoutMs: 5000
    });

    expect(tools.map((tool) => tool.name)).toEqual(["tests.get_failures", "repo.apply_patch"]);
  });
```

- [ ] **Step 2: Write failing MCP broker test**

Create `tests/unit/mcp-broker.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { McpToolBroker } from "../../src/adapters/mcpToolBroker.js";

describe("MCP tool broker", () => {
  it("routes approved tool calls to the source client", async () => {
    const broker = new McpToolBroker({
      sources: [{ id: "fixture", kind: "mcp", transport: "stdio", command: "node", args: ["server.js"], defaultPolicy: "deny-unknown", timeoutMs: 5000 }],
      toolToSource: new Map([["tests.get_failures", "fixture"]]),
      clientFactory: {
        async createClient() {
          return {
            async listTools() {
              return { tools: [] };
            },
            async callTool(name, args) {
              return { name, args, ok: true };
            },
            async close() {}
          };
        }
      }
    });

    await expect(broker.callTool("tests.get_failures", { limit: 1 })).resolves.toEqual({
      name: "tests.get_failures",
      args: { limit: 1 },
      ok: true
    });
  });
});
```

- [ ] **Step 3: Run MCP tests and verify failure**

Run: `pnpm test tests/unit/mcp-adapter.test.ts tests/unit/mcp-broker.test.ts`

Expected: FAIL because `clientFactory` and `McpToolBroker` do not exist.

- [ ] **Step 4: Implement MCP client abstraction**

Create `src/adapters/mcpClient.ts`:

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { McpSourceConfig } from "../config/config.js";

export type McpClientConnection = {
  listTools(): Promise<unknown>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
};

export type McpClientFactory = {
  createClient(source: McpSourceConfig): Promise<McpClientConnection>;
};

export class SdkMcpClientFactory implements McpClientFactory {
  async createClient(source: McpSourceConfig): Promise<McpClientConnection> {
    if (source.transport !== "stdio") throw new Error(`MCP source "${source.id}" transport is not stdio`);
    if (!source.command) throw new Error(`MCP source "${source.id}" missing command`);

    const client = new Client({ name: "mcpw", version: "0.1.0" });
    const transport = new StdioClientTransport({ command: source.command, args: source.args ?? [] });
    await client.connect(transport);

    return {
      async listTools() {
        return client.listTools();
      },
      async callTool(name, args) {
        return client.callTool({ name, arguments: args });
      },
      async close() {
        await client.close();
      }
    };
  }
}
```

- [ ] **Step 5: Extend MCP tools adapter**

Modify `src/adapters/mcpToolsListAdapter.ts` constructor and loader:

```ts
import { SdkMcpClientFactory, type McpClientFactory } from "./mcpClient.js";

export class McpToolsListAdapter implements ToolSourceAdapter<McpSourceConfig> {
  readonly kind = "mcp" as const;

  constructor(private readonly options: { toolsList?: unknown; clientFactory?: McpClientFactory } = {}) {}

  async loadTools(config: McpSourceConfig): Promise<ImportedTool[]> {
    const raw = this.options.toolsList ?? (config.transport === "fixture" ? await this.loadFixture(config) : await this.loadLive(config));
    const list = mcpToolsListSchema.parse(raw);
    return list.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      sourceKind: "mcp",
      sourceId: config.id,
      raw: tool,
      diagnostics: ["missing outputTrust", "missing effectRules", "tool is inspect-only until annotated"]
    }));
  }

  private async loadLive(config: McpSourceConfig): Promise<unknown> {
    const client = await (this.options.clientFactory ?? new SdkMcpClientFactory()).createClient(config);
    try {
      return await client.listTools();
    } finally {
      await client.close();
    }
  }
}
```

- [ ] **Step 6: Implement MCP tool broker**

Create `src/adapters/mcpToolBroker.ts`:

```ts
import type { McpSourceConfig } from "../config/config.js";
import type { ToolBroker } from "../runtime/broker.js";
import { SdkMcpClientFactory, type McpClientFactory } from "./mcpClient.js";

export type McpToolBrokerInput = {
  sources: McpSourceConfig[];
  toolToSource: Map<string, string>;
  clientFactory?: McpClientFactory;
};

export class McpToolBroker implements ToolBroker {
  constructor(private readonly input: McpToolBrokerInput) {}

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const sourceId = this.input.toolToSource.get(name);
    if (!sourceId) throw new Error(`unknown MCP tool source for: ${name}`);
    const source = this.input.sources.find((item) => item.id === sourceId);
    if (!source) throw new Error(`unknown MCP source: ${sourceId}`);

    const client = await (this.input.clientFactory ?? new SdkMcpClientFactory()).createClient(source);
    try {
      return await client.callTool(name, args);
    } finally {
      await client.close();
    }
  }
}
```

- [ ] **Step 7: Add broker composition for imported and built-in tools**

Create `src/adapters/compositeToolBroker.ts`:

```ts
import type { ToolBroker } from "../runtime/broker.js";

export class CompositeToolBroker implements ToolBroker {
  constructor(
    private readonly primaryTools: Set<string>,
    private readonly primary: ToolBroker,
    private readonly fallback: ToolBroker
  ) {}

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (this.primaryTools.has(name)) return this.primary.callTool(name, args);
    return this.fallback.callTool(name, args);
  }
}
```

Append to `src/service/workflowHandlers.ts`:

```ts
export function mapImportedToolsToSources(importedTools: { name: string; sourceId: string }[]): Map<string, string> {
  return new Map(importedTools.map((tool) => [tool.name, tool.sourceId]));
}
```

Modify `buildRegistryForCli` in `src/cli.ts` so it returns the loaded config bundle as well as the registry:

```ts
async function buildRegistryForCli(configPath: string | undefined, overridesPath: string | undefined) {
  const { config, overrides } = await loadConfigBundle({ configPath, overridesPath });
  const registryResult = await buildUniversalToolRegistry({ builtInTools: demoTools, sources: config.sources, overrides });
  return { config, overrides, registryResult };
}
```

Modify the `run` command to construct an MCP-first broker for imported tools:

```ts
const toolToSource = mapImportedToolsToSources(registryResult.importedTools);
const mcpBroker = new McpToolBroker({ sources: config.sources, toolToSource });
const broker = new CompositeToolBroker(new Set(toolToSource.keys()), mcpBroker, new MockToolBroker());
const result = await executeWorkflow(workflow, {
  broker,
  agents: new MockAgentRegistry(),
  artifacts: new InMemoryArtifactStore()
});
```

- [ ] **Step 8: Run MCP tests**

Run: `pnpm test tests/unit/mcp-adapter.test.ts tests/unit/mcp-broker.test.ts tests/security/imported-tools-policy.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```powershell
git add package.json pnpm-lock.yaml src/adapters/mcpClient.ts src/adapters/mcpToolsListAdapter.ts src/adapters/mcpToolBroker.ts src/adapters/compositeToolBroker.ts src/service/workflowHandlers.ts src/cli.ts src/index.ts tests/unit/mcp-adapter.test.ts tests/unit/mcp-broker.test.ts tests/security/imported-tools-policy.test.ts
git commit -m "feat: connect stdio MCP tools"
```

---

### Task 6: Docs, Verification, And Completion Audit

**Files:**
- Modify: `README.md`
- Modify: `docs/workflow-ir.md`
- Modify: `docs/security-model.md`
- Modify: `src/index.ts`

- [ ] **Step 1: Update README quickstart**

Replace the current short README command block with:

```markdown
## Quickstart

```powershell
pnpm install
pnpm check
pnpm test
pnpm pack
npm install -g .\mcp-workflow-ir-runtime-0.1.0.tgz
mcpw --version
mcpw init
mcpw doctor
mcpw sources inspect --config examples/mcpw.config.json --source fixture-mcp
mcpw manifests export --config examples/mcpw.config.json --source fixture-mcp
mcpw check examples/imported-mcp-tool.workflow.json --config examples/mcpw.config.json
mcpw plan examples/imported-mcp-tool.workflow.json --config examples/mcpw.config.json
mcpw serve --config examples/mcpw.config.json
```
```

- [ ] **Step 2: Document service API**

Append to `docs/workflow-ir.md`:

```markdown
## Local Service

`mcpw serve` exposes localhost-only HTTP endpoints for health, source diagnostics, workflow checks, workflow plans, and approved workflow runs. The service uses the same validation, registry, and policy checker as the CLI.
```

- [ ] **Step 3: Document production safety**

Append to `docs/security-model.md`:

```markdown
## Service Safety

The local service fails closed. Unknown tools, unannotated imported tools, denied effects, and approval-required effects do not run. Live MCP tool calls are routed through the `ToolBroker` boundary only after workflow validation and policy checks pass.
```

- [ ] **Step 4: Ensure public exports are complete**

Update `src/index.ts` to include:

```ts
export * from "./adapters/mcpClient.js";
export * from "./adapters/mcpToolBroker.js";
export * from "./cli/doctor.js";
export * from "./cli/init.js";
export * from "./cli/output.js";
export * from "./config/paths.js";
export * from "./service/httpService.js";
export * from "./service/workflowHandlers.js";
```

- [ ] **Step 5: Run full verification**

Run:

```powershell
pnpm check
pnpm test
pnpm test:security
pnpm test:e2e
pnpm test:package
npm pack --dry-run
pnpm cli init
pnpm cli doctor --config examples/mcpw.config.json --json
pnpm cli sources inspect --config examples/mcpw.config.json --source fixture-mcp
pnpm cli check examples/imported-mcp-tool.workflow.json --config examples/mcpw.config.json
pnpm cli plan examples/imported-mcp-tool.workflow.json --config examples/mcpw.config.json
```

Expected:

```text
All commands exit 0.
npm pack --dry-run includes dist/cli.js, templates, examples, docs, README.md, and package.json.
npm pack --dry-run excludes src/, tests/, coverage/, and dist/tests/.
doctor JSON has ok=true and a SOURCE_OK check.
imported MCP workflow check and plan include read.tests.
```

- [ ] **Step 6: Perform explicit completion audit**

Create a short audit note in the final response with this mapping:

```text
Downloadable: npm package smoke test and npm pack dry-run file list.
Production service: mcpw serve e2e health check and service unit tests.
Plug-and-play MCPs: init/doctor/sources inspect plus stdio MCP adapter test.
Runtime use: check/plan/run tests and MCP broker test.
Security: imported tool and service policy tests.
Docs: README quickstart plus workflow/security docs.
```

- [ ] **Step 7: Commit**

Run:

```powershell
git add README.md docs/workflow-ir.md docs/security-model.md src/index.ts
git commit -m "docs: document production service usage"
```

---

## Self-Review Checklist

- Spec coverage:
  - Publishable npm package: Task 1 and Task 6.
  - Clean tarball contents: Task 1 package smoke and Task 6 verification.
  - `mcpw init`: Task 2.
  - `mcpw doctor`: Task 3.
  - `mcpw serve`: Task 4.
  - Live stdio MCP support: Task 5.
  - Fixture transport preserved: Task 4 and Task 6.
  - Runtime MCP broker: Task 5.
  - Deny unannotated tools: existing imported policy tests plus Task 4 service policy.
  - README quickstart: Task 6.
- Placeholder scan:
  - The plan contains concrete file names, commands, snippets, and expected results for each task.
- Type consistency:
  - `McpClientFactory`, `McpClientConnection`, `McpToolBroker`, `WorkflowOperationDeps`, `ServiceOptions`, and `DoctorResult` are defined before use.
- Scope:
  - HTTP MCP transport, hosted service auth, and durable workflow scheduling remain outside this milestone.
