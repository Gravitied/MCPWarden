import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLogger } from "../../src/diagnostics/logger.js";
import { createService } from "../../src/service/httpService.js";

function authHeaders(service: unknown): Record<string, string> {
  const token = (service as { authToken?: string }).authToken;
  return token ? { authorization: `Bearer ${token}` } : {};
}

describe("local service", () => {
  it("serves health and sources endpoints", async () => {
    const service = await createService({ configPath: "examples/mcpw.config.json", port: 0 });
    await service.start();
    try {
      const health = await fetch(`${service.url}/health`).then((response) => response.json());
      expect(health.ok).toBe(true);
      expect(health.version).toBe("0.1.0");

      const sources = await fetch(`${service.url}/sources`, { headers: authHeaders(service) }).then((response) => response.json());
      expect(sources.sources[0].id).toBe("fixture-mcp");
    } finally {
      await service.stop();
    }
  });

  it("logs request diagnostics without secrets", async () => {
    const lines: string[] = [];
    const service = await createService({
      configPath: "examples/mcpw.config.json",
      port: 0,
      logger: createLogger({ level: "info", sink: (line) => lines.push(line) })
    });
    await service.start();
    try {
      await fetch(`${service.url}/health`, { headers: { authorization: "Bearer leaked-token" } });

      const requestLog = lines.map((line) => JSON.parse(line)).find((line) => line.event === "http.request");
      expect(requestLog).toMatchObject({
        level: "info",
        event: "http.request",
        data: {
          method: "GET",
          path: "/health",
          status: 200
        }
      });
      expect(JSON.stringify(requestLog)).not.toContain("leaked-token");
    } finally {
      await service.stop();
    }
  });

  it("checks workflows through the service", async () => {
    const service = await createService({ configPath: "examples/mcpw.config.json", port: 0 });
    await service.start();
    try {
      const response = await fetch(`${service.url}/workflows/check`, {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders(service) },
        body: JSON.stringify({
          version: "0.1",
          workflow: "imported_mcp_tool",
          steps: [{ id: "failures", op: "tool.call", tool: "tests.get_failures", args: { limit: 1 } }]
        })
      });
      const result = await response.json();
      expect(response.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.effects).toContain("read.tests");
    } finally {
      await service.stop();
    }
  });

  it("applies compact verbosity query options to workflow runs", async () => {
    const service = await createService({
      configPath: "examples/mcpw.config.json",
      port: 0,
      broker: {
        async callTool() {
          return { rows: Array.from({ length: 10 }, (_, index) => ({ index, detail: "x".repeat(50) })) };
        }
      }
    });
    await service.start();
    try {
      const response = await fetch(`${service.url}/workflows/run?verbosity=compact&outputs=refs&trace=summary&maxOutputBytes=100`, {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders(service) },
        body: JSON.stringify({
          version: "0.1",
          workflow: "compact_run",
          steps: [{ id: "failures", op: "tool.call", tool: "tests.get_failures", args: { limit: 10 } }]
        })
      });
      const result = await response.json();
      expect(response.status).toBe(200);
      expect(result.outputs.failures).toMatchObject({ id: expect.stringMatching(/^art_/), type: "WorkflowOutput" });
      expect(result.trace).toMatchObject({ workflow: "compact_run", eventCount: 2 });
      expect(result.metrics.tokens.output).toBeGreaterThan(0);
    } finally {
      await service.stop();
    }
  });

  it("streams workflow trace events as ndjson", async () => {
    const service = await createService({ configPath: "examples/mcpw.config.json", port: 0 });
    await service.start();
    try {
      const response = await fetch(`${service.url}/workflows/run?stream=events`, {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders(service) },
        body: JSON.stringify({
          version: "0.1",
          workflow: "stream_run",
          steps: [{ id: "failures", op: "tool.call", tool: "tests.get_failures", args: { limit: 1 } }]
        })
      });
      const lines = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
      expect(response.headers.get("content-type")).toContain("application/x-ndjson");
      expect(lines.map((line) => line.type)).toEqual(["event", "event", "result"]);
      expect(lines[0].event.kind).toBe("step.started");
      expect(lines[2].result.ok).toBe(true);
    } finally {
      await service.stop();
    }
  });

  it("rejects startup when the requested port is already in use", async () => {
    const first = await createService({ port: 0 });
    await first.start();
    const port = Number(new URL(first.url).port);
    const second = await createService({ port });
    try {
      await expect(second.start()).rejects.toMatchObject({ code: "EADDRINUSE" });
    } finally {
      await first.stop();
    }
  });

  it("runs approved imported tools through the configured broker", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "mcpw-service-"));
    try {
      const toolsPath = join(cwd, "tools.json");
      const configPath = join(cwd, "mcpw.config.json");
      const overridesPath = join(cwd, "mcpw.overrides.json");

      await writeFile(
        toolsPath,
        JSON.stringify({
          tools: [{ name: "custom.echo", description: "Echo args", inputSchema: { type: "object" } }]
        })
      );
      await writeFile(
        configPath,
        JSON.stringify({
          sources: [{ id: "fixture-custom", kind: "mcp", transport: "fixture", fixturePath: toolsPath }]
        })
      );
      await writeFile(
        overridesPath,
        JSON.stringify({
          sources: {
            "fixture-custom": {
              tools: {
                "custom.echo": {
                  outputTrust: "artifact",
                  effectRules: [{ kind: "static", effects: ["read.tests"] }]
                }
              }
            }
          }
        })
      );

      const service = await createService({
        configPath,
        overridesPath,
        port: 0,
        broker: {
          async callTool(name, args) {
            return { name, args };
          }
        }
      });
      await service.start();
      try {
        const response = await fetch(`${service.url}/workflows/run`, {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeaders(service) },
          body: JSON.stringify({
            version: "0.1",
            workflow: "custom_run",
            steps: [{ id: "echo", op: "tool.call", tool: "custom.echo", args: { value: 1 } }]
          })
        });
        const result = await response.json();
        expect(response.status).toBe(200);
        expect(result.outputs.echo).toEqual({ name: "custom.echo", args: { value: 1 } });
      } finally {
        await service.stop();
      }
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("runs approved stdio MCP tools through the default service broker", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "mcpw-service-stdio-"));
    try {
      const configPath = join(cwd, "mcpw.config.json");
      const overridesPath = join(cwd, "mcpw.overrides.json");

      await writeFile(
        configPath,
        JSON.stringify({
          sources: [
            {
              id: "stdio-real",
              kind: "mcp",
              transport: "stdio",
              command: process.execPath,
              args: [join(process.cwd(), "tests/fixtures/stdio-mcp-server.mjs")]
            }
          ]
        })
      );
      await writeFile(
        overridesPath,
        JSON.stringify({
          sources: {
            "stdio-real": {
              tools: {
                "custom.echo": {
                  outputTrust: "artifact",
                  effectRules: [{ kind: "static", effects: ["read.tests"] }]
                }
              }
            }
          }
        })
      );

      const service = await createService({ configPath, overridesPath, port: 0 });
      await service.start();
      try {
        const response = await fetch(`${service.url}/workflows/run`, {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeaders(service) },
          body: JSON.stringify({
            version: "0.1",
            workflow: "stdio_run",
            steps: [{ id: "echo", op: "tool.call", tool: "custom.echo", args: {} }]
          })
        });
        const result = await response.json();
        expect(response.status).toBe(200);
        expect(result.outputs.echo.content[0].text).toBe("ok");
      } finally {
        await service.stop();
      }
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
