import type { TrustLabel, TrustedValue } from "./trust.js";

export function canFlowInto(from: TrustLabel, to: TrustLabel): boolean {
  if (from === "secret") return false;
  if (to === "instruction") return from === "trusted" || from === "instruction";
  if (to === "agent_input") return true;
  return true;
}

export function sanitizeForInstructions(input: TrustedValue<string>): TrustedValue<string> {
  if (input.trust === "secret") {
    throw new Error("cannot sanitize secret into instructions");
  }

  return {
    trust: "trusted",
    value: `Sanitized untrusted content for analysis only:\n${input.value}`
  };
}
