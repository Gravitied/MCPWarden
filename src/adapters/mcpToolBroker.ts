import type { McpSourceConfig } from "../config/config.js";
import type { ToolBroker } from "../runtime/broker.js";
import { SdkMcpClientFactory, type McpClientFactory } from "./mcpClient.js";

export type McpToolBrokerInput = {
  sources: McpSourceConfig[];
  toolToSource: Map<string, string>;
  clientFactory?: McpClientFactory;
};

export class McpToolBroker implements ToolBroker {
  constructor(private readonly input: McpToolBrokerInput) {}

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const sourceId = this.input.toolToSource.get(name);
    if (!sourceId) throw new Error(`unknown MCP tool source for: ${name}`);
    const source = this.input.sources.find((item) => item.id === sourceId);
    if (!source) throw new Error(`unknown MCP source: ${sourceId}`);

    const client = await (this.input.clientFactory ?? new SdkMcpClientFactory()).createClient(source);
    try {
      const result = await client.callTool(name, args);
      await client.close();
      return result;
    } catch (error) {
      try {
        await client.close();
      } catch {
        // Preserve the operation failure; cleanup errors are secondary here.
      }
      throw error;
    }
  }
}
