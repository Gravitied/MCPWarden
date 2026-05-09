import type { McpSourceConfig, ManifestOverrides } from "../config/config.js";
import { McpToolsListAdapter } from "../adapters/mcpToolsListAdapter.js";
import type { ImportedTool, ToolSourceAdapter } from "../adapters/toolSourceAdapter.js";
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
  importedTools: ImportedTool[];
  diagnostics: string[];
};

const registryCache = new Map<string, Promise<UniversalRegistryResult>>();

export function clearUniversalRegistryCache(): void {
  registryCache.clear();
}

export async function buildCachedUniversalToolRegistry(input: UniversalRegistryInput): Promise<UniversalRegistryResult> {
  const key = registryCacheKey(input);
  const cached = registryCache.get(key);
  if (cached) return cached;

  const result = buildUniversalToolRegistry(input).catch((error) => {
    registryCache.delete(key);
    throw error;
  });
  registryCache.set(key, result);
  return result;
}

export async function buildUniversalToolRegistry(input: UniversalRegistryInput): Promise<UniversalRegistryResult> {
  const manifests = [...input.builtInTools];
  const allImportedTools: ImportedTool[] = [];
  const diagnostics: string[] = [];
  const adapter = input.adapters?.mcp ?? new McpToolsListAdapter();

  for (const source of input.sources) {
    const importedTools = await adapter.loadTools(source);
    allImportedTools.push(...importedTools);
    for (const imported of importedTools) {
      const override = resolveManifestOverride(input.overrides, source.id, imported.name);
      if (!override.outputTrust) diagnostics.push(`${source.id}:${imported.name} missing outputTrust`);
      if (!override.effectRules || override.effectRules.length === 0) diagnostics.push(`${source.id}:${imported.name} missing effectRules`);
      if (!override.outputTrust || !override.effectRules || override.effectRules.length === 0) continue;

      const manifest: ToolManifest = {
        name: imported.name,
        description: override.description ?? imported.description,
        inputSchema: imported.inputSchema,
        outputTrust: override.outputTrust,
        effectRules: override.effectRules as ToolManifest["effectRules"]
      };
      if (override.requiresApproval) manifest.requiresApproval = override.requiresApproval;
      manifests.push(manifest);
    }
  }

  return { registry: new ToolRegistry(manifests), manifests, importedTools: allImportedTools, diagnostics };
}

function registryCacheKey(input: UniversalRegistryInput): string {
  return stableStringify({
    builtInTools: input.builtInTools.map((tool) => ({
      name: tool.name,
      outputTrust: tool.outputTrust,
      effectRules: tool.effectRules,
      requiresApproval: tool.requiresApproval
    })),
    sources: input.sources,
    overrides: input.overrides
  });
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortForJson(value));
}

function sortForJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForJson);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortForJson(item)])
    );
  }
  return value;
}
