export class WorkflowExecutionError extends Error {
  constructor(message: string, readonly stepId: string) {
    super(message);
  }
}
