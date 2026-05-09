import { describe, expect, it } from "vitest";
import type { ToolSourceAdapter } from "../../src/adapters/toolSourceAdapter.js";
import type { McpSourceConfig } from "../../src/config/config.js";
import {
  buildCachedUniversalToolRegistry,
  clearUniversalRegistryCache
} from "../../src/manifests/universalRegistry.js";

describe("universal registry cache", () => {
  it("reuses tools/list results for the same source and override fingerprint", async () => {
    clearUniversalRegistryCache();
    let loads = 0;
    const adapter: ToolSourceAdapter<McpSourceConfig> = {
      async loadTools(source) {
        loads++;
        return [
          {
            name: "cached.echo",
            description: `Echo from ${source.id}`,
            inputSchema: { type: "object" },
            sourceKind: "mcp",
            sourceId: source.id,
            diagnostics: []
          }
        ];
      }
    };
    const input = {
      builtInTools: [],
      sources: [{ id: "cached", kind: "mcp" as const, transport: "fixture" as const }],
      overrides: {
        sources: {
          cached: {
            tools: {
              "cached.echo": {
                outputTrust: "artifact" as const,
                effectRules: [{ kind: "static" as const, effects: ["read.tests" as const] }]
              }
            }
          }
        }
      },
      adapters: { mcp: adapter }
    };

    const first = await buildCachedUniversalToolRegistry(input);
    const second = await buildCachedUniversalToolRegistry(input);

    expect(loads).toBe(1);
    expect(first.importedTools).toEqual(second.importedTools);
    expect(second.registry.getTool("cached.echo").outputTrust).toBe("artifact");
  });
});
