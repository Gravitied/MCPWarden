import { describe, expect, it } from "vitest";
import { buildSourceLockfile, verifySourceLockfile } from "../../src/sources/lockfile.js";
import type { ImportedTool } from "../../src/adapters/toolSourceAdapter.js";

const tools: ImportedTool[] = [
  {
    name: "tests.get_failures",
    description: "Get failures",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
    sourceKind: "mcp",
    sourceId: "fixture-mcp",
    diagnostics: []
  }
];

describe("source lockfile", () => {
  it("pins imported tool schema hashes and detects drift", () => {
    const lock = buildSourceLockfile({ importedTools: tools });
    expect(lock.sources["fixture-mcp"]?.tools["tests.get_failures"]?.schemaHash).toMatch(/^sha256:/);
    expect(verifySourceLockfile(lock, tools)).toEqual([]);
    expect(
      verifySourceLockfile(lock, [{ ...tools[0]!, inputSchema: { type: "object", properties: { changed: { type: "string" } } } }])
    ).toEqual([
      expect.objectContaining({ kind: "schema-changed", sourceId: "fixture-mcp", tool: "tests.get_failures" })
    ]);
  });
});
