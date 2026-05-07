import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../../src/manifests/registry.js";
import { checkWorkflow } from "../../src/policy/checker.js";
import { fixtureTools } from "../fixtures/manifests.js";

describe("approval bypass resistance", () => {
  it("does not let explicit approval.require downgrade inferred effects", () => {
    const result = checkWorkflow(
      {
        version: "0.1",
        workflow: "bypass",
        steps: [
          { id: "fake", op: "approval.require", reason: "Only read", effects: ["read.repo"] },
          { id: "patch", op: "agent.ask", agent: "coder", input: { task: "patch" }, saveAs: "PatchRef" },
          { id: "apply", op: "tool.call", tool: "repo.apply_patch", args: { patch: { $ref: "patch" }, mode: "apply" } }
        ]
      },
      new ToolRegistry(fixtureTools),
      { allow: ["agent.coder", "read.repo"], requireApproval: ["write.repo"], deny: ["read.secrets", "shell.exec"] }
    );

    expect(result.ok).toBe(true);
    expect(result.approvals.required).toEqual(["write.repo"]);
  });

  it("blocks missing manifests and unknown agents", () => {
    const registry = new ToolRegistry(fixtureTools);
    const missingManifest = checkWorkflow(
      { version: "0.1", workflow: "missing", steps: [{ id: "x", op: "tool.call", tool: "made.up", args: {} }] },
      registry,
      { allow: [], requireApproval: [], deny: [] }
    );
    const unknownAgent = checkWorkflow(
      { version: "0.1", workflow: "agent", steps: [{ id: "x", op: "agent.ask", agent: "intruder", input: {} }] },
      registry,
      { allow: [], requireApproval: [], deny: [] }
    );

    expect(missingManifest.ok).toBe(false);
    expect(missingManifest.denied.join("\n")).toContain("unknown tool: made.up");
    expect(unknownAgent.ok).toBe(false);
    expect(unknownAgent.denied.join("\n")).toContain("unknown agent: intruder");
  });

  it("requires approval for apply mode but not dry-run mode", () => {
    const registry = new ToolRegistry(fixtureTools);
    const policy = { allow: ["agent.coder", "read.repo"] as const, requireApproval: ["write.repo"] as const, deny: [] };
    const dryRun = checkWorkflow(
      {
        version: "0.1",
        workflow: "dry",
        steps: [
          { id: "patch", op: "agent.ask", agent: "coder", input: {}, saveAs: "PatchRef" },
          { id: "preview", op: "tool.call", tool: "repo.apply_patch", args: { patch: { $ref: "patch" }, mode: "dry_run" } }
        ]
      },
      registry,
      policy
    );
    const apply = checkWorkflow(
      {
        version: "0.1",
        workflow: "apply",
        steps: [
          { id: "patch", op: "agent.ask", agent: "coder", input: {}, saveAs: "PatchRef" },
          { id: "apply", op: "tool.call", tool: "repo.apply_patch", args: { patch: { $ref: "patch" }, mode: "apply" } }
        ]
      },
      registry,
      policy
    );

    expect(dryRun.ok).toBe(true);
    expect(dryRun.approvals.required).toEqual([]);
    expect(apply.ok).toBe(true);
    expect(apply.approvals.required).toEqual(["write.repo"]);
  });
});
