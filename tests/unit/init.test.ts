import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initializeProject } from "../../src/cli/init.js";

describe("mcpw init", () => {
  it("creates starter config, overrides, and workflow files", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "mcpw-init-"));
    try {
      const result = await initializeProject({ cwd });

      expect(result.created.map((item) => item.name).sort()).toEqual([
        "example.workflow.json",
        "mcpw.config.json",
        "mcpw.overrides.json"
      ]);
      expect(await readFile(join(cwd, "mcpw.config.json"), "utf8")).toContain("\"sources\"");
      expect(await readFile(join(cwd, "example.workflow.json"), "utf8")).toContain("\"workflow\"");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("does not overwrite existing files", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "mcpw-init-"));
    try {
      await writeFile(join(cwd, "mcpw.config.json"), "{\"sentinel\":true}");
      const result = await initializeProject({ cwd });

      expect(result.skipped.map((item) => item.name)).toContain("mcpw.config.json");
      expect(await readFile(join(cwd, "mcpw.config.json"), "utf8")).toBe("{\"sentinel\":true}");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
