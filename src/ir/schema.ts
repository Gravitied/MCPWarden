import { z } from "zod";

const saveAsSchema = z.string().regex(/^(ArtifactRef<.+>|Trusted<.+>|Untrusted<.+>|PatchRef|SecretRef)$/);

const baseStep = {
  id: z.string().regex(/^[A-Za-z_][A-Za-z0-9_-]*$/)
};

export const workflowStepSchema = z.discriminatedUnion("op", [
  z.object({
    ...baseStep,
    op: z.literal("tool.call"),
    tool: z.string().min(1),
    args: z.record(z.string(), z.unknown()),
    saveAs: saveAsSchema.optional()
  }),
  z.object({
    ...baseStep,
    op: z.literal("agent.ask"),
    agent: z.string().min(1),
    input: z.record(z.string(), z.unknown()),
    saveAs: saveAsSchema.optional()
  }),
  z.object({
    ...baseStep,
    op: z.literal("context.collect"),
    sources: z.record(z.string(), z.unknown()),
    saveAs: saveAsSchema.optional()
  }),
  z.object({
    ...baseStep,
    op: z.literal("artifact.summarize"),
    artifact: z.unknown(),
    maxItems: z.number().int().positive().max(1000).optional(),
    saveAs: saveAsSchema.optional()
  }),
  z.object({
    ...baseStep,
    op: z.literal("assert"),
    condition: z.union([z.boolean(), z.record(z.string(), z.unknown())]),
    message: z.string().optional()
  }),
  z.object({
    ...baseStep,
    op: z.literal("approval.require"),
    reason: z.string().min(1),
    effects: z.array(z.string()).min(1)
  }),
  z.object({
    ...baseStep,
    op: z.literal("return"),
    value: z.unknown()
  })
]);

export const workflowSchema = z.object({
  version: z.literal("0.1"),
  workflow: z.string().regex(/^[A-Za-z_][A-Za-z0-9_-]*$/),
  steps: z.array(workflowStepSchema).min(1).max(100)
});
