import type { ToolManifest } from "./toolManifest.js";

export const demoTools: ToolManifest[] = [
  {
    name: "tests.get_failures",
    description: "Read test failures from the current workspace",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
    outputTrust: "artifact",
    effectRules: [{ kind: "static", effects: ["read.tests"] }]
  },
  {
    name: "repo.apply_patch",
    description: "Preview or apply a repository patch",
    inputSchema: {
      type: "object",
      properties: {
        patch: { type: "object" },
        mode: { enum: ["dry_run", "apply"] }
      },
      required: ["patch", "mode"]
    },
    outputTrust: "trusted",
    effectRules: [
      {
        kind: "argumentEquals",
        path: "mode",
        equals: "apply",
        effects: ["read.repo", "write.repo"],
        otherwiseEffects: ["read.repo"]
      }
    ],
    requiresApproval: ["write.repo"]
  },
  {
    name: "tests.run",
    description: "Run tests in the current workspace",
    inputSchema: { type: "object", properties: { target: { type: "string" } } },
    outputTrust: "artifact",
    effectRules: [{ kind: "static", effects: ["run.tests", "read.repo"] }]
  },
  {
    name: "github.create_issue",
    description: "Create a GitHub issue",
    inputSchema: { type: "object", properties: { title: { type: "string" }, body: { type: "string" } } },
    outputTrust: "trusted",
    effectRules: [{ kind: "static", effects: ["network.github", "write.github.issues"] }],
    requiresApproval: ["write.github.issues"]
  },
  {
    name: "secrets.read_env",
    description: "Read local environment secrets",
    inputSchema: { type: "object", properties: {} },
    outputTrust: "secret",
    effectRules: [{ kind: "static", effects: ["read.secrets"] }]
  }
];
