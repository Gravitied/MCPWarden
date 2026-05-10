import { describe, expect, it } from "vitest";
import { runAttackBenchmarks, runConformanceSuite } from "../../src/conformance/suite.js";

describe("conformance and attack suites", () => {
  it("checks fail-closed policy behavior", () => {
    const report = runConformanceSuite();
    expect(report.ok).toBe(true);
    expect(report.cases.map((item) => item.id)).toContain("missing-tool-denied");
  });

  it("ships attack benchmarks for MCP prompt and tool poisoning", () => {
    const report = runAttackBenchmarks();
    expect(report.ok).toBe(true);
    expect(report.cases.map((item) => item.id)).toEqual(expect.arrayContaining(["tool-description-poisoning", "secret-to-agent-denied"]));
  });
});
