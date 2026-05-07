import { describe, expect, it } from "vitest";
import { TraceRecorder } from "../../src/runtime/trace.js";

describe("trace recorder", () => {
  it("records step lifecycle with redacted values", () => {
    const trace = new TraceRecorder("run_1", "triage");
    trace.started("x");
    trace.completed("x", { secret: "should-not-appear", ok: true });

    expect(JSON.stringify(trace.snapshot())).not.toContain("should-not-appear");
    expect(trace.snapshot().events).toHaveLength(2);
  });
});
