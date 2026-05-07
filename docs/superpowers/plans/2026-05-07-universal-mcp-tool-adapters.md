# Universal MCP Tool Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a universal tool-source adapter layer with MCP `tools/list` as the first imported ecosystem, explicit safety overrides, and CLI diagnostics.

**Architecture:** External tools are imported into neutral `ImportedTool` records, then merged with user-authored overrides into existing `ToolManifest` values. The checker and executor stay ecosystem-agnostic by consuming the existing `ToolRegistry` and `ToolBroker` boundaries. Missing safety metadata keeps imported tools inspect-only and denied by default.

**Tech Stack:** TypeScript, Node.js 22+, Zod, Commander, Vitest, existing manifest/policy/runtime modules.

---

## File Structure

- Create `src/config/config.ts`: config/override TypeScript types and Zod schemas.
- Create `src/config/loadConfig.ts`: file loading helpers for optional config and overrides.
- Create `src/adapters/toolSourceAdapter.ts`: generic adapter contract plus `ImportedTool`, diagnostics, and source config types.
- Create `src/adapters/mcpToolsListAdapter.ts`: deterministic MCP `tools/list` importer from object fixtures or JSON files.
- Create `src/manifests/overrides.ts`: merge source defaults and tool-level overrides.
- Create `src/manifests/universalRegistry.ts`: build merged `ToolRegistry` plus diagnostics from built-ins, adapters, and overrides.
- Modify `src/cli.ts`: add `--config`, source inspection/export commands, and config-aware check/plan/run.
- Modify `src/index.ts`: export public adapter/config/registry APIs.
- Create `tests/fixtures/mcpToolsList.ts`: representative MCP `tools/list` fixture.
- Create `tests/unit/config.test.ts`: config and override schema behavior.
- Create `tests/unit/mcp-adapter.test.ts`: MCP fixture import and diagnostics.
- Create `tests/unit/override-merging.test.ts`: override precedence and executable manifest creation.
- Create `tests/security/imported-tools-policy.test.ts`: deny-by-default and policy-deny precedence.
- Modify `tests/e2e/cli.test.ts`: source inspection/export and config-aware command coverage.
- Create `examples/mcpw.config.json`: fixture-backed MCP source config.
- Create `examples/mcpw.overrides.json`: explicit safety annotations for one imported MCP tool.
- Create `examples/imported-mcp-tool.workflow.json`: workflow using the imported MCP tool.

---

## Task 1: Config And Override Schemas

**Files:**
- Create: `src/config/config.ts`
- Create: `src/config/loadConfig.ts`
- Create: `tests/unit/config.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing config schema tests**

Create `tests/unit/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseMcpwConfig, parseManifestOverrides } from "../../src/config/config.js";

describe("mcpw config schemas", () => {
  it("accepts an MCP tools-list fixture source", () => {
    const config = parseMcpwConfig({
      sources: [
        {
          id: "fixture-mcp",
          kind: "mcp",
          transport: "fixture",
          fixturePath: "tests/fixtures/mcp-tools-list.json",
          defaultPolicy: "deny-unknown"
        }
      ]
    });

    expect(config.sources[0]?.id).toBe("fixture-mcp");
    expect(config.sources[0]?.defaultPolicy).toBe("deny-unknown");
  });

  it("rejects unsupported source kinds", () => {
    expect(() =>
      parseMcpwConfig({
        sources: [{ id: "bad", kind: "shell", defaultPolicy: "deny-unknown" }]
      })
    ).toThrow();
  });

  it("accepts source defaults and tool overrides", () => {
    const overrides = parseManifestOverrides({
      sources: {
        "fixture-mcp": {
          defaults: { outputTrust: "untrusted" },
          tools: {
            "tests.get_failures": {
              outputTrust: "artifact",
              effectRules: [{ kind: "static", effects: ["read.tests"] }],
              requiresApproval: []
            }
          }
        }
      }
    });

    expect(overrides.sources["fixture-mcp"]?.tools["tests.get_failures"]?.outputTrust).toBe("artifact");
  });
});
```

- [ ] **Step 2: Run config tests and verify failure**

Run: `pnpm test tests/unit/config.test.ts`

Expected: FAIL with `Cannot find module '../../src/config/config.js'`.

- [ ] **Step 3: Implement config schemas**

Create `src/config/config.ts`:

```ts
import { z } from "zod";
import { knownEffects } from "../manifests/effects.js";

const effectSchema = z.enum(knownEffects);
const trustSchema = z.enum(["trusted", "untrusted", "secret", "artifact", "patch"]);

