import { collectRefs } from "../ir/refs.js";
import type { Workflow, WorkflowStep } from "../ir/workflow.js";

export type ProvenanceNode = {
  id: string;
  op: WorkflowStep["op"];
  label: string;
};

export type ProvenanceEdge = {
  from: string;
  to: string;
  reason: "reference";
};

export type ProvenanceGraph = {
  workflow: string;
  nodes: ProvenanceNode[];
  edges: ProvenanceEdge[];
};

export function buildProvenanceGraph(workflow: Workflow): ProvenanceGraph {
  const nodes = workflow.steps.map((step) => ({ id: step.id, op: step.op, label: labelForStep(step) }));
  const edges = workflow.steps.flatMap((step) => refsForStep(step).map((ref) => ({ from: ref, to: step.id, reason: "reference" as const })));
  return { workflow: workflow.workflow, nodes, edges };
}

export function renderProvenanceMermaid(graph: ProvenanceGraph): string {
  const lines = ["flowchart LR"];
  for (const node of graph.nodes) lines.push(`  "${node.id}"["${escapeLabel(node.label)}"]`);
  for (const edge of graph.edges) lines.push(`  "${edge.from}" -->|"${edge.reason}"| "${edge.to}"`);
  return lines.join("\n");
}

function refsForStep(step: WorkflowStep): string[] {
  if (step.op === "tool.call") return collectRefs(step.args);
  if (step.op === "agent.ask") return collectRefs(step.input);
  if (step.op === "return") return collectRefs(step.value);
  if (step.op === "context.collect") return collectRefs(step.sources);
  if (step.op === "artifact.summarize") return collectRefs(step.artifact);
  return [];
}

function labelForStep(step: WorkflowStep): string {
  if (step.op === "tool.call") return `${step.id}\\n${step.tool}`;
  if (step.op === "agent.ask") return `${step.id}\\n${step.agent}`;
  return `${step.id}\\n${step.op}`;
}

function escapeLabel(label: string): string {
  return label.replace(/"/g, '\\"');
}
