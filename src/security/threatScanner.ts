import type { ImportedTool } from "../adapters/toolSourceAdapter.js";
import type { ToolManifest } from "../manifests/toolManifest.js";

export type ThreatKind =
  | "tool-poisoning"
  | "schema-poisoning"
  | "tool-shadowing"
  | "unicode-obfuscation"
  | "dangerous-effect"
  | "missing-runtime-metadata";

export type ThreatFinding = {
  kind: ThreatKind;
  severity: "low" | "medium" | "high";
  sourceId?: string;
  tool?: string;
  message: string;
  evidence?: string;
};

export type ThreatScanReport = {
  risk: "low" | "medium" | "high";
  summary: {
    totalTools: number;
    totalFindings: number;
    high: number;
    medium: number;
    low: number;
  };
  findings: ThreatFinding[];
};

export function scanMcpThreats(input: { importedTools: ImportedTool[]; manifests: ToolManifest[] }): ThreatScanReport {
  const findings: ThreatFinding[] = [];
  const byName = new Map<string, ImportedTool[]>();
  for (const tool of input.importedTools) {
    const text = `${tool.name}\n${tool.description}\n${JSON.stringify(tool.inputSchema)}`;
    const list = byName.get(tool.name) ?? [];
    list.push(tool);
    byName.set(tool.name, list);

    if (/ignore (all )?(previous|prior) instructions|send (secrets?|tokens?)|exfiltrat|do not tell/i.test(text)) {
      findings.push(finding("tool-poisoning", "high", tool, "Tool metadata contains instruction-like or exfiltration language.", tool.description));
    }
    if (/[\u202A-\u202E\u2066-\u2069\u200B-\u200F]/u.test(text)) {
      findings.push(finding("unicode-obfuscation", "medium", tool, "Tool metadata contains hidden or bidirectional Unicode controls."));
    }
    if (/shell|command|exec|eval|script|token|secret|password|api[_-]?key/i.test(JSON.stringify(tool.inputSchema))) {
      findings.push(finding("schema-poisoning", "medium", tool, "Tool schema contains sensitive or command-execution shaped fields."));
    }
    if (tool.diagnostics?.some((item) => /missing outputTrust|missing effectRules/i.test(item))) {
      findings.push(finding("missing-runtime-metadata", "low", tool, "Tool is missing executable trust/effect metadata."));
    }
  }

  for (const [name, tools] of byName) {
    const sources = new Set(tools.map((tool) => tool.sourceId));
    if (sources.size > 1) {
      findings.push({
        kind: "tool-shadowing",
        severity: "high",
        tool: name,
        message: `Tool name appears in multiple sources: ${[...sources].sort().join(", ")}`
      });
    }
  }

  for (const manifest of input.manifests) {
    const effects = manifest.effectRules.flatMap((rule) => (rule.kind === "static" ? rule.effects : [...rule.effects, ...rule.otherwiseEffects]));
    if (effects.some((effect) => effect === "shell.exec" || effect === "read.secrets")) {
      findings.push({ kind: "dangerous-effect", severity: "high", tool: manifest.name, message: "Manifest grants high-risk effects." });
    }
  }

  const high = findings.filter((item) => item.severity === "high").length;
  const medium = findings.filter((item) => item.severity === "medium").length;
  const low = findings.filter((item) => item.severity === "low").length;
  return {
    risk: high > 0 ? "high" : medium > 0 ? "medium" : "low",
    summary: { totalTools: input.importedTools.length, totalFindings: findings.length, high, medium, low },
    findings
  };
}

function finding(kind: ThreatKind, severity: ThreatFinding["severity"], tool: ImportedTool, message: string, evidence?: string): ThreatFinding {
  const output: ThreatFinding = { kind, severity, sourceId: tool.sourceId, tool: tool.name, message };
  if (evidence !== undefined) output.evidence = evidence;
  return output;
}
