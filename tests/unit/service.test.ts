import { describe, expect, it } from "vitest";
import { createService } from "../../src/service/httpService.js";

describe("local service", () => {
  it("serves health and sources endpoints", async () => {
    const service = await createService({ configPath: "examples/mcpw.config.json", port: 0 });
    await service.start();
    try {
      const health = await fetch(`${service.url}/health`).then((response) => response.json());
      expect(health.ok).toBe(true);
      expect(health.version).toBe("0.1.0");

      const sources = await fetch(`${service.url}/sources`).then((response) => response.json());
      expect(sources.sources[0].id).toBe("fixture-mcp");
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
        headers: { "content-type": "application/json" },
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
});
