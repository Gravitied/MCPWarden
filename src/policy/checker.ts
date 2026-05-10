import type { Workflow } from "../ir/workflow.js";
import { collectRefs } from "../ir/refs.js";
import type { Effect } from "../manifests/effects.js";
import type { ToolRegistry } from "../manifests/registry.js";
import type { TrustLabel } from "../trust/trust.js";
import { createApprovalPlan, type ApprovalPlan } from "./approvalPlan.js";
import type { Policy } from "./policy.js";

export type CheckResult =
  | { ok: true; effects: Effect[]; approvals: ApprovalPlan; denied: []; stepTrust: Map<string, TrustLabel> }
  | { ok: false; effects: Effect[]; approvals: ApprovalPlan; denied: string[]; stepTrust: Map<string, TrustLabel> };

export function checkWorkflow(workflow: Workflow, registry: ToolRegistry, policy: Policy): CheckResult {
  const effects: Effect[] = [];
  const denied: string[] = [];
  const savedTrust = new Map<string, TrustLabel>();
  const manifestApprovalEffects = new Set<Effect>();

  for (const step of workflow.steps) {
    try {
      if (step.op === "tool.call") {
        const tool = registry.getTool(step.tool);
        const stepEffects = registry.effectsForToolCall(step.tool, step.args);
        effects.push(...stepEffects);
        for (const effect of tool.requiresApproval ?? []) {
          if (stepEffects.includes(effect)) manifestApprovalEffects.add(effect);
        }
        savedTrust.set(step.id, toolCallTrust(tool.outputTrust, step.saveAs, step.id, denied));
      } else if (step.op === "agent.ask") {
        for (const ref of collectRefs(step.input)) {
          if (savedTrust.get(ref) === "secret") {
            denied.push(`secret reference cannot flow into agent.ask: ${ref}`);
          }
          if (savedTrust.get(ref) === "untrusted") {
            denied.push(`untrusted reference cannot flow into agent.ask: ${ref}`);
          }
        }
        effects.push(agentEffect(step.agent));
        savedTrust.set(step.id, trustForSaveAs(step.saveAs) ?? "trusted");
      } else if (step.op === "return") {
        savedTrust.set(step.id, trustFromRefs(collectRefs(step.value), savedTrust));
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

  const approvals = createApprovalPlan(uniqueEffects, [...policy.requireApproval, ...manifestApprovalEffects]);
  return denied.length > 0
    ? { ok: false, effects: uniqueEffects, approvals, denied, stepTrust: savedTrust }
    : { ok: true, effects: uniqueEffects, approvals, denied: [], stepTrust: savedTrust };
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

function toolCallTrust(manifestTrust: TrustLabel, saveAs: string | undefined, stepId: string, denied: string[]): TrustLabel {
  const requestedTrust = trustForSaveAs(saveAs);
  if (!requestedTrust) return manifestTrust;

  if (isTrustUpgrade(manifestTrust, requestedTrust)) {
    denied.push(`workflow cannot upgrade trust for ${stepId}: ${manifestTrust} -> ${requestedTrust}`);
  }

  return moreRestrictiveTrust(manifestTrust, requestedTrust);
}

function isTrustUpgrade(from: TrustLabel, to: TrustLabel): boolean {
  if (from === to) return false;
  if (from === "secret") return to !== "secret";
  if (from === "untrusted") return to === "trusted" || to === "instruction";
  if (from === "artifact" || from === "patch") return to === "trusted" || to === "instruction";
  return false;
}

function moreRestrictiveTrust(left: TrustLabel, right: TrustLabel): TrustLabel {
  const order: TrustLabel[] = ["trusted", "instruction", "agent_input", "artifact", "patch", "untrusted", "secret"];
  return order.indexOf(left) >= order.indexOf(right) ? left : right;
}

function trustFromRefs(refs: string[], savedTrust: Map<string, TrustLabel>): TrustLabel {
  let trust: TrustLabel = "trusted";
  for (const ref of refs) {
    trust = moreRestrictiveTrust(trust, savedTrust.get(ref) ?? "trusted");
  }
  return trust;
}
