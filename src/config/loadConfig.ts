import { readFile } from "node:fs/promises";
import { parseManifestOverrides, parseMcpwConfig, type ManifestOverrides, type McpwConfig } from "./config.js";

export async function loadMcpwConfig(path = "mcpw.config.json"): Promise<McpwConfig> {
  try {
    return parseMcpwConfig(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (isNotFound(error)) return { sources: [] };
    throw error;
  }
}

export async function loadManifestOverrides(path = "mcpw.overrides.json"): Promise<ManifestOverrides> {
  try {
    return parseManifestOverrides(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (isNotFound(error)) return { sources: {} };
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
