import type { AgentRegistry } from "../agents/agent.js";

export class MockAgentRegistry implements AgentRegistry {
  async ask(agent: string, input: Record<string, unknown>): Promise<unknown> {
    if (agent === "debugger") {
      return { rootCause: "Boolean expectation is inverted", inputKeys: Object.keys(input) };
    }

    if (agent === "coder") {
      return { diff: "--- a/src/example.ts\n+++ b/src/example.ts\n@@\n-false\n+true\n" };
    }

    throw new Error(`unknown mock agent: ${agent}`);
  }
}
