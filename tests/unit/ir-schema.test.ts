import { describe, expect, it } from "vitest";
import { validateWorkflow } from "../../src/ir/validate.js";

describe("workflow IR validation", () => {
  it("accepts a minimal valid workflow", () => {
    const result = validateWorkflow({
      version: "0.1",
      workflow: "triage",
      steps: [
        {
          id: "failures",
          op: "tool.call",
          tool: "tests.get_failures",
          args: { limit: 10 },
          saveAs: "ArtifactRef<TestFailure[]>"
        }
      ]
    });

    expect(result.ok).toBe(true);
  });

  it("rejects duplicate step ids", () => {
    const result = validateWorkflow({
      version: "0.1",
      workflow: "bad",
      steps: [
        { id: "x", op: "assert", condition: true },
        { id: "x", op: "assert", condition: true }
      ]
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("duplicate step id: x");
  });

  it("rejects unknown operations", () => {
    const result = validateWorkflow({
      version: "0.1",
      workflow: "bad",
      steps: [{ id: "x", op: "shell.exec", command: "whoami" }]
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("Invalid");
  });

  it("rejects references to later or missing steps", () => {
    const result = validateWorkflow({
      version: "0.1",
      workflow: "bad_ref",
      steps: [
        {
          id: "analysis",
          op: "agent.ask",
          agent: "debugger",
          input: { context: { $ref: "missing" } },
          saveAs: "Trusted<DebugSummary>"
        }
      ]
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("unknown reference: missing");
  });
});
