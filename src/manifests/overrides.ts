import type { ManifestOverride, ManifestOverrides } from "../config/config.js";

export function resolveManifestOverride(overrides: ManifestOverrides, sourceId: string, toolName: string): ManifestOverride {
  const source = overrides.sources[sourceId];
  return {
    ...source?.defaults,
    ...source?.tools?.[toolName]
  };
}
