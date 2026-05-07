import { describe, expect, it } from "vitest";
import { McpToolsListAdapter } from "../../src/adapters/mcpToolsListAdapter.js";
import { buildUniversalToolRegistry } from "../../src/manifests/universalRegistry.js";
import { fixtureMcpToolsList } from "../fixtures/mcpToolsList.js";

describe("universal tool registry", () => {
  it("keeps imported tools inspect-only without safety overrides", async () => {
    const result = await buildUniversalToolRegistry({
      builtInTools: [],
      sources: [{ id: "fixture-mcp", kind: "mcp", transport: "fixture", defaultPolicy: "deny-unknown", timeoutMs: 5000 }],
      overrides: { sources: {} },
      adapters: { mcp: new McpToolsListAdapter({ toolsList: fixtureMcpToolsList }) }
    });

    expect(() => result.registry.getTool("tests.get_failures")).toThrow("unknown tool: tests.get_failures");
    expect(result.importedTools.map((tool) => tool.name)).toContain("tests.get_failures");
    expect(result.diagnostics).toContain("fixture-mcp:tests.get_failures missing outputTrust");
    expect(result.diagnostics).toContain("fixture-mcp:tests.get_failures missing effectRules");
  });

  it("turns an imported MCP tool into a ToolManifest after explicit overrides", async () => {
    const result = await buildUniversalToolRegistry({
      builtInTools: [],
      sources: [{ id: "fixture-mcp", kind: "mcp", transport: "fixture", defaultPolicy: "deny-unknown", timeoutMs: 5000 }],
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
