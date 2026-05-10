import type { AgentRegistry } from "../agents/agent.js";
import type { InMemoryArtifactStore } from "../artifacts/artifactStore.js";
import type { ArtifactRef } from "../artifacts/artifactStore.js";
import { collectRefs, isRefExpr } from "../ir/refs.js";
import type { Workflow, WorkflowStep } from "../ir/workflow.js";
import type { TrustLabel } from "../trust/trust.js";
import type { ToolBroker } from "./broker.js";
import { TraceRecorder, type TraceEvent, type WorkflowTrace } from "./trace.js";

export type ExecutionDeps = {
  broker: ToolBroker;
  agents: AgentRegistry;
  artifacts: InMemoryArtifactStore;
  stepTrust?: ReadonlyMap<string, TrustLabel>;
};

export type OutputMode = "full" | "summary" | "refs";
export type TraceMode = "full" | "summary";

export type ExecutionOptions = {
  outputMode?: OutputMode;
  traceMode?: TraceMode;
  maxOutputBytes?: number;
  maxTraceEvents?: number;
  maxItems?: number;
  parallel?: boolean;
  onEvent?: (event: TraceEvent) => void;
};

export type ExecutionMetrics = {
  durationMs: number;
  outputBytes: number;
  traceEvents: number;
  tokens: {
    input: number;
    output: number;
    cached: number;
  };
  steps: {
    total: number;
    completed: number;
    failed: number;
    parallelWaves: number;
    durationsMs: Record<string, number>;
  };
};

export type WorkflowTraceSummary = {
  runId: string;
  workflow: string;
  eventCount: number;
  events: TraceEvent[];
  truncated: boolean;
};

export type ExecutionResult =
  | { ok: true; trace: WorkflowTrace | WorkflowTraceSummary; outputs: Record<string, unknown>; metrics: ExecutionMetrics }
  | { ok: false; trace: WorkflowTrace | WorkflowTraceSummary; error: string; outputs: Record<string, unknown>; metrics: ExecutionMetrics };

export async function executeWorkflow(workflow: Workflow, deps: ExecutionDeps, options: ExecutionOptions = {}): Promise<ExecutionResult> {
  const trace = new TraceRecorder(`run_${Date.now()}`, workflow.workflow);
  const outputs: Record<string, unknown> = {};
  const publicOutputs: Record<string, unknown> = {};
  const startedAt = Date.now();
  const stepDurations: Record<string, number> = {};
  let completedSteps = 0;
  let failedSteps = 0;
  let parallelWaves = 0;

  try {
    if (options.parallel) {
      for (const wave of executionWaves(workflow.steps)) {
        parallelWaves++;
        await Promise.all(wave.map((step) => runStep(step)));
      }
    } else {
      for (const step of workflow.steps) {
        parallelWaves++;
        await runStep(step);
      }
    }

    return { ok: true, trace: shapeTrace(trace.snapshot(), options), outputs: publicOutputs, metrics: metrics() };
  } catch (error) {
    return {
      ok: false,
      trace: shapeTrace(trace.snapshot(), options),
      error: error instanceof Error ? error.message : String(error),
      outputs: publicOutputs,
      metrics: metrics()
    };
  }

  async function runStep(step: WorkflowStep): Promise<void> {
    const stepStartedAt = Date.now();
    const startedEvent = trace.started(step.id);
    options.onEvent?.(startedEvent);
    try {
      let output: unknown;

      if (step.op === "tool.call") {
        output = await deps.broker.callTool(step.tool, resolveRefs(step.args, outputs));
      } else if (step.op === "agent.ask") {
        output = await deps.agents.ask(step.agent, resolveRefs(step.input, outputs));
      } else if (step.op === "assert") {
        if (step.condition !== true) throw new Error(step.message ?? `assert failed: ${step.id}`);
        output = { asserted: true };
      } else if (step.op === "return") {
        output = resolveRefs(step.value, outputs);
      } else if (step.op === "context.collect") {
        output = resolveValue(step.sources, outputs);
      } else if (step.op === "artifact.summarize") {
        output = summarize(await resolveArtifact(step.artifact), step.maxItems ?? options.maxItems ?? 10);
      } else {
        output = { skipped: step.op };
      }

      if ("saveAs" in step && step.saveAs?.startsWith("ArtifactRef<")) {
        output = await deps.artifacts.put(step.saveAs.slice("ArtifactRef<".length, -1), output, "artifact");
      }

      outputs[step.id] = output;
      publicOutputs[step.id] = await publicOutput(output, deps.stepTrust?.get(step.id), deps.artifacts, options);
      const completedEvent = trace.completed(step.id, publicOutputs[step.id]);
      options.onEvent?.(completedEvent);
      stepDurations[step.id] = Date.now() - stepStartedAt;
      completedSteps++;
    } catch (error) {
      failedSteps++;
      const failedEvent = trace.failed(step.id, { error: error instanceof Error ? error.message : String(error) });
      options.onEvent?.(failedEvent);
      throw error;
    }
  }

  async function resolveArtifact(value: unknown): Promise<unknown> {
    const resolved = resolveValue(value, outputs);
    if (isArtifactRef(resolved)) return deps.artifacts.get(resolved.id);
    return resolved;
  }

  function metrics(): ExecutionMetrics {
    const outputBytes = byteSize(publicOutputs);
    const traceEvents = trace.snapshot().events.length;
    return {
      durationMs: Date.now() - startedAt,
      outputBytes,
      traceEvents,
      tokens: {
        input: estimateTokens(workflow),
        output: estimateTokens(publicOutputs),
        cached: 0
      },
      steps: {
        total: workflow.steps.length,
        completed: completedSteps,
        failed: failedSteps,
        parallelWaves,
        durationsMs: stepDurations
      }
    };
  }
}

