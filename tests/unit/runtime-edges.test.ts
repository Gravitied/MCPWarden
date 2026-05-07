import { describe, expect, it } from "vitest";
import { MockAgentRegistry } from "../../src/adapters/mockAgents.js";
import { MockToolBroker } from "../../src/adapters/mockTools.js";
import { InMemoryArtifactStore } from "../../src/artifacts/artifactStore.js";
import { isEffect } from "../../src/manifests/effects.js";
import { executeWorkflow } from "../../src/runtime/executor.js";
import { TraceRecorder } from "../../src/runtime/trace.js";
import { canFlowInto, sanitizeForInstructions } from "../../src/trust/taint.js";

describe("runtime edge coverage", () => {
  it("covers alternate mock tool and agent branches", async () => {
    const tools = new MockToolBroker();
    await expect(tools.callTool("tests.run", {})).resolves.toEqual({ passed: true, failed: 0 });
    await expect(tools.callTool("github.create_issue", {})).resolves.toMatchObject({ issueId: 123 });
    await expect(tools.callTool("unknown", {})).rejects.toThrow("unknown mock tool: unknown");

    const agents = new MockAgentRegistry();
    await expect(agents.ask("intruder", {})).rejects.toThrow("unknown mock agent: intruder");
  });

  it("covers executor non-tool operations and failure traces", async () => {
    const deps = {
      broker: new MockToolBroker(),
      agents: new MockAgentRegistry(),
      artifacts: new InMemoryArtifactStore()
    };

    const result = await executeWorkflow(
      {
        version: "0.1",
        workflow: "ops",
        steps: [
          { id: "context", op: "context.collect", sources: { path: "src" } },
          { id: "summary", op: "artifact.summarize", artifact: { $ref: "context" }, maxItems: 1 },
          { id: "ok", op: "assert", condition: true },
          { id: "done", op: "return", value: { status: { $ref: "ok" } } }
        ]
      },
      deps
    );

    expect(result.ok).toBe(true);
    expect(result.outputs.done).toEqual({ status: { asserted: true } });

    const failure = await executeWorkflow(
      {
        version: "0.1",
        workflow: "fail",
        steps: [{ id: "bad", op: "assert", condition: false, message: "nope" }]
      },
      deps
    );

    expect(failure.ok).toBe(false);
    if (!failure.ok) {
      expect(failure.error).toBe("nope");
    }
  });

  it("covers trace failure and taint helper branches", () => {
    const trace = new TraceRecorder("run_2", "fail");
    trace.failed("x", { nested: { secretToken: "hide" } });

    expect(JSON.stringify(trace.snapshot())).not.toContain("hide");
    expect(canFlowInto("trusted", "instruction")).toBe(true);
    expect(canFlowInto("patch", "agent_input")).toBe(true);
    expect(canFlowInto("artifact", "patch")).toBe(true);
    expect(() => sanitizeForInstructions({ trust: "secret", value: "hidden" })).toThrow(
      "cannot sanitize secret into instructions"
    );
  });

  it("identifies known effects", () => {
    expect(isEffect("read.repo")).toBe(true);
    expect(isEffect("made.up")).toBe(false);
  });
});
