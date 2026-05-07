import { MockAgentRegistry } from "../adapters/mockAgents.js";
import { MockToolBroker } from "../adapters/mockTools.js";
import { InMemoryArtifactStore } from "../artifacts/artifactStore.js";
import type { McpwConfig, ManifestOverrides } from "../config/config.js";
import { validateWorkflow } from "../ir/validate.js";
import { demoTools } from "../manifests/demoManifests.js";
import { buildUniversalToolRegistry } from "../manifests/universalRegistry.js";
import { checkWorkflow } from "../policy/checker.js";
import type { Policy } from "../policy/policy.js";
import type { ToolBroker } from "../runtime/broker.js";
import { executeWorkflow } from "../runtime/executor.js";

export type WorkflowOperationDeps = {
  config: McpwConfig;
  overrides: ManifestOverrides;
  policy: Policy;
  broker?: ToolBroker;
};

export async function checkWorkflowPayload(payload: unknown, deps: WorkflowOperationDeps) {
  const validation = validateWorkflow(payload);
  if (!validation.ok) return { ok: false as const, status: 400, code: "WORKFLOW_INVALID", message: validation.errors.join("\n") };

  const registryResult = await buildUniversalToolRegistry({
    builtInTools: demoTools,
    sources: deps.config.sources,
    overrides: deps.overrides
  });
  const result = checkWorkflow(validation.workflow, registryResult.registry, deps.policy);
  if (result.denied.length > 0) {
    return { ok: false as const, status: 403, code: "POLICY_DENIED", message: result.denied.join("\n") };
  }

  return {
    ok: true as const,
    status: 200,
    workflow: validation.workflow.workflow,
    effects: result.effects,
    approvals: result.approvals,
    diagnostics: registryResult.diagnostics
  };
}

export async function runWorkflowPayload(payload: unknown, deps: WorkflowOperationDeps) {
  const checked = await checkWorkflowPayload(payload, deps);
  if (!checked.ok) return checked;
  if (checked.approvals.required.length > 0) {
    return {
      ok: false as const,
      status: 403,
      code: "APPROVAL_REQUIRED",
      message: `approval required: ${checked.approvals.required.join(",")}`
    };
  }

  const validation = validateWorkflow(payload);
  if (!validation.ok) return { ok: false as const, status: 400, code: "WORKFLOW_INVALID", message: validation.errors.join("\n") };

  const result = await executeWorkflow(validation.workflow, {
    broker: deps.broker ?? new MockToolBroker(),
    agents: new MockAgentRegistry(),
    artifacts: new InMemoryArtifactStore()
  });

  return { status: result.ok ? 200 : 500, ...result };
}

export function mapImportedToolsToSources(importedTools: { name: string; sourceId: string }[]): Map<string, string> {
  return new Map(importedTools.map((tool) => [tool.name, tool.sourceId]));
}
