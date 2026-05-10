import { describe, expect, it } from "vitest";
import { workflowJsonSchema } from "../../src/ir/jsonSchema.js";

describe("workflow JSON schema", () => {
  it("publishes a strict schema for model structured outputs", () => {
    expect(workflowJsonSchema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "MCPWarden Workflow IR",
      type: "object",
      required: ["version", "workflow", "steps"],
      additionalProperties: false
    });
    expect(JSON.stringify(workflowJsonSchema)).toContain("tool.call");
    expect(JSON.stringify(workflowJsonSchema)).toContain("artifact.summarize");
  });
});
