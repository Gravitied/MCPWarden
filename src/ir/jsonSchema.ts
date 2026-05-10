export const workflowJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "MCPWarden Workflow IR",
  type: "object",
  additionalProperties: false,
  required: ["version", "workflow", "steps"],
  properties: {
    version: { const: "0.1" },
    workflow: { type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_-]*$" },
    steps: {
      type: "array",
      minItems: 1,
      maxItems: 100,
      items: { oneOf: [{ $ref: "#/$defs/toolCall" }, { $ref: "#/$defs/agentAsk" }, { $ref: "#/$defs/contextCollect" }, { $ref: "#/$defs/artifactSummarize" }, { $ref: "#/$defs/assert" }, { $ref: "#/$defs/approvalRequire" }, { $ref: "#/$defs/return" }] }
    }
  },
  $defs: {
    stepBase: {
      type: "object",
      required: ["id", "op"],
      properties: {
        id: { type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_-]*$" }
      }
    },
    saveAs: {
      type: "string",
      pattern: "^(ArtifactRef<.+>|Trusted<.+>|Untrusted<.+>|PatchRef|SecretRef)$"
    },
    ref: {
      type: "object",
      additionalProperties: false,
      required: ["$ref"],
      properties: { $ref: { type: "string" } }
    },
    toolCall: {
      allOf: [
        { $ref: "#/$defs/stepBase" },
        {
          type: "object",
          additionalProperties: false,
          required: ["id", "op", "tool", "args"],
          properties: {
            id: { type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_-]*$" },
            op: { const: "tool.call" },
            tool: { type: "string", minLength: 1 },
            args: { type: "object" },
            saveAs: { $ref: "#/$defs/saveAs" }
          }
        }
      ]
    },
    agentAsk: {
      type: "object",
      additionalProperties: false,
      required: ["id", "op", "agent", "input"],
      properties: {
        id: { type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_-]*$" },
        op: { const: "agent.ask" },
        agent: { type: "string", minLength: 1 },
        input: { type: "object" },
        saveAs: { $ref: "#/$defs/saveAs" }
      }
    },
    contextCollect: {
      type: "object",
      additionalProperties: false,
      required: ["id", "op", "sources"],
      properties: {
        id: { type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_-]*$" },
        op: { const: "context.collect" },
        sources: { type: "object" },
        saveAs: { $ref: "#/$defs/saveAs" }
      }
    },
    artifactSummarize: {
      type: "object",
      additionalProperties: false,
      required: ["id", "op", "artifact"],
      properties: {
        id: { type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_-]*$" },
        op: { const: "artifact.summarize" },
        artifact: {},
        maxItems: { type: "integer", minimum: 1, maximum: 1000 },
        saveAs: { $ref: "#/$defs/saveAs" }
      }
    },
    assert: {
      type: "object",
      additionalProperties: false,
      required: ["id", "op", "condition"],
      properties: {
        id: { type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_-]*$" },
        op: { const: "assert" },
        condition: { oneOf: [{ type: "boolean" }, { type: "object" }] },
        message: { type: "string" }
      }
    },
    approvalRequire: {
      type: "object",
      additionalProperties: false,
      required: ["id", "op", "reason", "effects"],
      properties: {
        id: { type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_-]*$" },
        op: { const: "approval.require" },
        reason: { type: "string", minLength: 1 },
        effects: { type: "array", minItems: 1, items: { type: "string" } }
      }
    },
    return: {
      type: "object",
      additionalProperties: false,
      required: ["id", "op", "value"],
      properties: {
        id: { type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_-]*$" },
        op: { const: "return" },
        value: {}
      }
    }
  }
} as const;