function redactForTrust(value: unknown, trust: TrustLabel | undefined): unknown {
  return trust === "secret" ? "[REDACTED]" : value;
}

async function publicOutput(
  value: unknown,
  trust: TrustLabel | undefined,
  artifacts: InMemoryArtifactStore,
  options: ExecutionOptions
): Promise<unknown> {
  const redacted = redactForTrust(value, trust);
  if (options.outputMode === "summary") return summarize(redacted, options.maxItems ?? 10);
  if (options.outputMode === "refs" || (options.maxOutputBytes && byteSize(redacted) > options.maxOutputBytes)) {
    if (isArtifactRef(redacted)) return redacted;
    return artifacts.put("WorkflowOutput", redacted, trust ?? "artifact");
  }
  return redacted;
}

function shapeTrace(trace: WorkflowTrace, options: ExecutionOptions): WorkflowTrace | WorkflowTraceSummary {
  const maxEvents = options.maxTraceEvents;
  if (options.traceMode !== "summary" && !maxEvents) return trace;
  const events = maxEvents ? trace.events.slice(-maxEvents) : [];
  return {
    runId: trace.runId,
    workflow: trace.workflow,
    eventCount: trace.events.length,
    events,
    truncated: events.length < trace.events.length
  };
}

function executionWaves(steps: WorkflowStep[]): WorkflowStep[][] {
  const remaining = new Map(steps.map((step) => [step.id, step]));
  const completed = new Set<string>();
  const waves: WorkflowStep[][] = [];

  while (remaining.size > 0) {
    const ready = [...remaining.values()].filter((step) => refsForStep(step).every((ref) => completed.has(ref)));
    if (ready.length === 0) {
      throw new Error(`workflow has unresolved or cyclic references: ${[...remaining.keys()].join(",")}`);
    }
    waves.push(ready);
    for (const step of ready) {
      remaining.delete(step.id);
      completed.add(step.id);
    }
  }

  return waves;
}

function refsForStep(step: WorkflowStep): string[] {
  if (step.op === "tool.call") return collectRefs(step.args);
  if (step.op === "agent.ask") return collectRefs(step.input);
  if (step.op === "return") return collectRefs(step.value);
  if (step.op === "context.collect") return collectRefs(step.sources);
  if (step.op === "artifact.summarize") return collectRefs(step.artifact);
  return [];
}

function resolveRefs(value: unknown, outputs: Record<string, unknown>): Record<string, unknown> {
  const resolved = resolveValue(value, outputs);
  if (typeof resolved === "object" && resolved !== null && !Array.isArray(resolved)) {
    return resolved as Record<string, unknown>;
  }
  return { value: resolved };
}

function resolveValue(value: unknown, outputs: Record<string, unknown>): unknown {
  if (isRefExpr(value)) return outputs[value.$ref];
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, outputs));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveValue(item, outputs)]));
  }
  return value;
}

function summarize(value: unknown, maxItems: number): unknown {
  if (isArtifactRef(value)) return value;
  if (Array.isArray(value)) {
    return { kind: "array", length: value.length, items: value.slice(0, maxItems).map((item) => summarize(item, maxItems)), omittedItems: Math.max(0, value.length - maxItems) };
  }
  if (typeof value === "string") {
    const maxChars = Math.max(40, maxItems * 80);
    return value.length > maxChars ? { kind: "string", length: value.length, preview: value.slice(0, maxChars), truncated: true } : value;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value);
    const kept = entries.slice(0, maxItems);
    return {
      kind: "object",
      keys: kept.map(([key]) => key),
      omittedKeys: Math.max(0, entries.length - kept.length),
      values: Object.fromEntries(kept.map(([key, item]) => [key, summarize(item, maxItems)]))
    };
  }
  return value;
}

function isArtifactRef(value: unknown): value is ArtifactRef {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof (value as { id: unknown }).id === "string" &&
    "sizeBytes" in value
  );
}

function byteSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function estimateTokens(value: unknown): number {
  return Math.ceil(byteSize(value) / 4);
}
