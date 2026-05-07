import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { McpSourceConfig } from "../config/config.js";
import type { ImportedTool, ToolSourceAdapter } from "./toolSourceAdapter.js";

const mcpToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
  inputSchema: z.record(z.unknown()).optional().default({})
});

const mcpToolsListSchema = z.object({ tools: z.array(mcpToolSchema) });

export type McpToolsList = z.infer<typeof mcpToolsListSchema>;

export class McpToolsListAdapter implements ToolSourceAdapter<McpSourceConfig> {
  readonly kind = "mcp" as const;

  constructor(private readonly options: { toolsList?: unknown } = {}) {}

  async loadTools(config: McpSourceConfig): Promise<ImportedTool[]> {
    const raw = this.options.toolsList ?? (await this.loadFixture(config));
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
}
