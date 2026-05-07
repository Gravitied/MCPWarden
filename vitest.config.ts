import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      all: false,
      include: ["src/**/*.ts"],
      exclude: [
        "src/cli.ts",
        "src/agents/agent.ts",
        "src/ir/workflow.ts",
        "src/manifests/toolManifest.ts",
        "src/policy/policy.ts",
        "src/runtime/broker.ts",
        "src/runtime/errors.ts",
        "src/trust/trust.ts"
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90
      }
    }
  }
});
