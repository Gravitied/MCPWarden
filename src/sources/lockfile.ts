import { createHash } from "node:crypto";
import type { ImportedTool } from "../adapters/toolSourceAdapter.js";

export type SourceLockfile = {
  version: "0.1";
  generatedAt: string;
  sources: Record<string, { tools: Record<string, SourceLockTool> }>;
};

export type SourceLockTool = {
  descriptionHash: string;
  schemaHash: string;
};

export type SourceLockDrift = {
  kind: "missing-tool" | "new-tool" | "schema-changed" | "description-changed";
  sourceId: string;
  tool: string;
  expected?: string;
  actual?: string;
};

export function buildSourceLockfile(input: { importedTools: ImportedTool[]; now?: string }): SourceLockfile {
  const sources: SourceLockfile["sources"] = {};
  for (const tool of input.importedTools) {
    const source = (sources[tool.sourceId] ??= { tools: {} });
    source.tools[tool.name] = {
      descriptionHash: hash(tool.description),
      schemaHash: hash(tool.inputSchema)
    };
  }
  return { version: "0.1", generatedAt: input.now ?? new Date().toISOString(), sources };
}

export function verifySourceLockfile(lockfile: SourceLockfile, importedTools: ImportedTool[]): SourceLockDrift[] {
  const drifts: SourceLockDrift[] = [];
  const current = buildSourceLockfile({ importedTools, now: lockfile.generatedAt });
  for (const [sourceId, source] of Object.entries(lockfile.sources)) {
    const currentSource = current.sources[sourceId];
    for (const [tool, locked] of Object.entries(source.tools)) {
      const actual = currentSource?.tools[tool];
      if (!actual) {
        drifts.push({ kind: "missing-tool", sourceId, tool });
        continue;
      }
      if (locked.schemaHash !== actual.schemaHash) {
        drifts.push({ kind: "schema-changed", sourceId, tool, expected: locked.schemaHash, actual: actual.schemaHash });
      }
      if (locked.descriptionHash !== actual.descriptionHash) {
        drifts.push({ kind: "description-changed", sourceId, tool, expected: locked.descriptionHash, actual: actual.descriptionHash });
      }
    }
  }
  for (const [sourceId, source] of Object.entries(current.sources)) {
    for (const tool of Object.keys(source.tools)) {
      if (!lockfile.sources[sourceId]?.tools[tool]) drifts.push({ kind: "new-tool", sourceId, tool });
    }
  }
  return drifts;
}

export function hash(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
