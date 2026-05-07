import type { Effect } from "../manifests/effects.js";

export type ApprovalPlan = {
  required: Effect[];
};

export function createApprovalPlan(effects: Effect[], approvalEffects: readonly Effect[]): ApprovalPlan {
  const required = effects.filter((effect) => approvalEffects.includes(effect));
  return { required: [...new Set(required)] };
}
