import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { HttpMcpClient } from "../../src/adapters/httpMcpClient.js";
import { SdkMcpClientFactory } from "../../src/adapters/mcpClient.js";

const servers: Array<{ close: (callback: () => void) => void }> = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(resolve))));
  servers.length = 0;
});

describe("HTTP MCP client", () => {
  it("lists and calls tools over JSON-RPC HTTP", async () => {
    const server = createServer(async (request, response) => {
      const body = await readBody(request);
      const rpc = JSON.parse(body);
      response.writeHead(200, { "content-type": "application/json" });
      if (rpc.method === "tools/list") {
        response.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: { tools: [{ name: "http.echo", inputSchema: {} }] } }));
      } else {
        response.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: { content: [{ type: "text", text: JSON.stringify(rpc.params) }] } }));
      }
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const client = new HttpMcpClient({ id: "http", kind: "mcp", transport: "http", url: `http://127.0.0.1:${port}` });

    await expect(client.listTools()).resolves.toMatchObject({ tools: [{ name: "http.echo" }] });
    await expect(client.callTool("http.echo", { value: 1 })).resolves.toMatchObject({ content: [{ type: "text" }] });
  });

  it("factory creates HTTP clients for http sources", async () => {
    const client = await new SdkMcpClientFactory().createClient({
      id: "http",
      kind: "mcp",
      transport: "http",
      url: "http://127.0.0.1:1"
    });
    expect(client).toBeInstanceOf(HttpMcpClient);
  });
});

async function readBody(request: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
