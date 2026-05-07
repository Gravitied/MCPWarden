import type { AgentRegistry } from "../agents/agent.js";
import type { InMemoryArtifactStore } from "../artifacts/artifactStore.js";
import { isRefExpr } from "../ir/refs.js";
import type { Workflow } from "../ir/workflow.js";
import type { TrustLabel } from "../trust/trust.js";
import type { ToolBroker } from "./broker.js";
import { TraceRecorder, type WorkflowTrace } from "./trace.js";

export type ExecutionDeps = {
  broker: ToolBroker;
  agents: AgentRegistry;
  artifacts: InMemoryArtifactStore;
  stepTrust?: ReadonlyMap<string, TrustLabel>;
};

export type ExecutionResult =
  | { ok: true; trace: WorkflowTrace; outputs: Record<string, unknown> }
  | { ok: false; trace: WorkflowTrace; error: string; outputs: Record<string, unknown> };

export async function executeWorkflow(workflow: Workflow, deps: ExecutionDeps): Promise<ExecutionResult> {
  const trace = new TraceRecorder(`run_${Date.now()}`, workflow.workflow);
  const outputs: Record<string, unknown> = {};
  const publicOutputs: Record<string, unknown> = {};

  try {
    for (const step of workflow.steps) {
      trace.started(step.id);
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
      } else {
        output = { skipped: step.op };
      }

      if ("saveAs" in step && step.saveAs?.startsWith("ArtifactRef<")) {
        output = await deps.artifacts.put(step.saveAs.slice("ArtifactRef<".length, -1), output, "artifact");
      }

      outputs[step.id] = output;
      publicOutputs[step.id] = redactForTrust(output, deps.stepTrust?.get(step.id));
      trace.completed(step.id, publicOutputs[step.id]);
    }

    return { ok: true, trace: trace.snapshot(), outputs: publicOutputs };
  } catch (error) {
    return { ok: false, trace: trace.snapshot(), error: error instanceof Error ? error.message : String(error), outputs: publicOutputs };
  }
}

function redactForTrust(value: unknown, trust: TrustLabel | undefined): unknown {
  return trust === "secret" ? "[REDACTED]" : value;
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
