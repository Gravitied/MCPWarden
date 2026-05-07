import { describe, expect, it } from "vitest";
import { createService } from "../../src/service/httpService.js";

function authHeaders(service: unknown): Record<string, string> {
  const token = (service as { authToken?: string }).authToken;
  return token ? { authorization: `Bearer ${token}` } : {};
}

describe("service policy boundaries", () => {
  it("rejects an explicitly blank auth token", async () => {
    await expect(createService({ authToken: "  " })).rejects.toThrow("authToken must not be blank");
  });

  it("rejects non-positive request body limits", async () => {
    await expect(createService({ maxRequestBytes: 0 })).rejects.toThrow("maxRequestBytes must be a positive integer");
  });

  it("refuses approval-required workflow runs", async () => {
    const service = await createService({ port: 0 });
    await service.start();
    try {
      const response = await fetch(`${service.url}/workflows/run`, {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders(service) },
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

  it("requires authorization before running workflows", async () => {
    const service = await createService({ configPath: "examples/mcpw.config.json", port: 0 });
    await service.start();
    try {
      const response = await fetch(`${service.url}/workflows/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          version: "0.1",
          workflow: "driveby",
          steps: [{ id: "failures", op: "tool.call", tool: "tests.get_failures", args: { limit: 1 } }]
        })
      });
      const result = await response.json();
      expect(response.status).toBe(401);
      expect(result.code).toBe("UNAUTHORIZED");
    } finally {
      await service.stop();
    }
  });

  it("rejects cross-origin simple POSTs before workflow execution", async () => {
    const service = await createService({ configPath: "examples/mcpw.config.json", port: 0 });
    await service.start();
    try {
      const response = await fetch(`${service.url}/workflows/run`, {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          origin: "https://attacker.example",
          ...authHeaders(service)
        },
        body: JSON.stringify({
          version: "0.1",
          workflow: "driveby",
          steps: [{ id: "failures", op: "tool.call", tool: "tests.get_failures", args: { limit: 1 } }]
        })
      });
      const result = await response.json();
      expect(response.status).toBe(403);
      expect(result.code).toBe("FORBIDDEN_ORIGIN");
    } finally {
      await service.stop();
    }
  });

  it("denies unresolved imported tools through the service", async () => {
    const service = await createService({ configPath: "examples/mcpw-no-overrides.config.json", port: 0 });
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
      expect(response.status).toBe(403);
      expect(result.code).toBe("POLICY_DENIED");
      expect(result.message).toContain("unknown tool: tests.get_failures");
    } finally {
      await service.stop();
    }
  });

  it("returns a client error for malformed workflow JSON", async () => {
    const service = await createService({ configPath: "examples/mcpw.config.json", port: 0 });
    await service.start();
    try {
      const response = await fetch(`${service.url}/workflows/check`, {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders(service) },
        body: "{not-json"
      });
      const result = await response.json();
      expect(response.status).toBe(400);
      expect(result.code).toBe("INVALID_JSON");
    } finally {
      await service.stop();
    }
  });

  it("caps JSON request bodies before buffering unbounded input", async () => {
    const service = await createService({ configPath: "examples/mcpw.config.json", port: 0, maxRequestBytes: 64 });
    await service.start();
    try {
      const response = await fetch(`${service.url}/workflows/check`, {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders(service) },
        body: JSON.stringify({ payload: "x".repeat(128) })
      });
      const result = await response.json();
      expect(response.status).toBe(413);
      expect(result.code).toBe("PAYLOAD_TOO_LARGE");
    } finally {
      await service.stop();
    }
  });
});
