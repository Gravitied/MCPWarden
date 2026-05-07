import { access } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

export type ConfigPathInput = {
  cwd?: string;
  configPath?: string;
  overridesPath?: string;
};

export type DiscoveredConfigPaths = {
  configPath?: string;
  overridesPath?: string;
};

export async function discoverConfigPaths(input: ConfigPathInput = {}): Promise<DiscoveredConfigPaths> {
  const cwd = resolve(input.cwd ?? process.cwd());
  const configPath = input.configPath ? resolve(cwd, input.configPath) : await existingPath(resolve(cwd, "mcpw.config.json"));
  const overridesPath = input.overridesPath
    ? resolve(cwd, input.overridesPath)
    : configPath
      ? siblingOverridesPath(configPath)
      : await existingPath(resolve(cwd, "mcpw.overrides.json"));

  const result: DiscoveredConfigPaths = {};
  if (configPath) result.configPath = configPath;
  if (overridesPath) result.overridesPath = overridesPath;
  return result;
}

function siblingOverridesPath(configPath: string): string {
  const filename = basename(configPath);
  return resolve(dirname(configPath), filename.endsWith("config.json") ? filename.replace(/config\.json$/, "overrides.json") : "mcpw.overrides.json");
}

async function existingPath(path: string): Promise<string | undefined> {
  try {
    await access(path);
    return path;
  } catch {
    return undefined;
  }
}
