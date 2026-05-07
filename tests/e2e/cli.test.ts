import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);
const cliPath = resolve("src/cli.ts");
const require = createRequire(import.meta.url);
const tsxLoader = pathToFileURL(require.resolve("tsx")).href;

async function runCli(args: string[], cwd = process.cwd()) {
  return exec(process.execPath, ["--import", tsxLoader, cliPath, ...args], { cwd });
}

describe("mcpw CLI", () => {
  it("checks a valid workflow", async () => {
    const { stdout } = await runCli(["check", "examples/triage-failing-tests.workflow.json"]);
    expect(stdout).toContain("OK workflow=triage_failing_tests");
  });

  it("prints approval requirements for apply workflow", async () => {
    const { stdout } = await runCli(["plan", "examples/apply-patch.workflow.json"]);
    expect(stdout).toContain("Approvals required");
    expect(stdout).toContain("write.repo");
  });

  it("runs a safe dry-run workflow", async () => {
    const { stdout } = await runCli(["run", "examples/triage-failing-tests.workflow.json", "--dry-run"]);
    expect(stdout).toContain("\"ok\": true");
    expect(stdout).toContain("\"step.completed\"");
  });

  it("refuses a mutating workflow without approval", async () => {
    await expect(runCli(["run", "examples/apply-patch.workflow.json", "--dry-run"])).rejects.toMatchObject({
      stderr: expect.stringContaining("approval required: write.repo")
    });
  });

  it("lists configured external sources", async () => {
    const { stdout } = await runCli(["sources", "list", "--config", "examples/mcpw.config.json"]);
    expect(stdout).toContain("fixture-mcp");
    expect(stdout).toContain("mcp");
  });

  it("inspects configured external source diagnostics", async () => {
    const { stdout } = await runCli(["sources", "inspect", "--config", "examples/mcpw.config.json", "--source", "fixture-mcp"]);
    expect(stdout).toContain("fixture-mcp");
    expect(stdout).toContain("tests.get_failures");
    expect(stdout).toContain("missing outputTrust");
  });

  it("exports starter manifests for configured external source", async () => {
    const { stdout } = await runCli(["manifests", "export", "--config", "examples/mcpw.config.json", "--source", "fixture-mcp"]);
    const manifest = JSON.parse(stdout);
    expect(manifest.sources["fixture-mcp"].tools["tests.get_failures"]).toEqual({
      outputTrust: "untrusted",
      effectRules: [],
      requiresApproval: []
    });
    expect(manifest.sources["fixture-mcp"].tools.unknown).toBeUndefined();
  });

  it("checks a workflow using an imported MCP tool after overrides", async () => {
    const { stdout } = await runCli([
      "check",
      "examples/imported-mcp-tool.workflow.json",
      "--config",
      "examples/mcpw.config.json"
    ]);
    expect(stdout).toContain("OK workflow=imported_mcp_tool");
    expect(stdout).toContain("read.tests");
  });

  it("denies an imported MCP tool when overrides are not provided", async () => {
    await expect(
      runCli(["check", "examples/imported-mcp-tool.workflow.json", "--config", "examples/mcpw-no-overrides.config.json"])
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("unknown tool: tests.get_failures")
    });
  });

  it("initializes starter project files", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "mcpw-cli-init-"));
    try {
      const { stdout } = await runCli(["init"], cwd);
      expect(stdout).toContain("created mcpw.config.json");
      expect(await readFile(join(cwd, "mcpw.config.json"), "utf8")).toContain("\"sources\"");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("runs doctor in JSON mode", async () => {
    const { stdout } = await runCli(["doctor", "--config", "examples/mcpw.config.json", "--json"]);
    const result = JSON.parse(stdout);
    expect(result.ok).toBe(true);
    expect(result.checks.some((check: { code: string }) => check.code === "SOURCE_OK")).toBe(true);
  });
});
