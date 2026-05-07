import type { McpSourceConfig } from "../config/config.js";

export type ToolSourceKind = "mcp" | "openapi" | "langchain" | "custom-json";

export type ImportedTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  sourceKind: ToolSourceKind;
  sourceId: string;
  raw: unknown;
  diagnostics: string[];
};

export type ToolSourceAdapter<TConfig = McpSourceConfig> = {
  readonly kind: ToolSourceKind;
  loadTools(config: TConfig): Promise<ImportedTool[]>;
};
