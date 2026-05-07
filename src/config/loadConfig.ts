import { readFile } from "node:fs/promises";
import { parseManifestOverrides, parseMcpwConfig, type ManifestOverrides, type McpwConfig } from "./config.js";
import { discoverConfigPaths, type ConfigPathInput } from "./paths.js";

export async function loadMcpwConfig(path = "mcpw.config.json"): Promise<McpwConfig> {
  try {
    return parseMcpwConfig(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (isNotFound(error)) return parseMcpwConfig({});
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

export async function loadConfigBundle(input: ConfigPathInput = {}): Promise<{
  config: McpwConfig;
  overrides: ManifestOverrides;
  configPath?: string;
  overridesPath?: string;
}> {
  const paths = await discoverConfigPaths(input);
  const config = paths.configPath ? await loadMcpwConfig(paths.configPath) : parseMcpwConfig({});
  const overrides = paths.overridesPath ? await loadManifestOverrides(paths.overridesPath) : { sources: {} };
  const result: {
    config: McpwConfig;
    overrides: ManifestOverrides;
    configPath?: string;
    overridesPath?: string;
  } = { config, overrides };
  if (paths.configPath) result.configPath = paths.configPath;
  if (paths.overridesPath) result.overridesPath = paths.overridesPath;
  return result;
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
