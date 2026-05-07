import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);

async function runCli(args: string[]) {
  return exec(process.execPath, ["--import", "tsx", "src/cli.ts", ...args]);
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
});
