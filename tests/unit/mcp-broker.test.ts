import { describe, expect, it } from "vitest";
import { McpToolBroker } from "../../src/adapters/mcpToolBroker.js";
import { createLogger } from "../../src/diagnostics/logger.js";

describe("MCP tool broker", () => {
  it("routes approved tool calls to the source client and logs safe diagnostics", async () => {
    const lines: string[] = [];
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
      },
      logger: createLogger({ level: "debug", sink: (line) => lines.push(line) })
    });

    await expect(broker.callTool("tests.get_failures", { limit: 1 })).resolves.toEqual({
      name: "tests.get_failures",
      args: { limit: 1 },
      ok: true
    });
    expect(lines.map((line) => JSON.parse(line).event)).toEqual([
      "mcp.tool.call.start",
      "mcp.tool.call.complete"
    ]);
    expect(JSON.stringify(lines)).not.toContain("limit");
  });

  it("preserves the tool failure when client cleanup also fails", async () => {
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
            async callTool() {
              throw new Error("tool failed");
            },
            async close() {
              throw new Error("close failed");
            }
          };
        }
      }
    });

    await expect(broker.callTool("tests.get_failures", { limit: 1 })).rejects.toThrow("tool failed");
  });
});
