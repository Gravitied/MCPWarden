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