export const mcpSourceConfigSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("mcp"),
  transport: z.enum(["fixture", "stdio", "http"]).default("fixture"),
  fixturePath: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().url().optional(),
  timeoutMs: z.number().int().positive().default(5000),
  defaultPolicy: z.enum(["deny-unknown", "inspect-only", "allow-annotated"]).default("deny-unknown")
});

export const mcpwConfigSchema = z.object({
  sources: z.array(mcpSourceConfigSchema).default([])
});

const staticEffectRuleSchema = z.object({
  kind: z.literal("static"),
  effects: z.array(effectSchema)
});

const argumentEffectRuleSchema = z.object({
  kind: z.literal("argumentEquals"),
  path: z.string().min(1),
  equals: z.unknown(),
  effects: z.array(effectSchema),
  otherwiseEffects: z.array(effectSchema)
});

export const manifestOverrideSchema = z.object({
  outputTrust: trustSchema.optional(),
  effectRules: z.array(z.union([staticEffectRuleSchema, argumentEffectRuleSchema])).optional(),
  requiresApproval: z.array(effectSchema).optional(),
  aliases: z.array(z.string()).optional(),
  description: z.string().optional()
});

export const manifestOverridesSchema = z.object({
  sources: z.record(
    z.object({
      defaults: manifestOverrideSchema.optional(),
      tools: z.record(manifestOverrideSchema).default({})
    })
  ).default({})
});

export type McpwConfig = z.infer<typeof mcpwConfigSchema>;
export type McpSourceConfig = z.infer<typeof mcpSourceConfigSchema>;
export type ManifestOverride = z.infer<typeof manifestOverrideSchema>;
export type ManifestOverrides = z.infer<typeof manifestOverridesSchema>;

export function parseMcpwConfig(input: unknown): McpwConfig {
  return mcpwConfigSchema.parse(input);
}

export function parseManifestOverrides(input: unknown): ManifestOverrides {
  return manifestOverridesSchema.parse(input);
}
```

- [ ] **Step 4: Implement config file loaders**

Create `src/config/loadConfig.ts`:

```ts
import { readFile } from "node:fs/promises";
import { parseManifestOverrides, parseMcpwConfig, type ManifestOverrides, type McpwConfig } from "./config.js";

