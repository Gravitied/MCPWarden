import { bench, describe } from "vitest";
import { ToolRegistry } from "../../src/manifests/registry.js";
import { checkWorkflow } from "../../src/policy/checker.js";
import { fixtureTools } from "../fixtures/manifests.js";

describe("policy checker benchmark", () => {
  const registry = new ToolRegistry(fixtureTools);
  const workflow = {
    version: "0.1" as const,
    workflow: "large",
    steps: Array.from({ length: 100 }, (_, index) => ({
      id: `s_${index}`,
      op: "tool.call" as const,
      tool: "tests.get_failures",
      args: { limit: 1 }
    }))
  };

  bench("checks 100-step workflow", () => {
    checkWorkflow(workflow, registry, {
      allow: ["read.tests"],
      requireApproval: [],
      deny: ["read.secrets", "shell.exec"]
    });
  });
});
