import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { validateWorkflow } from "../../src/ir/validate.js";
import { ToolRegistry } from "../../src/manifests/registry.js";
import { checkWorkflow } from "../../src/policy/checker.js";
import { fixtureTools } from "../fixtures/manifests.js";

describe("cross-tool exfiltration controls", () => {
  it("requires approval before sending artifact data to GitHub", async () => {
    const raw = JSON.parse(await readFile("examples/malicious-exfiltration.workflow.json", "utf8"));
    const validation = validateWorkflow(raw);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    const result = checkWorkflow(validation.workflow, new ToolRegistry(fixtureTools), {
      allow: ["read.tests"],
      requireApproval: ["network.github", "write.github.issues"],
      deny: ["read.secrets", "shell.exec"]
    });

    expect(result.ok).toBe(true);
    expect(result.approvals.required).toEqual(["network.github", "write.github.issues"]);
  });

  it("blocks secret references from agent inputs even if read.secrets is allowed", () => {
    const result = checkWorkflow(
      {
        version: "0.1",
        workflow: "secret_to_agent",
        steps: [
          { id: "secret", op: "tool.call", tool: "secrets.read_env", args: {}, saveAs: "SecretRef" },
          { id: "analysis", op: "agent.ask", agent: "debugger", input: { context: { $ref: "secret" } } }
        ]
      },
      new ToolRegistry(fixtureTools),
      {
        allow: ["read.secrets", "agent.debugger"],
        requireApproval: [],
        deny: []
      }
    );

    expect(result.ok).toBe(false);
    expect(result.denied.join("\n")).toContain("secret reference cannot flow into agent.ask");
  });
});
