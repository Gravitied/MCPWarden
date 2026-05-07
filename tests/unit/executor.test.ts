import { describe, expect, it } from "vitest";
import { InMemoryArtifactStore } from "../../src/artifacts/artifactStore.js";
import { MockAgentRegistry } from "../../src/adapters/mockAgents.js";
import { MockToolBroker } from "../../src/adapters/mockTools.js";
import { executeWorkflow } from "../../src/runtime/executor.js";

describe("workflow executor", () => {
  it("executes a dry-run triage workflow and returns compact outputs", async () => {
    const result = await executeWorkflow(
      {
        version: "0.1",
        workflow: "triage",
        steps: [
          { id: "failures", op: "tool.call", tool: "tests.get_failures", args: { limit: 2 }, saveAs: "ArtifactRef<TestFailure[]>" },
          { id: "analysis", op: "agent.ask", agent: "debugger", input: { context: { $ref: "failures" } }, saveAs: "Trusted<DebugSummary>" },
          { id: "patch", op: "agent.ask", agent: "coder", input: { analysis: { $ref: "analysis" } }, saveAs: "PatchRef" },
          { id: "preview", op: "tool.call", tool: "repo.apply_patch", args: { patch: { $ref: "patch" }, mode: "dry_run" } }
        ]
      },
      {
        broker: new MockToolBroker(),
        agents: new MockAgentRegistry(),
        artifacts: new InMemoryArtifactStore()
      }
    );

    expect(result.ok).toBe(true);
    expect(result.trace.events.map((event) => event.kind)).toEqual([
      "step.started",
      "step.completed",
      "step.started",
      "step.completed",
      "step.started",
      "step.completed",
      "step.started",
      "step.completed"
    ]);
  });
});
