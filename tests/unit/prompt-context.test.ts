import { describe, expect, it } from "vitest";
import { buildPromptContext } from "../../src/context/promptContext.js";
import { workflowJsonSchema } from "../../src/ir/jsonSchema.js";
import { fixtureTools } from "../fixtures/manifests.js";

describe("prompt context builder", () => {
  it("places cache-stable policy, schema, and tool summaries before dynamic state", () => {
    const context = buildPromptContext({
      systemContract: "Generate safe MCPWarden workflows.",
      policy: { allow: ["read.tests"], requireApproval: ["write.repo"], deny: ["read.secrets"] },
      workflowSchema: workflowJsonSchema,
      toolManifests: fixtureTools,
      dynamicState: { request: "triage failing tests", latestOutput: "dynamic" }
    });

    expect(context.sections.map((section) => section.name)).toEqual([
      "system",
      "policy",
      "workflow_schema",
      "tool_selection_cards",
      "dynamic_state"
    ]);
    expect(context.cacheableText.indexOf("Generate safe MCPWarden workflows.")).toBeLessThan(
      context.cacheableText.indexOf("tool_selection_cards")
    );
    expect(context.dynamicText).toContain("triage failing tests");
    expect(context.metrics.cacheableTokens).toBeGreaterThan(context.metrics.dynamicTokens);
  });
});