export async function loadMcpwConfig(path = "mcpw.config.json"): Promise<McpwConfig> {
  try {
    return parseMcpwConfig(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (isNotFound(error)) return { sources: [] };
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

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
```

- [ ] **Step 5: Export config APIs**

Modify `src/index.ts`:

```ts
export const runtimeVersion = "0.1.0";

export * from "./config/config.js";
export * from "./config/loadConfig.js";
```

- [ ] **Step 6: Run config tests**

Run: `pnpm test tests/unit/config.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/config src/index.ts tests/unit/config.test.ts
git commit -m "feat: add mcpw config schemas"
```

If this workspace is not a git repository, record that the commit could not be made and continue.

---

## Task 2: Adapter Contract And MCP Fixture Import

**Files:**
- Create: `src/adapters/toolSourceAdapter.ts`
- Create: `src/adapters/mcpToolsListAdapter.ts`
- Create: `tests/fixtures/mcpToolsList.ts`
- Create: `tests/fixtures/mcp-tools-list.json`
- Create: `tests/unit/mcp-adapter.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing MCP adapter tests**

Create `tests/unit/mcp-adapter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { McpToolsListAdapter } from "../../src/adapters/mcpToolsListAdapter.js";
import { fixtureMcpToolsList } from "../fixtures/mcpToolsList.js";

describe("MCP tools/list adapter", () => {
  it("imports MCP tools into neutral imported tools", async () => {
    const adapter = new McpToolsListAdapter({ toolsList: fixtureMcpToolsList });
    const tools = await adapter.loadTools({
      id: "fixture-mcp",
      kind: "mcp",
      transport: "fixture",
      defaultPolicy: "deny-unknown",
      timeoutMs: 5000
    });

    expect(tools).toHaveLength(2);
    expect(tools[0]).toMatchObject({
      name: "tests.get_failures",
      sourceKind: "mcp",
      sourceId: "fixture-mcp"
    });
    expect(tools[0]?.diagnostics).toEqual([
      "missing outputTrust",
      "missing effectRules",
      "tool is inspect-only until annotated"
    ]);
  });

  it("loads MCP tools from a JSON fixture path", async () => {
    const adapter = new McpToolsListAdapter();
    const tools = await adapter.loadTools({
      id: "fixture-file",
      kind: "mcp",
      transport: "fixture",
      fixturePath: "tests/fixtures/mcp-tools-list.json",
      defaultPolicy: "deny-unknown",
      timeoutMs: 5000
    });

    expect(tools.map((tool) => tool.name)).toEqual(["tests.get_failures", "repo.apply_patch"]);
  });
});
```

- [ ] **Step 2: Run MCP adapter tests and verify failure**

Run: `pnpm test tests/unit/mcp-adapter.test.ts`

Expected: FAIL with `Cannot find module '../../src/adapters/mcpToolsListAdapter.js'`.

- [ ] **Step 3: Add MCP tools-list fixtures**

Create `tests/fixtures/mcpToolsList.ts`:

```ts
export const fixtureMcpToolsList = {
  tools: [
    {
      name: "tests.get_failures",
      description: "Return recent test failures",
      inputSchema: {
        type: "object",
        properties: { limit: { type: "number" } }
      }
    },
    {
      name: "repo.apply_patch",
      description: "Preview or apply a patch",
      inputSchema: {
        type: "object",
        properties: {
          mode: { enum: ["dry_run", "apply"] },
          patch: { type: "object" }
        }
      }
    }
  ]
} as const;
```

Create `tests/fixtures/mcp-tools-list.json`:

```json
{
  "tools": [
    {
      "name": "tests.get_failures",
      "description": "Return recent test failures",
      "inputSchema": {
        "type": "object",
        "properties": { "limit": { "type": "number" } }
      }
    },
    {
      "name": "repo.apply_patch",
      "description": "Preview or apply a patch",
      "inputSchema": {
        "type": "object",
        "properties": {
          "mode": { "enum": ["dry_run", "apply"] },
          "patch": { "type": "object" }
        }
      }
    }
  ]
}
```

- [ ] **Step 4: Implement generic adapter types**

Create `src/adapters/toolSourceAdapter.ts`:

```ts
import type { McpSourceConfig } from "../config/config.js";

export type ToolSourceKind = "mcp" | "openapi" | "langchain" | "custom-json";

export type ImportedTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  sourceKind: ToolSourceKind;
  sourceId: string;
  raw: unknown;
  diagnostics: string[];
};

export type ToolSourceAdapter<TConfig = McpSourceConfig> = {
  readonly kind: ToolSourceKind;
  loadTools(config: TConfig): Promise<ImportedTool[]>;
};
```

- [ ] **Step 5: Implement MCP fixture adapter**

Create `src/adapters/mcpToolsListAdapter.ts`:

```ts
import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { McpSourceConfig } from "../config/config.js";
import type { ImportedTool, ToolSourceAdapter } from "./toolSourceAdapter.js";

const mcpToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
  inputSchema: z.record(z.unknown()).optional().default({})
});

const mcpToolsListSchema = z.object({
  tools: z.array(mcpToolSchema)
});

export type McpToolsList = z.infer<typeof mcpToolsListSchema>;

export class McpToolsListAdapter implements ToolSourceAdapter<McpSourceConfig> {
  readonly kind = "mcp" as const;

  constructor(private readonly options: { toolsList?: unknown } = {}) {}

  async loadTools(config: McpSourceConfig): Promise<ImportedTool[]> {
    const raw = this.options.toolsList ?? (await this.loadFixture(config));
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

  private async loadFixture(config: McpSourceConfig): Promise<unknown> {
    if (config.transport !== "fixture" || !config.fixturePath) {
      throw new Error(`MCP source "${config.id}" requires fixturePath for deterministic import`);
    }
    return JSON.parse(await readFile(config.fixturePath, "utf8"));
  }
}
```

- [ ] **Step 6: Export adapter APIs**

Append to `src/index.ts`:

```ts
export * from "./adapters/toolSourceAdapter.js";
export * from "./adapters/mcpToolsListAdapter.js";
```

- [ ] **Step 7: Run MCP adapter tests**

Run: `pnpm test tests/unit/mcp-adapter.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```powershell
git add src/adapters/toolSourceAdapter.ts src/adapters/mcpToolsListAdapter.ts tests/fixtures tests/unit/mcp-adapter.test.ts src/index.ts
git commit -m "feat: import MCP tools as neutral capabilities"
```

If this workspace is not a git repository, record that the commit could not be made and continue.

---

## Task 3: Override Merging And Universal Registry

**Files:**
- Create: `src/manifests/overrides.ts`
- Create: `src/manifests/universalRegistry.ts`
- Create: `tests/unit/override-merging.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing override merging tests**

Create `tests/unit/override-merging.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { McpToolsListAdapter } from "../../src/adapters/mcpToolsListAdapter.js";
import { buildUniversalToolRegistry } from "../../src/manifests/universalRegistry.js";
import { fixtureMcpToolsList } from "../fixtures/mcpToolsList.js";

describe("universal tool registry", () => {
  it("keeps imported tools inspect-only without safety overrides", async () => {
    const result = await buildUniversalToolRegistry({
      builtInTools: [],
      sources: [
        {
          id: "fixture-mcp",
          kind: "mcp",
          transport: "fixture",
          defaultPolicy: "deny-unknown",
          timeoutMs: 5000
        }
      ],
      overrides: { sources: {} },
      adapters: { mcp: new McpToolsListAdapter({ toolsList: fixtureMcpToolsList }) }
    });

    expect(() => result.registry.getTool("tests.get_failures")).toThrow("unknown tool: tests.get_failures");
    expect(result.diagnostics[0]).toContain("fixture-mcp:tests.get_failures missing outputTrust");
  });

  it("turns an imported MCP tool into a ToolManifest after explicit overrides", async () => {
    const result = await buildUniversalToolRegistry({
      builtInTools: [],
      sources: [
        {
          id: "fixture-mcp",
          kind: "mcp",
          transport: "fixture",
          defaultPolicy: "deny-unknown",
          timeoutMs: 5000
        }
      ],
      overrides: {
        sources: {
          "fixture-mcp": {
            defaults: { outputTrust: "untrusted" },
            tools: {
              "tests.get_failures": {
                outputTrust: "artifact",
                effectRules: [{ kind: "static", effects: ["read.tests"] }]
              }
            }
          }
        }
      },
      adapters: { mcp: new McpToolsListAdapter({ toolsList: fixtureMcpToolsList }) }
    });

    const manifest = result.registry.getTool("tests.get_failures");
    expect(manifest.outputTrust).toBe("artifact");
    expect(result.registry.effectsForToolCall("tests.get_failures", { limit: 1 })).toEqual(["read.tests"]);
  });
});
```

- [ ] **Step 2: Run override tests and verify failure**

Run: `pnpm test tests/unit/override-merging.test.ts`

Expected: FAIL with `Cannot find module '../../src/manifests/universalRegistry.js'`.

- [ ] **Step 3: Implement override merge helper**

Create `src/manifests/overrides.ts`:

```ts
import type { ManifestOverride, ManifestOverrides } from "../config/config.js";

export function resolveManifestOverride(
  overrides: ManifestOverrides,
  sourceId: string,
  toolName: string
): ManifestOverride {
  const source = overrides.sources[sourceId];
  return {
    ...source?.defaults,
    ...source?.tools[toolName]
  };
}
```

- [ ] **Step 4: Implement universal registry builder**

Create `src/manifests/universalRegistry.ts`:

```ts
import type { McpSourceConfig, ManifestOverrides } from "../config/config.js";
import { McpToolsListAdapter } from "../adapters/mcpToolsListAdapter.js";
import type { ToolSourceAdapter } from "../adapters/toolSourceAdapter.js";
import { ToolRegistry } from "./registry.js";
import type { ToolManifest } from "./toolManifest.js";
import { resolveManifestOverride } from "./overrides.js";

export type UniversalRegistryInput = {
  builtInTools: ToolManifest[];
  sources: McpSourceConfig[];
  overrides: ManifestOverrides;
  adapters?: { mcp?: ToolSourceAdapter<McpSourceConfig> };
};

export type UniversalRegistryResult = {
  registry: ToolRegistry;
  manifests: ToolManifest[];
  diagnostics: string[];
};

export async function buildUniversalToolRegistry(input: UniversalRegistryInput): Promise<UniversalRegistryResult> {
  const manifests = [...input.builtInTools];
  const diagnostics: string[] = [];
  const adapter = input.adapters?.mcp ?? new McpToolsListAdapter();

  for (const source of input.sources) {
    const importedTools = await adapter.loadTools(source);
    for (const imported of importedTools) {
      const override = resolveManifestOverride(input.overrides, source.id, imported.name);
      if (!override.outputTrust) diagnostics.push(`${source.id}:${imported.name} missing outputTrust`);
      if (!override.effectRules || override.effectRules.length === 0) {
        diagnostics.push(`${source.id}:${imported.name} missing effectRules`);
      }
      if (!override.outputTrust || !override.effectRules || override.effectRules.length === 0) continue;

      manifests.push({
        name: imported.name,
        description: override.description ?? imported.description,
        inputSchema: imported.inputSchema,
        outputTrust: override.outputTrust,
        effectRules: override.effectRules,
        requiresApproval: override.requiresApproval
      });
    }
  }

  return { registry: new ToolRegistry(manifests), manifests, diagnostics };
}
```

- [ ] **Step 5: Export registry APIs**

Append to `src/index.ts`:

```ts
export * from "./manifests/overrides.js";
export * from "./manifests/universalRegistry.js";
```

- [ ] **Step 6: Run override tests**

Run: `pnpm test tests/unit/override-merging.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/manifests/overrides.ts src/manifests/universalRegistry.ts tests/unit/override-merging.test.ts src/index.ts
git commit -m "feat: build universal tool registry from overrides"
```

If this workspace is not a git repository, record that the commit could not be made and continue.

---

## Task 4: Imported Tool Policy Security

**Files:**
- Create: `tests/security/imported-tools-policy.test.ts`
- Modify: `src/manifests/universalRegistry.ts` only if the tests expose gaps

- [ ] **Step 1: Write imported-tool security tests**

Create `tests/security/imported-tools-policy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { McpToolsListAdapter } from "../../src/adapters/mcpToolsListAdapter.js";
import { buildUniversalToolRegistry } from "../../src/manifests/universalRegistry.js";
import { checkWorkflow } from "../../src/policy/checker.js";
import { fixtureMcpToolsList } from "../fixtures/mcpToolsList.js";

describe("imported tool policy boundaries", () => {
  it("does not let overrides bypass policy deny rules", async () => {
    const result = await buildUniversalToolRegistry({
      builtInTools: [],
      sources: [{ id: "fixture-mcp", kind: "mcp", transport: "fixture", defaultPolicy: "deny-unknown", timeoutMs: 5000 }],
      overrides: {
        sources: {
          "fixture-mcp": {
            tools: {
              "repo.apply_patch": {
                outputTrust: "trusted",
                effectRules: [
                  {
                    kind: "argumentEquals",
                    path: "mode",
                    equals: "apply",
                    effects: ["read.repo", "write.repo"],
                    otherwiseEffects: ["read.repo"]
                  }
                ]
              }
            }
          }
        }
      },
      adapters: { mcp: new McpToolsListAdapter({ toolsList: fixtureMcpToolsList }) }
    });

    const check = checkWorkflow(
      {
        version: "0.1",
        workflow: "imported_apply",
        steps: [{ id: "apply", op: "tool.call", tool: "repo.apply_patch", args: { mode: "apply", patch: {} } }]
      },
      result.registry,
      { allow: ["read.repo"], requireApproval: ["write.repo"], deny: ["write.repo"] }
    );

    expect(check.ok).toBe(false);
    expect(check.denied.join("\n")).toContain("denied effect: write.repo");
  });

  it("keeps missing metadata denied", async () => {
    const result = await buildUniversalToolRegistry({
      builtInTools: [],
      sources: [{ id: "fixture-mcp", kind: "mcp", transport: "fixture", defaultPolicy: "deny-unknown", timeoutMs: 5000 }],
      overrides: { sources: {} },
      adapters: { mcp: new McpToolsListAdapter({ toolsList: fixtureMcpToolsList }) }
    });

    expect(() => result.registry.effectsForToolCall("tests.get_failures", {})).toThrow("unknown tool: tests.get_failures");
    expect(result.diagnostics.join("\n")).toContain("missing effectRules");
  });
});
```

- [ ] **Step 2: Run imported-tool security tests**

Run: `pnpm test:security`

Expected: PASS, including `tests/security/imported-tools-policy.test.ts`.

- [ ] **Step 3: Commit**

Run:

```powershell
git add tests/security/imported-tools-policy.test.ts src/manifests/universalRegistry.ts
git commit -m "test: enforce policy boundaries for imported tools"
```

If this workspace is not a git repository, record that the commit could not be made and continue.

---

## Task 5: CLI Source Inspection And Manifest Export

**Files:**
- Modify: `src/cli.ts`
- Modify: `tests/e2e/cli.test.ts`
- Create: `examples/mcpw.config.json`
- Create: `examples/mcpw.overrides.json`

- [ ] **Step 1: Add failing CLI e2e tests**

Append to `tests/e2e/cli.test.ts`:

```ts
  it("lists configured MCP sources", async () => {
    const { stdout } = await runCli(["sources", "list", "--config", "examples/mcpw.config.json"]);
    expect(stdout).toContain("fixture-mcp");
    expect(stdout).toContain("mcp");
  });

  it("inspects configured MCP sources and reports diagnostics", async () => {
    const { stdout } = await runCli(["sources", "inspect", "--config", "examples/mcpw.config.json", "--source", "fixture-mcp"]);
    expect(stdout).toContain("fixture-mcp");
    expect(stdout).toContain("tests.get_failures");
    expect(stdout).toContain("missing outputTrust");
  });

  it("exports a starter override manifest for a configured MCP source", async () => {
    const { stdout } = await runCli(["manifests", "export", "--config", "examples/mcpw.config.json", "--source", "fixture-mcp"]);
    expect(stdout).toContain("\"fixture-mcp\"");
    expect(stdout).toContain("\"tests.get_failures\"");
    expect(stdout).toContain("\"effectRules\"");
  });
```

- [ ] **Step 2: Run CLI e2e tests and verify failure**

Run: `pnpm test:e2e`

Expected: FAIL because `sources` and `manifests` commands do not exist.

- [ ] **Step 3: Add example config files**

Create `examples/mcpw.config.json`:

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
  ]
}
```

Create `examples/mcpw.overrides.json`:

```json
{
  "sources": {
    "fixture-mcp": {
      "tools": {
        "tests.get_failures": {
          "outputTrust": "artifact",
          "effectRules": [{ "kind": "static", "effects": ["read.tests"] }],
          "requiresApproval": []
        }
      }
    }
  }
}
```

- [ ] **Step 4: Refactor CLI helper imports**

Modify the top of `src/cli.ts` to include:

```ts
import { parseManifestOverrides, parseMcpwConfig } from "./config/config.js";
import { buildUniversalToolRegistry } from "./manifests/universalRegistry.js";
```

Keep existing imports.

- [ ] **Step 5: Add CLI config loading helpers**

Add below `loadWorkflow` in `src/cli.ts`:

```ts
async function loadConfigBundle(configPath: string | undefined) {
  if (!configPath) {
    return {
      config: { sources: [] },
      overrides: { sources: {} }
    };
  }
  const config = parseMcpwConfig(JSON.parse(await readFile(configPath, "utf8")));
  const overridesPath = configPath.replace(/config\.json$/, "overrides.json");
  let overrides = { sources: {} };
  try {
    overrides = parseManifestOverrides(JSON.parse(await readFile(overridesPath, "utf8")));
  } catch (error) {
    if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) throw error;
  }
  return { config, overrides };
}

