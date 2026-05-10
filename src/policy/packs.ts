import type { Policy } from "./policy.js";

export type PolicyPack = {
  name: string;
  description: string;
  policy: Policy;
};

export const policyPacks: Record<string, PolicyPack> = {
  "local-dev": {
    name: "local-dev",
    description: "Local development profile with read/test effects allowed and writes approval-gated.",
    policy: {
      allow: ["read.tests", "read.repo", "agent.debugger", "agent.coder", "run.tests"],
      requireApproval: ["write.repo", "write.github.issues"],
      deny: ["read.secrets", "shell.exec"]
    }
  },
  "ci-readonly": {
    name: "ci-readonly",
    description: "CI profile for checking and inspecting without mutations.",
    policy: {
      allow: ["read.tests", "read.repo", "run.tests"],
      requireApproval: [],
      deny: ["write.repo", "write.github.issues", "read.secrets", "shell.exec"]
    }
  },
  "repo-writer": {
    name: "repo-writer",
    description: "Repository automation profile that approval-gates writes and blocks secrets/shell.",
    policy: {
      allow: ["read.tests", "read.repo", "agent.debugger", "agent.coder", "run.tests"],
      requireApproval: ["write.repo", "write.github.issues"],
      deny: ["read.secrets", "shell.exec"]
    }
  },
  "enterprise-strict": {
    name: "enterprise-strict",
    description: "Strict profile for enterprise review with only read-only effects allowed by default.",
    policy: {
      allow: ["read.tests", "read.repo"],
      requireApproval: ["agent.debugger", "agent.coder", "run.tests", "write.repo", "write.github.issues"],
      deny: ["read.secrets", "shell.exec"]
    }
  },
  "owasp-mcp-top10": {
    name: "owasp-mcp-top10",
    description: "OWASP MCP-oriented profile that blocks secrets and shell while approval-gating all agency and writes.",
    policy: {
      allow: ["read.tests", "read.repo"],
      requireApproval: ["agent.debugger", "agent.coder", "run.tests", "write.repo", "write.github.issues"],
      deny: ["read.secrets", "shell.exec"]
    }
  }
};

export function policyPackNames(): string[] {
  return Object.keys(policyPacks).sort();
}

export function resolvePolicyPack(name: string): PolicyPack {
  const pack = policyPacks[name];
  if (!pack) throw new Error(`unknown policy profile: ${name}`);
  return pack;
}
