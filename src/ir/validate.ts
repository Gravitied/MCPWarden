import { ZodError } from "zod";
import { collectRefs } from "./refs.js";
import { workflowSchema } from "./schema.js";
import type { Workflow } from "./workflow.js";

export type ValidationResult =
  | { ok: true; workflow: Workflow; errors: [] }
  | { ok: false; errors: string[] };

export function validateWorkflow(input: unknown): ValidationResult {
  try {
    const workflow = workflowSchema.parse(input) as Workflow;
    const errors = validateWorkflowSemantics(workflow);
    if (errors.length > 0) return { ok: false, errors };
    return { ok: true, workflow, errors: [] };
  } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, errors: error.issues.map((issue) => issue.message) };
    }
    return { ok: false, errors: [String(error)] };
  }
}

function validateWorkflowSemantics(workflow: Workflow): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const step of workflow.steps) {
    if (seen.has(step.id)) {
      errors.push(`duplicate step id: ${step.id}`);
    }

    for (const ref of collectRefs(step)) {
      if (!seen.has(ref)) {
        errors.push(`unknown reference: ${ref}`);
      }
    }

    seen.add(step.id);
  }

  return errors;
}