async function buildRegistryForCli(configPath: string | undefined) {
  const { config, overrides } = await loadConfigBundle(configPath);
  return buildUniversalToolRegistry({
    builtInTools: demoTools,
    sources: config.sources,
    overrides
  });
}
```

- [ ] **Step 6: Add `sources inspect` command**

Add before `await program.parseAsync()`:

```ts
const sourcesCommand = program.command("sources").description("Inspect configured external tool sources");

sourcesCommand
  .command("list")
  .requiredOption("--config <path>")
  .action(async (options: { config: string }) => {
    const { config } = await loadConfigBundle(options.config);
    for (const source of config.sources) console.log(`${source.id}\t${source.kind}\t${source.defaultPolicy}`);
  });

sourcesCommand
  .command("inspect")
  .requiredOption("--config <path>")
  .requiredOption("--source <id>")
  .action(async (options: { config: string; source: string }) => {
    const { config, overrides } = await loadConfigBundle(options.config);
    const source = config.sources.find((item) => item.id === options.source);
    if (!source) throw new Error(`unknown source: ${options.source}`);
    const result = await buildUniversalToolRegistry({ builtInTools: [], sources: [source], overrides });
    console.log(`Source: ${source.id}`);
    for (const diagnostic of result.diagnostics) console.log(`- ${diagnostic}`);
    if (result.diagnostics.length === 0) console.log("- no diagnostics");
  });
