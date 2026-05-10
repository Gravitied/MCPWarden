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
    expect(result.metrics.steps.completed).toBe(4);
    expect(result.metrics.traceEvents).toBe(8);
    expect(result.metrics.tokens.output).toBeGreaterThan(0);
  });

  it("returns concise summaries and artifact refs for large public outputs", async () => {
    const artifacts = new InMemoryArtifactStore();
    const result = await executeWorkflow(
      {
        version: "0.1",
        workflow: "large_output",
        steps: [{ id: "large", op: "tool.call", tool: "tests.get_failures", args: { limit: 20 } }]
      },
      {
        broker: {
          async callTool() {
            return { rows: Array.from({ length: 20 }, (_, index) => ({ index, detail: "x".repeat(40) })) };
          }
        },
        agents: new MockAgentRegistry(),
        artifacts
      },
      { outputMode: "refs", traceMode: "summary", maxOutputBytes: 120, maxTraceEvents: 1 }
    );

    expect(result.ok).toBe(true);
    expect(result.outputs.large).toMatchObject({ id: expect.stringMatching(/^art_/), type: "WorkflowOutput", sizeBytes: expect.any(Number) });
    expect(result.trace).toMatchObject({ workflow: "large_output", eventCount: 2, truncated: true });
    expect(result.metrics.outputBytes).toBeGreaterThan(0);
  });

  it("runs independent steps in parallel when requested", async () => {
    const started: string[] = [];
    const result = await executeWorkflow(
      {
        version: "0.1",
        workflow: "parallel",
        steps: [
          { id: "a", op: "tool.call", tool: "tests.get_failures", args: { label: "a" } },
          { id: "b", op: "tool.call", tool: "tests.get_failures", args: { label: "b" } },
          { id: "joined", op: "return", value: { a: { $ref: "a" }, b: { $ref: "b" } } }
        ]
      },
      {
        broker: {
          async callTool(_name, args) {
            started.push(String(args.label));
            await new Promise((resolve) => setTimeout(resolve, 25));
            return args;
          }
        },
        agents: new MockAgentRegistry(),
        artifacts: new InMemoryArtifactStore()
      },
      { parallel: true }
    );

    expect(result.ok).toBe(true);
    expect(started.sort()).toEqual(["a", "b"]);
    expect(result.metrics.steps.completed).toBe(3);
    expect(result.metrics.steps.parallelWaves).toBeGreaterThan(1);
  });

  it("collects context and summarizes artifacts", async () => {
    const artifacts = new InMemoryArtifactStore();
    const result = await executeWorkflow(
      {
        version: "0.1",
        workflow: "context_summary",
        steps: [
          {
            id: "context",
            op: "context.collect",
            sources: { files: ["README.md", "docs/workflow-ir.md"], request: { goal: "summarize" } },
            saveAs: "ArtifactRef<ContextBundle>"
          },
          { id: "summary", op: "artifact.summarize", artifact: { $ref: "context" }, maxItems: 1 }
        ]
      },
      {
        broker: new MockToolBroker(),
        agents: new MockAgentRegistry(),
        artifacts
      }
    );

    expect(result.ok).toBe(true);
    expect(result.outputs.context).toMatchObject({ id: expect.stringMatching(/^art_/), type: "ContextBundle" });
    expect(result.outputs.summary).toMatchObject({ kind: "object", keys: ["files"], omittedKeys: 1 });
  });
});
