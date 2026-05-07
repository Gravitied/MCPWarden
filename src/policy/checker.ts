import type { Workflow } from "../ir/workflow.js";
import { collectRefs } from "../ir/refs.js";
import type { Effect } from "../manifests/effects.js";
import type { ToolRegistry } from "../manifests/registry.js";
import type { TrustLabel } from "../trust/trust.js";
import { createApprovalPlan, type ApprovalPlan } from "./approvalPlan.js";
import type { Policy } from "./policy.js";

export type CheckResult =
  | { ok: true; effects: Effect[]; approvals: ApprovalPlan; denied: [] }
  | { ok: false; effects: Effect[]; approvals: ApprovalPlan; denied: string[] };

export function checkWorkflow(workflow: Workflow, registry: ToolRegistry, policy: Policy): CheckResult {
  const effects: Effect[] = [];
  const denied: string[] = [];
  const savedTrust = new Map<string, TrustLabel>();

  for (const step of workflow.steps) {
    try {
      if (step.op === "tool.call") {
        effects.push(...registry.effectsForToolCall(step.tool, step.args));
        savedTrust.set(step.id, trustForSaveAs(step.saveAs) ?? registry.getTool(step.tool).outputTrust);
      } else if (step.op === "agent.ask") {
        for (const ref of collectRefs(step.input)) {
          if (savedTrust.get(ref) === "secret") {
            denied.push(`secret reference cannot flow into agent.ask: ${ref}`);
          }
        }
        effects.push(agentEffect(step.agent));
        savedTrust.set(step.id, trustForSaveAs(step.saveAs) ?? "trusted");
      } else if ("saveAs" in step && step.saveAs) {
        savedTrust.set(step.id, trustForSaveAs(step.saveAs) ?? "trusted");
      }
    } catch (error) {
      denied.push(error instanceof Error ? error.message : String(error));
    }
  }

  const uniqueEffects = [...new Set(effects)];
  for (const effect of uniqueEffects) {
    if (policy.deny.includes(effect)) denied.push(`denied effect: ${effect}`);
    if (!policy.allow.includes(effect) && !policy.requireApproval.includes(effect)) {
      denied.push(`effect neither allowed nor approvable: ${effect}`);
    }
  }

  const approvals = createApprovalPlan(uniqueEffects, policy.requireApproval);
  return denied.length > 0
    ? { ok: false, effects: uniqueEffects, approvals, denied }
    : { ok: true, effects: uniqueEffects, approvals, denied: [] };
}

function agentEffect(agent: string): Effect {
  if (agent === "debugger") return "agent.debugger";
  if (agent === "coder") return "agent.coder";
  throw new Error(`unknown agent: ${agent}`);
}

function trustForSaveAs(saveAs: string | undefined): TrustLabel | undefined {
  if (!saveAs) return undefined;
  if (saveAs.startsWith("ArtifactRef<")) return "artifact";
  if (saveAs.startsWith("Trusted<")) return "trusted";
  if (saveAs.startsWith("Untrusted<")) return "untrusted";
  if (saveAs === "PatchRef") return "patch";
  if (saveAs === "SecretRef") return "secret";
  return undefined;
}