```

- [ ] **Step 7: Add `manifests export` command**

Add before `await program.parseAsync()`:

```ts
const manifestsCommand = program.command("manifests").description("Export starter manifests for configured external sources");

manifestsCommand
  .command("export")
  .requiredOption("--config <path>")
  .requiredOption("--source <id>")
  .action(async (options: { config: string; source: string }) => {
    const { config } = await loadConfigBundle(options.config);
    const source = config.sources.find((item) => item.id === options.source);
    if (!source) throw new Error(`unknown source: ${options.source}`);
    const result = await buildUniversalToolRegistry({ builtInTools: [], sources: [source], overrides: { sources: {} } });
    const starter = {
      sources: {
        [source.id]: {
          tools: Object.fromEntries(
            result.diagnostics.map((diagnostic) => {
              const toolName = diagnostic.split(" ")[0]?.split(":")[1] ?? "unknown";
              return [toolName, { outputTrust: "untrusted", effectRules: [], requiresApproval: [] }];
            })
          )
        }
      }
    };
    console.log(JSON.stringify(starter, null, 2));
  });
```

- [ ] **Step 8: Run CLI e2e tests**

Run: `pnpm test:e2e`

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```powershell
git add src/cli.ts tests/e2e/cli.test.ts examples/mcpw.config.json examples/mcpw.overrides.json
git commit -m "feat: inspect and export imported MCP manifests"
```

If this workspace is not a git repository, record that the commit could not be made and continue.

---

## Task 6: Config-Aware Check, Plan, And Run

**Files:**
- Modify: `src/cli.ts`
- Modify: `tests/e2e/cli.test.ts`
- Create: `examples/imported-mcp-tool.workflow.json`
- Modify: `README.md`

- [ ] **Step 1: Add failing config-aware CLI tests**

Append to `tests/e2e/cli.test.ts`:

```ts
  it("checks a workflow using an imported MCP tool after overrides", async () => {
    const { stdout } = await runCli([
      "check",
      "examples/imported-mcp-tool.workflow.json",
      "--config",
      "examples/mcpw.config.json"
    ]);
    expect(stdout).toContain("OK workflow=imported_mcp_tool");
    expect(stdout).toContain("read.tests");
  });

  it("denies an imported MCP tool when overrides are not provided", async () => {
    await expect(
      runCli(["check", "examples/imported-mcp-tool.workflow.json", "--config", "examples/mcpw-no-overrides.config.json"])
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("unknown tool: tests.get_failures")
    });
  });
