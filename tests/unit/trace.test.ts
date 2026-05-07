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

  it("redacts key-value API keys inside string output", () => {
    const trace = new TraceRecorder("run_2", "triage");
    trace.completed("x", { log: "apiKey=abc123456789" });

    const snapshot = JSON.stringify(trace.snapshot());
    expect(snapshot).not.toContain("abc123456789");
    expect(snapshot).toContain("apiKey=[REDACTED]");
  });
});
