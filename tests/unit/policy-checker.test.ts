import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../../src/manifests/registry.js";
import { checkWorkflow } from "../../src/policy/checker.js";
import { fixtureTools } from "../fixtures/manifests.js";

const registry = new ToolRegistry(fixtureTools);

describe("policy checker", () => {
  it("allows a dry-run patch preview without approval", () => {
    const result = checkWorkflow(
      {
        version: "0.1",
        workflow: "preview",
        steps: [
          { id: "patch", op: "agent.ask", agent: "coder", input: { task: "patch" }, saveAs: "PatchRef" },
          { id: "preview", op: "tool.call", tool: "repo.apply_patch", args: { patch: { $ref: "patch" }, mode: "dry_run" } }
        ]
      },
      registry,
      { allow: ["agent.coder", "read.repo"], requireApproval: ["write.repo"], deny: ["read.secrets", "shell.exec"] }
    );

    expect(result.ok).toBe(true);
    expect(result.approvals.required).toEqual([]);
  });

  it("requires approval for applying a patch", () => {
    const result = checkWorkflow(
      {
        version: "0.1",
        workflow: "apply",
        steps: [
          { id: "patch", op: "agent.ask", agent: "coder", input: { task: "patch" }, saveAs: "PatchRef" },
          { id: "apply", op: "tool.call", tool: "repo.apply_patch", args: { patch: { $ref: "patch" }, mode: "apply" } }
        ]
      },
      registry,
      { allow: ["agent.coder", "read.repo"], requireApproval: ["write.repo"], deny: ["read.secrets", "shell.exec"] }
    );

    expect(result.ok).toBe(true);
    expect(result.approvals.required).toEqual(["write.repo"]);
  });

  it("denies shell execution even if a manifest exists later", () => {
    const result = checkWorkflow(
      {
        version: "0.1",
        workflow: "bad",
        steps: [{ id: "bad", op: "tool.call", tool: "shell.run", args: { command: "whoami" } }]
      },
      registry,
      { allow: ["read.repo"], requireApproval: [], deny: ["shell.exec"] }
    );

    expect(result.ok).toBe(false);
    expect(result.denied.join("\n")).toContain("unknown tool: shell.run");
  });
});
