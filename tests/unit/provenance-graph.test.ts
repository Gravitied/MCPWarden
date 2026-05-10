import { describe, expect, it } from "vitest";
import { buildProvenanceGraph, renderProvenanceMermaid } from "../../src/provenance/graph.js";
import type { Workflow } from "../../src/ir/workflow.js";

describe("provenance graph", () => {
  it("extracts workflow dataflow edges and renders mermaid", () => {
    const workflow: Workflow = {
      version: "0.1",
      workflow: "prov",
      steps: [
        { id: "a", op: "tool.call", tool: "tests.get_failures", args: {} },
        { id: "b", op: "agent.ask", agent: "debugger", input: { context: { $ref: "a" } } },
        { id: "done", op: "return", value: { $ref: "b" } }
      ]
    };
    const graph = buildProvenanceGraph(workflow);
    expect(graph.edges).toEqual([
      { from: "a", to: "b", reason: "reference" },
      { from: "b", to: "done", reason: "reference" }
    ]);
    expect(renderProvenanceMermaid(graph)).toContain('"a" -->|"reference"| "b"');
  });
});
