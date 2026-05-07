import { describe, expect, it } from "vitest";
import { createService } from "../../src/service/httpService.js";

describe("service policy boundaries", () => {
  it("refuses approval-required workflow runs", async () => {
    const service = await createService({ configPath: "examples/mcpw.config.json", port: 0 });
    await service.start();
    try {
      const response = await fetch(`${service.url}/workflows/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          version: "0.1",
          workflow: "mutating",
          steps: [{ id: "apply", op: "tool.call", tool: "repo.apply_patch", args: { mode: "apply", patch: {} } }]
        })
      });
      const result = await response.json();
      expect(response.status).toBe(403);
      expect(result.code).toBe("APPROVAL_REQUIRED");
    } finally {
      await service.stop();
    }
  });
});
