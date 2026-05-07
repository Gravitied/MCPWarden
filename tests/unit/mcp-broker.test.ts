import { describe, expect, it } from "vitest";
import { McpToolBroker } from "../../src/adapters/mcpToolBroker.js";

describe("MCP tool broker", () => {
  it("routes approved tool calls to the source client", async () => {
    const broker = new McpToolBroker({
      sources: [
        {
          id: "fixture",
          kind: "mcp",
          transport: "stdio",
          command: "node",
          args: ["server.js"],
          defaultPolicy: "deny-unknown",
          timeoutMs: 5000
        }
      ],
      toolToSource: new Map([["tests.get_failures", "fixture"]]),
      clientFactory: {
        async createClient() {
          return {
            async listTools() {
              return { tools: [] };
            },
            async callTool(name: string, args: Record<string, unknown>) {
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
