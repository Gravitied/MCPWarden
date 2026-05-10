import { describe, expect, it } from "vitest";
import { renderDashboardHtml } from "../../src/dashboard/dashboard.js";

describe("dashboard", () => {
  it("renders a local status dashboard without external assets", () => {
    const html = renderDashboardHtml({
      version: "0.1.0",
      sources: [{ id: "fixture", kind: "mcp", tools: 2 }],
      runs: [{ runId: "run_1", workflow: "wf", ok: true }],
      findings: [{ severity: "high", title: "Tool poisoning" }]
    });

    expect(html).toContain("MCPWarden Dashboard");
    expect(html).toContain("fixture");
    expect(html).not.toContain("https://");
  });
});
