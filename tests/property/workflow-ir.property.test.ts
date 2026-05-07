import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateWorkflow } from "../../src/ir/validate.js";
import { ToolRegistry } from "../../src/manifests/registry.js";
import { checkWorkflow } from "../../src/policy/checker.js";
import { fixtureTools } from "../fixtures/manifests.js";

describe("workflow IR properties", () => {
  it("never throws on arbitrary JSON-like input", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        expect(() => validateWorkflow(value)).not.toThrow();
      }),
      { numRuns: 1000 }
    );
  });

  it("rejects workflows with duplicate ids", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }).filter((s) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s)),
        (id) => {
          const result = validateWorkflow({
            version: "0.1",
            workflow: "dup",
            steps: [
              { id, op: "assert", condition: true },
              { id, op: "assert", condition: true }
            ]
          });
          expect(result.ok).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("rejects references that point forward", () => {
    const result = validateWorkflow({
      version: "0.1",
      workflow: "future_ref",
      steps: [
        { id: "first", op: "agent.ask", agent: "debugger", input: { context: { $ref: "later" } } },
        { id: "later", op: "tool.call", tool: "tests.get_failures", args: {} }
      ]
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("unknown reference: later");
  });

  it("checks workflows deterministically", () => {
    const registry = new ToolRegistry(fixtureTools);
    const workflow = {
      version: "0.1" as const,
      workflow: "deterministic",
      steps: [{ id: "x", op: "tool.call" as const, tool: "tests.get_failures", args: {} }]
    };
    const policy = { allow: ["read.tests"] as const, requireApproval: [] as const, deny: [] };

    expect(checkWorkflow(workflow, registry, policy)).toEqual(checkWorkflow(workflow, registry, policy));
  });

  it("adding a denied effect keeps a workflow denied", () => {
    const registry = new ToolRegistry(fixtureTools);
    const workflow = {
      version: "0.1" as const,
      workflow: "denied",
      steps: [{ id: "secret", op: "tool.call" as const, tool: "secrets.read_env", args: {} }]
    };
    const result = checkWorkflow(workflow, registry, {
      allow: ["read.secrets"],
      requireApproval: [],
      deny: ["read.secrets"]
    });

    expect(result.ok).toBe(false);
  });
});
