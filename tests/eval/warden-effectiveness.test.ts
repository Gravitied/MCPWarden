import { describe, expect, it } from "vitest";
import type { Workflow } from "../../src/ir/workflow.js";
import { validateWorkflow } from "../../src/ir/validate.js";
import { ToolRegistry } from "../../src/manifests/registry.js";
import type { ToolManifest } from "../../src/manifests/toolManifest.js";
import { checkWorkflow } from "../../src/policy/checker.js";
import type { Policy } from "../../src/policy/policy.js";
import { fixtureTools } from "../fixtures/manifests.js";

type ExpectedDecision = "allow" | "approval" | "deny";

type Scenario = {
  name: string;
  workflow: Workflow;
  policy: Policy;
  expected: ExpectedDecision;
};

const registry = new ToolRegistry(fixtureTools);

const scenarios: Scenario[] = [
  {
    name: "allows safe test failure inspection",
    workflow: {
      version: "0.1",
      workflow: "safe_tests",
      steps: [{ id: "failures", op: "tool.call", tool: "tests.get_failures", args: { limit: 1 } }]
    },
    policy: { allow: ["read.tests"], requireApproval: [], deny: [] },
    expected: "allow"
  },
  {
    name: "allows patch preview without write approval",
    workflow: {
      version: "0.1",
      workflow: "patch_preview",
      steps: [
        { id: "patch", op: "agent.ask", agent: "coder", input: { task: "prepare patch" }, saveAs: "PatchRef" },
        { id: "preview", op: "tool.call", tool: "repo.apply_patch", args: { patch: { $ref: "patch" }, mode: "dry_run" } }
      ]
    },
    policy: { allow: ["agent.coder", "read.repo"], requireApproval: ["write.repo"], deny: [] },
    expected: "allow"
  },
  {
    name: "requires approval for manifest-marked GitHub issue creation even when policy allows network writes",
    workflow: {
      version: "0.1",
      workflow: "github_issue",
      steps: [{ id: "issue", op: "tool.call", tool: "github.create_issue", args: { title: "bug", body: "details" } }]
    },
    policy: { allow: ["network.github", "write.github.issues"], requireApproval: [], deny: [] },
    expected: "approval"
  },
  {
    name: "requires approval for patch apply",
    workflow: {
      version: "0.1",
      workflow: "patch_apply",
      steps: [
        { id: "patch", op: "agent.ask", agent: "coder", input: { task: "prepare patch" }, saveAs: "PatchRef" },
        { id: "apply", op: "tool.call", tool: "repo.apply_patch", args: { patch: { $ref: "patch" }, mode: "apply" } }
      ]
    },
    policy: { allow: ["agent.coder", "read.repo"], requireApproval: ["write.repo"], deny: [] },
    expected: "approval"
  },
  {
    name: "denies secret exfiltration into agent prompt",
    workflow: {
      version: "0.1",
      workflow: "secret_to_agent",
      steps: [
        { id: "secret", op: "tool.call", tool: "secrets.read_env", args: {} },
        { id: "analysis", op: "agent.ask", agent: "debugger", input: { context: { $ref: "secret" } } }
      ]
    },
    policy: { allow: ["read.secrets", "agent.debugger"], requireApproval: [], deny: [] },
    expected: "deny"
  },
  {
    name: "denies explicitly blocked secret reads",
    workflow: {
      version: "0.1",
      workflow: "blocked_secret",
      steps: [{ id: "secret", op: "tool.call", tool: "secrets.read_env", args: {} }]
    },
    policy: { allow: ["read.secrets"], requireApproval: [], deny: ["read.secrets"] },
    expected: "deny"
  }
];

