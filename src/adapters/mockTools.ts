import type { ToolBroker } from "../runtime/broker.js";

export class MockToolBroker implements ToolBroker {
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (name === "tests.get_failures") {
      const limit = typeof args.limit === "number" ? args.limit : 2;
      return Array.from({ length: limit }, (_, index) => ({
        test: `test_${index}`,
        message: "Expected true to equal false"
      }));
    }

    if (name === "repo.apply_patch") {
      return { clean: true, mode: args.mode, changedFiles: args.mode === "apply" ? ["src/example.ts"] : [] };
    }

    if (name === "tests.run") {
      return { passed: true, failed: 0 };
    }

    if (name === "github.create_issue") {
      return { issueId: 123, url: "https://github.example/issues/123" };
    }

    throw new Error(`unknown mock tool: ${name}`);
  }
}
