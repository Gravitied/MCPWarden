import type { Effect } from "./effects.js";
import type { EffectRule } from "./toolManifest.js";
import type { ToolManifest } from "./toolManifest.js";

export type ManifestQualityAudit = {
  tool: string;
  score: number;
  checks: {
    purpose: boolean;
    args: boolean;
    output: boolean;
    sideEffects: boolean;
    examples: boolean;
    dangerNotes: boolean;
  };
  suggestions: string[];
};

export type ToolSelectionCard = {
  name: string;
  purpose: string;
  inputs: string[];
  outputTrust: ToolManifest["outputTrust"];
  effects: Effect[];
  approvalRequired: Effect[];
};

export function auditToolManifests(manifests: ToolManifest[]): ManifestQualityAudit[] {
  return manifests.map((manifest) => {
    const effects = effectsForRules(manifest.effectRules);
    const description = manifest.description.toLowerCase();
    const checks = {
      purpose: manifest.description.trim().length >= 24,
      args: inputNames(manifest.inputSchema).length > 0,
      output: Boolean(manifest.outputTrust),
      sideEffects: manifest.effectRules.length > 0,
      examples: /example|e\.g\.|for example/i.test(manifest.description),
      dangerNotes: effects.length === 0 ? false : /approval|danger|write|mutat|secret|network|shell/i.test(description)
    };
    const suggestions = suggestionsFor(checks);
    const score = Math.round((Object.values(checks).filter(Boolean).length / Object.keys(checks).length) * 100);
    return { tool: manifest.name, score, checks, suggestions };
  });
}

export function compactToolManifests(manifests: ToolManifest[]): ToolSelectionCard[] {
  return manifests.map((manifest) => ({
    name: manifest.name,
    purpose: firstSentence(manifest.description),
    inputs: inputNames(manifest.inputSchema),
    outputTrust: manifest.outputTrust,
    effects: effectsForRules(manifest.effectRules),
    approvalRequired: manifest.requiresApproval ?? []
  }));
}

function inputNames(schema: Record<string, unknown>): string[] {
  const properties = schema.properties;
  if (typeof properties === "object" && properties !== null && !Array.isArray(properties)) {
    return Object.keys(properties);
  }
  return [];
}

function effectsForRules(rules: EffectRule[]): Effect[] {
  return [...new Set(rules.flatMap((rule) => (rule.kind === "static" ? rule.effects : [...rule.effects, ...rule.otherwiseEffects])))];
}

function firstSentence(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^.*?[.!?](?:\s|$)/);
  return (match?.[0] ?? trimmed).trim();
}

function suggestionsFor(checks: ManifestQualityAudit["checks"]): string[] {
  const suggestions: string[] = [];
  if (!checks.purpose) suggestions.push("Add a specific one-sentence purpose.");
  if (!checks.args) suggestions.push("Describe input properties in the JSON schema.");
  if (!checks.output) suggestions.push("Set outputTrust.");
  if (!checks.sideEffects) suggestions.push("Declare effectRules.");
  if (!checks.examples) suggestions.push("Add a short usage example.");
  if (!checks.dangerNotes) suggestions.push("Mention approval, mutation, network, shell, or secret risks when relevant.");
  return suggestions;
}