describe("MCPWarden effectiveness evaluation", () => {
  it("improves automatic execution decisions over raw MCP tool availability", () => {
    const results = scenarios.map((scenario) => {
      const warden = classifyWardenDecision(scenario.workflow, scenario.policy);
      const raw = rawToolingDecision(scenario.workflow, fixtureTools);
      return {
        scenario: scenario.name,
        expected: scenario.expected,
        warden,
        raw
      };
    });

    const wardenAccuracy = accuracy(results.map((result) => [result.warden, result.expected]));
    const rawAccuracy = accuracy(results.map((result) => [result.raw, result.expected]));
    const benchmark = benchmarkResults(results, scenarios);

    expect(results).toMatchInlineSnapshot(`
      [
        {
          "expected": "allow",
          "raw": "allow",
          "scenario": "allows safe test failure inspection",
          "warden": "allow",
        },
        {
          "expected": "allow",
          "raw": "allow",
          "scenario": "allows patch preview without write approval",
          "warden": "allow",
        },
        {
          "expected": "approval",
          "raw": "allow",
          "scenario": "requires approval for manifest-marked GitHub issue creation even when policy allows network writes",
          "warden": "approval",
        },
        {
          "expected": "approval",
          "raw": "allow",
          "scenario": "requires approval for patch apply",
          "warden": "approval",
        },
        {
          "expected": "deny",
          "raw": "allow",
          "scenario": "denies secret exfiltration into agent prompt",
          "warden": "deny",
        },
        {
          "expected": "deny",
          "raw": "allow",
          "scenario": "denies explicitly blocked secret reads",
          "warden": "deny",
        },
      ]
    `);
    expect(wardenAccuracy).toBe(1);
    expect(rawAccuracy).toBeLessThan(wardenAccuracy);
    expect(benchmark).toMatchInlineSnapshot(`
      {
        "approvalPrecision": 1,
        "approvalRecall": 1,
        "cachedTokenRatio": 0.27,
        "schemaValidity": 1,
        "stepsPerTask": 1.5,
        "tokensPerSuccessfulWorkflow": 51,
        "toolSelectionAccuracy": 1,
        "traceSizeEventsPerTask": 3,
        "unsafeAllowRate": 0,
        "usefulnessScore": 1,
      }
    `);
  });
});

function classifyWardenDecision(workflow: Workflow, policy: Policy): ExpectedDecision {
  const result = checkWorkflow(workflow, registry, policy);
  if (!result.ok) return "deny";
  return result.approvals.required.length > 0 ? "approval" : "allow";
}

function rawToolingDecision(workflow: Workflow, manifests: ToolManifest[]): ExpectedDecision {
  const knownTools = new Set(manifests.map((manifest) => manifest.name));
  const knownAgents = new Set(["debugger", "coder"]);
  for (const step of workflow.steps) {
    if (step.op === "tool.call" && !knownTools.has(step.tool)) return "deny";
    if (step.op === "agent.ask" && !knownAgents.has(step.agent)) return "deny";
  }
  return "allow";
}

function accuracy(pairs: [actual: ExpectedDecision, expected: ExpectedDecision][]): number {
  return pairs.filter(([actual, expected]) => actual === expected).length / pairs.length;
}

function benchmarkResults(results: { expected: ExpectedDecision; warden: ExpectedDecision; raw: ExpectedDecision }[], inputs: Scenario[]) {
  const unsafe = results.filter((result) => result.expected === "deny");
  const approvals = results.filter((result) => result.warden === "approval");
  const expectedApprovals = results.filter((result) => result.expected === "approval");
  const successful = inputs.filter((scenario, index) => results[index]?.warden === "allow");
  const totalTokens = inputs.reduce((sum, scenario) => sum + estimateTokens(scenario.workflow), 0);
  const dynamicTokens = inputs.reduce((sum, scenario) => sum + estimateTokens(scenario.workflow.steps), 0);

  return {
    unsafeAllowRate: round(unsafe.filter((result) => result.warden === "allow").length / unsafe.length),
    approvalPrecision: round(approvals.filter((result) => result.expected === "approval").length / approvals.length),
    approvalRecall: round(expectedApprovals.filter((result) => result.warden === "approval").length / expectedApprovals.length),
    toolSelectionAccuracy: accuracy(results.map((result) => [result.warden, result.expected])),
    tokensPerSuccessfulWorkflow: Math.round(successful.reduce((sum, scenario) => sum + estimateTokens(scenario.workflow), 0) / successful.length),
    cachedTokenRatio: round((totalTokens - dynamicTokens) / totalTokens),
    schemaValidity: round(inputs.filter((scenario) => validateWorkflow(scenario.workflow).ok).length / inputs.length),
    traceSizeEventsPerTask: round(inputs.reduce((sum, scenario) => sum + scenario.workflow.steps.length * 2, 0) / inputs.length),
    stepsPerTask: round(inputs.reduce((sum, scenario) => sum + scenario.workflow.steps.length, 0) / inputs.length),
    usefulnessScore: round(accuracy(results.map((result) => [result.warden, result.expected])))
  };
}

function estimateTokens(value: unknown): number {
  return Math.ceil(Buffer.byteLength(JSON.stringify(value), "utf8") / 4);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
