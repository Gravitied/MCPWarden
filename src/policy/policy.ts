import type { Effect } from "../manifests/effects.js";

export type Policy = {
  allow: readonly Effect[];
  requireApproval: readonly Effect[];
  deny: readonly Effect[];
};
