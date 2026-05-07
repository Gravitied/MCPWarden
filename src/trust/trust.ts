export type TrustLabel = "trusted" | "untrusted" | "secret" | "artifact" | "patch" | "instruction" | "agent_input";

export type TrustedValue<T = unknown> = {
  trust: TrustLabel;
  value: T;
};
