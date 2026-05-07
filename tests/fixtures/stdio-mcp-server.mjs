import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({ name: "mcpw-stdio-fixture", version: "1.0.0" });

server.tool("custom.echo", "Echo arguments for mcpw integration tests", async () => ({
  content: [{ type: "text", text: "ok" }]
}));

await server.connect(new StdioServerTransport());
