import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { McpToolsListAdapter } from "../../src/adapters/mcpToolsListAdapter.js";
import { fixtureMcpToolsList } from "../fixtures/mcpToolsList.js";

describe("MCP tools/list adapter", () => {
  it("imports MCP tools into neutral imported tools", async () => {
    const adapter = new McpToolsListAdapter({ toolsList: fixtureMcpToolsList });
    const tools = await adapter.loadTools({
      id: "fixture-mcp",
      kind: "mcp",
      transport: "fixture",
      defaultPolicy: "deny-unknown",
      timeoutMs: 5000
    });
    expect(tools).toHaveLength(2);
    expect(tools[0]).toMatchObject({ name: "tests.get_failures", sourceKind: "mcp", sourceId: "fixture-mcp" });
    expect(tools[0]?.diagnostics).toEqual([
      "missing outputTrust",
      "missing effectRules",
      "tool is inspect-only until annotated"
    ]);
  });

  it("loads MCP tools from a JSON fixture path", async () => {
    const adapter = new McpToolsListAdapter();
    const tools = await adapter.loadTools({
      id: "fixture-file",
      kind: "mcp",
      transport: "fixture",
      fixturePath: "tests/fixtures/mcp-tools-list.json",
      defaultPolicy: "deny-unknown",
      timeoutMs: 5000
    });
    expect(tools.map((tool) => tool.name)).toEqual(["tests.get_failures", "repo.apply_patch"]);
  });

  it("loads stdio tools through an MCP client factory", async () => {
    const adapter = new McpToolsListAdapter({
      clientFactory: {
        async createClient() {
          return {
            async listTools() {
              return fixtureMcpToolsList;
            },
            async callTool() {
              return { content: [] };
            },
            async close() {}
          };
        }
      }
    });

    const tools = await adapter.loadTools({
      id: "stdio-mcp",
      kind: "mcp",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
      defaultPolicy: "deny-unknown",
      timeoutMs: 5000
    });

    expect(tools.map((tool) => tool.name)).toEqual(["tests.get_failures", "repo.apply_patch"]);
  });

  it("preserves the tools/list failure when client cleanup also fails", async () => {
    const adapter = new McpToolsListAdapter({
      clientFactory: {
        async createClient() {
          return {
            async listTools() {
              throw new Error("tools/list failed");
            },
            async callTool() {
              return { content: [] };
            },
            async close() {
              throw new Error("close failed");
            }
          };
        }
      }
    });

    await expect(
      adapter.loadTools({
        id: "stdio-mcp",
        kind: "mcp",
        transport: "stdio",
        command: "node",
        args: ["server.js"],
        defaultPolicy: "deny-unknown",
        timeoutMs: 5000
      })
    ).rejects.toThrow("tools/list failed");
  });

  it("loads tools from a real stdio MCP server process", async () => {
    const adapter = new McpToolsListAdapter();
    const tools = await adapter.loadTools({
      id: "stdio-real",
      kind: "mcp",
      transport: "stdio",
      command: process.execPath,
      args: [resolve("tests/fixtures/stdio-mcp-server.mjs")],
      defaultPolicy: "deny-unknown",
      timeoutMs: 5000
    });

    expect(tools.map((tool) => tool.name)).toContain("custom.echo");
  });
});
