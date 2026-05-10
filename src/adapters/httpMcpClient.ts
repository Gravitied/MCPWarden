import type { McpSourceConfig } from "../config/config.js";
import type { McpClientConnection } from "./mcpClient.js";

export class HttpMcpClient implements McpClientConnection {
  private nextId = 0;

  constructor(private readonly source: McpSourceConfig) {
    if (!source.url) throw new Error(`MCP source "${source.id}" missing url`);
  }

  async listTools(): Promise<unknown> {
    return this.request("tools/list", {});
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.request("tools/call", { name, arguments: args });
  }

  async close(): Promise<void> {}

  private async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.source.timeoutMs ?? 5000);
    try {
      const response = await fetch(this.source.url!, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++this.nextId, method, params }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP MCP request failed: ${response.status}`);
      const rpc = (await response.json()) as { result?: unknown; error?: { message?: string } };
      if (rpc.error) throw new Error(rpc.error.message ?? "HTTP MCP JSON-RPC error");
      return rpc.result;
    } finally {
      clearTimeout(timeout);
    }
  }
}
