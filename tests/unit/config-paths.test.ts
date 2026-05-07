import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverConfigPaths } from "../../src/config/paths.js";

describe("config path discovery", () => {
  it("uses explicit config and sibling overrides", async () => {
    const cwd = await mkdir(join(tmpdir(), `mcpw-paths-${Date.now()}`), { recursive: true });
    try {
      const configPath = join(cwd, "custom.config.json");
      const overridesPath = join(cwd, "custom.overrides.json");
      await writeFile(configPath, "{}");
      await writeFile(overridesPath, "{}");

      const paths = await discoverConfigPaths({ cwd, configPath });

      expect(paths.configPath).toBe(resolve(configPath));
      expect(paths.overridesPath).toBe(resolve(overridesPath));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("falls back to mcpw.config.json in cwd", async () => {
    const cwd = await mkdir(join(tmpdir(), `mcpw-paths-${Date.now()}`), { recursive: true });
    try {
      await writeFile(join(cwd, "mcpw.config.json"), "{}");
      const paths = await discoverConfigPaths({ cwd });
      expect(paths.configPath).toBe(resolve(cwd, "mcpw.config.json"));
      expect(paths.overridesPath).toBe(resolve(cwd, "mcpw.overrides.json"));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
