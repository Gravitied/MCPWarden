import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { McpSourceConfig } from "../config/config.js";
import { noopLogger, type Logger } from "../diagnostics/logger.js";
import { SdkMcpClientFactory, type McpClientFactory } from "./mcpClient.js";
import type { ImportedTool, ToolSourceAdapter } from "./toolSourceAdapter.js";

const mcpToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
  inputSchema: z.record(z.string(), z.unknown()).optional().default({})
});

const mcpToolsListSchema = z.object({ tools: z.array(mcpToolSchema) });

export type McpToolsList = z.infer<typeof mcpToolsListSchema>;

export class McpToolsListAdapter implements ToolSourceAdapter<McpSourceConfig> {
  readonly kind = "mcp" as const;

  constructor(private readonly options: { toolsList?: unknown; clientFactory?: McpClientFactory; logger?: Logger } = {}) {}

  async loadTools(config: McpSourceConfig): Promise<ImportedTool[]> {
    const raw = this.options.toolsList ?? (config.transport === "fixture" ? await this.loadFixture(config) : await this.loadLive(config));
    const list = mcpToolsListSchema.parse(raw);
    return list.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      sourceKind: "mcp",
      sourceId: config.id,
      raw: tool,
      diagnostics: ["missing outputTrust", "missing effectRules", "tool is inspect-only until annotated"]
    }));
  }

  private async loadFixture(config: McpSourceConfig): Promise<unknown> {
    if (config.transport !== "fixture" || !config.fixturePath) {
      throw new Error(`MCP source "${config.id}" requires fixturePath for deterministic import`);
    }
    return JSON.parse(await readFile(config.fixturePath, "utf8"));
  }

  private async loadLive(config: McpSourceConfig): Promise<unknown> {
    const startedAt = Date.now();
    const logger = this.options.logger ?? noopLogger;
    logger.debug("mcp.tools.list.start", { sourceId: config.id });
    const client = await (this.options.clientFactory ?? new SdkMcpClientFactory()).createClient(config);
    try {
      const result = await client.listTools();
      await client.close();
      logger.info("mcp.tools.list.complete", { sourceId: config.id, durationMs: Date.now() - startedAt });
      return result;
    } catch (error) {
      try {
        await client.close();
      } catch {
        // Preserve the tools/list failure; cleanup errors are secondary here.
      }
      logger.error("mcp.tools.list.error", {
        sourceId: config.id,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}
