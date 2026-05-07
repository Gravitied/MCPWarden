export type WorkflowVersion = "0.1";

export type SaveAs =
  | `ArtifactRef<${string}>`
  | `Trusted<${string}>`
  | `Untrusted<${string}>`
  | "PatchRef"
  | "SecretRef";

export type ToolCallStep = {
  id: string;
  op: "tool.call";
  tool: string;
  args: Record<string, unknown>;
  saveAs?: SaveAs;
};

export type AgentAskStep = {
  id: string;
  op: "agent.ask";
  agent: string;
  input: Record<string, unknown>;
  saveAs?: SaveAs;
};

export type ContextCollectStep = {
  id: string;
  op: "context.collect";
  sources: Record<string, unknown>;
  saveAs?: SaveAs;
};

export type ArtifactSummarizeStep = {
  id: string;
  op: "artifact.summarize";
  artifact: unknown;
  maxItems?: number;
  saveAs?: SaveAs;
};

export type AssertStep = {
  id: string;
  op: "assert";
  condition: boolean | Record<string, unknown>;
  message?: string;
};

export type ApprovalRequireStep = {
  id: string;
  op: "approval.require";
  reason: string;
  effects: string[];
};

export type ReturnStep = {
  id: string;
  op: "return";
  value: unknown;
};

export type WorkflowStep =
  | ToolCallStep
  | AgentAskStep
  | ContextCollectStep
  | ArtifactSummarizeStep
  | AssertStep
  | ApprovalRequireStep
  | ReturnStep;

export type Workflow = {
  version: WorkflowVersion;
  workflow: string;
  steps: WorkflowStep[];
};
