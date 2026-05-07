import { describe, expect, it } from "vitest";
import { runWorkflowPayload } from "../../src/service/workflowHandlers.js";

describe("secret output redaction", () => {
  it("does not return or trace secret tool outputs", async () => {
    const result = await runWorkflowPayload(
      {
        version: "0.1",
        workflow: "secret_output",
        steps: [
          { id: "secret", op: "tool.call", tool: "secrets.read_env", args: {} },
          { id: "returned", op: "return", value: { $ref: "secret" } }
        ]
      },
      {
        config: { service: { host: "127.0.0.1", port: 0 }, sources: [] },
        overrides: { sources: {} },
        policy: { allow: ["read.secrets"], requireApproval: [], deny: [] },
        broker: {
          async callTool() {
            return { token: "abc123" };
          }
        }
      }
    );

    expect(result.status).toBe(200);
    expect(JSON.stringify(result)).not.toContain("abc123");
    expect(result.outputs.secret).toEqual("[REDACTED]");
    expect(result.outputs.returned).toEqual("[REDACTED]");
  });
});
