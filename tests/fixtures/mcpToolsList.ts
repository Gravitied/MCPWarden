export const fixtureMcpToolsList = {
  tools: [
    {
      name: "tests.get_failures",
      description: "Return recent test failures",
      inputSchema: { type: "object", properties: { limit: { type: "number" } } }
    },
    {
      name: "repo.apply_patch",
      description: "Preview or apply a patch",
      inputSchema: { type: "object", properties: { mode: { enum: ["dry_run", "apply"] }, patch: { type: "object" } } }
    }
  ]
} as const;
