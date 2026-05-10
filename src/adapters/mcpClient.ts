import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { McpSourceConfig } from "../config/config.js";
import { runtimeVersion } from "../packageInfo.js";
import { HttpMcpClient } from "./httpMcpClient.js";

export type McpClientConnection = {
  listTools(): Promise<unknown>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
};

export type McpClientFactory = {
  createClient(source: McpSourceConfig): Promise<McpClientConnection>;
};

export class SdkMcpClientFactory implements McpClientFactory {
  async createClient(source: McpSourceConfig): Promise<McpClientConnection> {
    if (source.transport === "http") return new HttpMcpClient(source);
    if (source.transport !== "stdio") throw new Error(`MCP source "${source.id}" transport is not stdio`);
    if (!source.command) throw new Error(`MCP source "${source.id}" missing command`);

    const client = new Client({ name: "mcpw", version: runtimeVersion });
    const transport = new StdioClientTransport({ command: source.command, args: source.args ?? [], stderr: "pipe" });
    await client.connect(transport);

    return {
      async listTools() {
        return client.listTools();
      },
      async callTool(name, args) {
        return client.callTool({ name, arguments: args });
      },
      async close() {
        await client.close();
      }
    };
  }
}