```

- [ ] **Step 2: Add imported workflow and no-override config**

Create `examples/imported-mcp-tool.workflow.json`:

```json
{
  "version": "0.1",
  "workflow": "imported_mcp_tool",
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

Create `examples/mcpw-no-overrides.config.json`:

```json
{
  "sources": [
    {
      "id": "fixture-mcp-no-overrides",
      "kind": "mcp",
      "transport": "fixture",
      "fixturePath": "tests/fixtures/mcp-tools-list.json",
      "defaultPolicy": "deny-unknown",
      "timeoutMs": 5000
    }
  ]
}
```

- [ ] **Step 3: Run config-aware CLI tests and verify failure**

Run: `pnpm test:e2e`

Expected: FAIL because existing `check` does not accept `--config`.

- [ ] **Step 4: Add config option to check command**

Replace the existing `check` command in `src/cli.ts` with:

```ts
program
  .command("check")
  .argument("<workflow>")
  .option("--config <path>")
  .action(async (path, options: { config?: string }) => {
    const workflow = await loadWorkflow(path);
    const registryResult = await buildRegistryForCli(options.config);
    const result = checkWorkflow(workflow, registryResult.registry, policy);
    if (!result.ok) throw new Error([...registryResult.diagnostics, ...result.denied].join("\n"));
    console.log(`OK workflow=${workflow.workflow} steps=${workflow.steps.length} effects=${result.effects.join(",")}`);
    console.log(`Approvals required: ${result.approvals.required.join(",") || "none"}`);
  });
```

- [ ] **Step 5: Add config option to plan command**

Replace the existing `plan` command in `src/cli.ts` with:

```ts
program
  .command("plan")
  .argument("<workflow>")
  .option("--config <path>")
  .action(async (path, options: { config?: string }) => {
    const workflow = await loadWorkflow(path);
    const registryResult = await buildRegistryForCli(options.config);
    const result = checkWorkflow(workflow, registryResult.registry, policy);
    console.log(`Workflow: ${workflow.workflow}`);
    console.log(`Effects: ${result.effects.join(",") || "none"}`);
    console.log(`Approvals required: ${result.approvals.required.join(",") || "none"}`);
    if (registryResult.diagnostics.length > 0) console.log(`Diagnostics:\n${registryResult.diagnostics.join("\n")}`);
    if (!result.ok) console.log(`Denied:\n${result.denied.join("\n")}`);
  });
```

- [ ] **Step 6: Add config option to run command**

Update the existing `run` command to include `.option("--config <path>")`, and replace its action body with:

```ts
  .action(async (path, options: { dryRun?: boolean; config?: string }) => {
    const workflow = await loadWorkflow(path);
    const registryResult = await buildRegistryForCli(options.config);
    const check = checkWorkflow(workflow, registryResult.registry, policy);
    if (!check.ok) throw new Error([...registryResult.diagnostics, ...check.denied].join("\n"));
    if (check.approvals.required.length > 0) {
      throw new Error(`approval required: ${check.approvals.required.join(",")}`);
    }
    const result = await executeWorkflow(workflow, {
      broker: new MockToolBroker(),
      agents: new MockAgentRegistry(),
      artifacts: new InMemoryArtifactStore()
    });
    console.log(JSON.stringify(result, null, 2));
  });
```

- [ ] **Step 7: Update README commands**

Add to `README.md` under commands:

```powershell
pnpm cli sources inspect --config examples/mcpw.config.json --source fixture-mcp
pnpm cli manifests export --config examples/mcpw.config.json --source fixture-mcp
pnpm cli check examples/imported-mcp-tool.workflow.json --config examples/mcpw.config.json
```

- [ ] **Step 8: Run e2e tests**

Run: `pnpm test:e2e`

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```powershell
git add src/cli.ts tests/e2e/cli.test.ts examples/imported-mcp-tool.workflow.json examples/mcpw-no-overrides.config.json README.md
git commit -m "feat: use imported MCP registry in CLI checks"
```

If this workspace is not a git repository, record that the commit could not be made and continue.

---

## Task 7: Public Exports, Docs, And Verification

**Files:**
- Modify: `src/index.ts`
- Modify: `docs/workflow-ir.md`
- Modify: `docs/security-model.md`
- Modify: `README.md`

- [ ] **Step 1: Ensure public exports are complete**

Update `src/index.ts` so it includes:

```ts
export const runtimeVersion = "0.1.0";

export * from "./adapters/mcpToolsListAdapter.js";
export * from "./adapters/toolSourceAdapter.js";
export * from "./config/config.js";
export * from "./config/loadConfig.js";
export * from "./manifests/overrides.js";
export * from "./manifests/universalRegistry.js";
export * from "./manifests/registry.js";
export * from "./manifests/toolManifest.js";
export * from "./policy/checker.js";
export * from "./policy/policy.js";
export * from "./runtime/executor.js";
```

- [ ] **Step 2: Document adapter behavior**

Append to `docs/workflow-ir.md`:

```markdown
## External Tool Sources

External ecosystems are imported through source adapters. Adapters convert raw tool descriptions into neutral imported tools, then user-authored overrides add the safety metadata required to produce executable `ToolManifest` entries.

The first supported source kind is MCP `tools/list`. MCP tools are inspect-only until overrides define `outputTrust` and `effectRules`.
```

- [ ] **Step 3: Document imported-tool safety**

Append to `docs/security-model.md`:

```markdown
## Imported Tool Safety

Imported tools do not receive authority from their source. Missing `outputTrust` or `effectRules` keeps the tool inspect-only. Overrides can describe effects and approvals, but policy-level denies still win.
```

- [ ] **Step 4: Run full verification matrix**

Run:

```powershell
pnpm check
pnpm test
pnpm test:security
pnpm test:e2e
pnpm bench
pnpm cli sources list --config examples/mcpw.config.json
pnpm cli sources inspect --config examples/mcpw.config.json --source fixture-mcp
pnpm cli manifests export --config examples/mcpw.config.json --source fixture-mcp
pnpm cli check examples/imported-mcp-tool.workflow.json --config examples/mcpw.config.json
pnpm cli plan examples/imported-mcp-tool.workflow.json --config examples/mcpw.config.json
```

Expected:

```text
All commands exit 0.
source inspection prints imported MCP tools and diagnostics.
manifest export prints starter override JSON.
imported MCP workflow check and plan include read.tests.
```

- [ ] **Step 5: Run static safety scans**

Run:

```powershell
Select-String -Path src/**/*.ts -Pattern "eval\\(|new Function|child_process|exec\\(|spawn\\(|fetch\\("
rg -n "\\bany\\b" src tests -g "*.ts"
```

Expected:

```text
No raw execution/network matches in runtime source.
No TypeScript any matches in src or tests.
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/index.ts docs/workflow-ir.md docs/security-model.md README.md
git commit -m "docs: document universal MCP tool adapters"
```

If this workspace is not a git repository, record that the commit could not be made and continue.

---

## Self-Review Checklist

- Spec coverage:
  - Generic adapter contract: Task 2.
  - MCP `tools/list` support: Task 2.
  - Overrides: Task 1 and Task 3.
  - Deny/inspect-only missing metadata: Task 3 and Task 4.
  - CLI diagnostics and export: Task 5.
  - Config-aware check/plan/run: Task 6.
  - Docs and public exports: Task 7.
- Incomplete-marker scan:
  - The plan contains concrete code blocks, exact file paths, exact commands, and expected outcomes for every task.
- Type consistency:
  - `McpwConfig`, `McpSourceConfig`, `ManifestOverride`, `ManifestOverrides`, `ImportedTool`, `ToolSourceAdapter`, `McpToolsListAdapter`, and `buildUniversalToolRegistry` are introduced before use in later tasks.
- Scope:
  - The plan intentionally does not implement live MCP stdio/http transport. Deterministic fixture import proves the adapter and override architecture first.
