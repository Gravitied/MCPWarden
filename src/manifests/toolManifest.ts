import type { Effect } from "./effects.js";
import type { TrustLabel } from "../trust/trust.js";

export type StaticEffectRule = {
  kind: "static";
  effects: Effect[];
};

export type ArgumentEffectRule = {
  kind: "argumentEquals";
  path: string;
  equals: unknown;
  effects: Effect[];
  otherwiseEffects: Effect[];
};

export type EffectRule = StaticEffectRule | ArgumentEffectRule;

export type ToolManifest = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputTrust: Extract<TrustLabel, "trusted" | "untrusted" | "artifact" | "patch" | "secret">;
  effectRules: EffectRule[];
  requiresApproval?: Effect[];
};
