import type { Workflow } from "../ir/workflow.js";
import type { UniversalRegistryResult } from "./universalRegistry.js";

export function unresolvedImportedToolDenials(
  workflow: Workflow,
  registryResult: UniversalRegistryResult,
  builtInTools: { name: string }[]
): string[] {
  const builtInCounts = countManifestsByName(builtInTools);
  const manifestCounts = countManifestsByName(registryResult.manifests);
  const unresolvedImports = new Set(
    registryResult.importedTools
      .filter((tool) => (manifestCounts.get(tool.name) ?? 0) <= (builtInCounts.get(tool.name) ?? 0))
      .map((tool) => tool.name)
  );
  const usedUnresolvedImports = new Set(
    workflow.steps
      .filter((step) => step.op === "tool.call" && unresolvedImports.has(step.tool))
      .map((step) => (step.op === "tool.call" ? step.tool : ""))
  );

  return [...usedUnresolvedImports].map((toolName) => `unknown tool: ${toolName}`);
}

function countManifestsByName(manifests: { name: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const manifest of manifests) counts.set(manifest.name, (counts.get(manifest.name) ?? 0) + 1);
  return counts;
}
