import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runDoctor } from "../../src/cli/doctor.js";

describe("doctor", () => {
  it("passes for fixture config with discoverable tools", async () => {
    const result = await runDoctor({ configPath: "examples/mcpw.config.json" });

    expect(result.ok).toBe(true);
    expect(result.checks.map((check) => check.code)).toContain("CONFIG_OK");
    expect(result.checks.map((check) => check.code)).toContain("SOURCE_OK");
  });

  it("reports invalid config as CONFIG_INVALID", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "mcpw-doctor-"));
    try {
      const configPath = join(cwd, "mcpw.config.json");
      await writeFile(configPath, "{");
      const result = await runDoctor({ configPath });

      expect(result.ok).toBe(false);
      expect(result.checks.some((check) => check.code === "CONFIG_INVALID")).toBe(true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
