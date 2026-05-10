import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

  it("runs workflows with compact verbosity", async () => {
    const { stdout } = await runCli(["run", "examples/triage-failing-tests.workflow.json", "--dry-run", "--verbosity", "compact"]);
    const result = JSON.parse(stdout);
    expect(result.ok).toBe(true);
    expect(result.trace).toMatchObject({ workflow: "triage_failing_tests", eventCount: expect.any(Number) });
    expect(JSON.stringify(result.outputs)).toContain("\"kind\"");
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

  it("prints compact manifest selection cards", async () => {
    const { stdout } = await runCli(["manifests", "compact", "--config", "examples/mcpw.config.json", "--source", "fixture-mcp"]);
    const cards = JSON.parse(stdout);
    expect(cards[0]).toMatchObject({ name: "tests.get_failures", outputTrust: "artifact" });
  });

  it("prints manifest quality audits", async () => {
    const { stdout } = await runCli(["manifests", "audit", "--config", "examples/mcpw.config.json", "--source", "fixture-mcp"]);
    const audits = JSON.parse(stdout);
    expect(audits[0]).toMatchObject({ tool: "tests.get_failures", score: expect.any(Number) });
  });

  it("prints the workflow JSON schema for model clients", async () => {
    const { stdout } = await runCli(["generate", "workflow", "--schema"]);
    const schema = JSON.parse(stdout);
    expect(schema.title).toBe("MCPWarden Workflow IR");
    expect(JSON.stringify(schema)).toContain("agent.ask");
  });

  it("exposes hardening platform commands", async () => {
    const { stdout: policy } = await runCli(["policy", "init", "--profile", "enterprise-strict"]);
    expect(JSON.parse(policy).deny).toContain("read.secrets");

    const { stdout: scan } = await runCli(["security", "scan", "--config", "examples/mcpw.config.json"]);
    expect(JSON.parse(scan).summary.totalTools).toBeGreaterThan(0);

    const { stdout: approval } = await runCli([
      "approve",
      "issue",
      "examples/apply-patch.workflow.json",
      "--secret",
      "test-secret",
      "--expires",
      "5m"
    ]);
    expect(JSON.parse(approval).token).toContain(".");

    const { stdout: lock } = await runCli(["sources", "lock", "--config", "examples/mcpw.config.json"]);
    expect(JSON.parse(lock).sources["fixture-mcp"].tools["tests.get_failures"].schemaHash).toContain("sha256:");

    const { stdout: graph } = await runCli(["trace", "graph", "examples/triage-failing-tests.workflow.json", "--format", "mermaid"]);
    expect(graph).toContain("flowchart LR");

    const { stdout: conformance } = await runCli(["conformance", "run"]);
    expect(JSON.parse(conformance).ok).toBe(true);

    const { stdout: attacks } = await runCli(["attacks", "run"]);
    expect(JSON.parse(attacks).ok).toBe(true);

    const { stdout: dashboard } = await runCli(["dashboard", "--print"]);
    expect(dashboard).toContain("MCPWarden Dashboard");
  });

  it("lists and shows persistent run records", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "mcpw-cli-runs-"));
    try {
      const store = join(cwd, "runs.jsonl");
      await writeFile(
        store,
        `${JSON.stringify({ runId: "run_1", workflow: "wf", ok: true, createdAt: "2026-05-10T00:00:00.000Z" })}\n`
      );
      const { stdout: list } = await runCli(["runs", "list", "--store", store]);
      expect(JSON.parse(list)[0].runId).toBe("run_1");
      const { stdout: show } = await runCli(["runs", "show", "run_1", "--store", store]);
      expect(JSON.parse(show).workflow).toBe("wf");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
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

  it("starts service and responds to health", async () => {
    const child = spawn(process.execPath, ["--import", tsxLoader, cliPath, "serve", "--config", "examples/mcpw.config.json", "--port", "0"], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"]
    });
    try {
      const line = await onceStdoutLine(child);
      const url = line.match(/http:\/\/[^\s]+/)?.[0];
      expect(url).toBeDefined();
      const health = await fetch(`${url}/health`).then((response) => response.json());
      expect(health.ok).toBe(true);
    } finally {
      child.kill();
    }
  });
});

function onceStdoutLine(child: ChildProcessWithoutNullStreams): Promise<string> {
  return new Promise((resolve, reject) => {
    child.stdout.once("data", (data) => resolve(String(data)));
    child.stderr.once("data", (data) => reject(new Error(String(data))));
  });
}
