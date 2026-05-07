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
