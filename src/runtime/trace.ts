export type TraceEvent = {
  kind: "step.started" | "step.completed" | "step.failed";
  stepId: string;
  at: string;
  data?: unknown;
};

export type WorkflowTrace = {
  runId: string;
  workflow: string;
  events: TraceEvent[];
};

export class TraceRecorder {
  private readonly events: TraceEvent[] = [];

  constructor(private readonly runId: string, private readonly workflow: string) {}

  started(stepId: string): void {
    this.events.push({ kind: "step.started", stepId, at: new Date().toISOString() });
  }

  completed(stepId: string, data?: unknown): void {
    this.events.push({ kind: "step.completed", stepId, at: new Date().toISOString(), data: redact(data) });
  }

  failed(stepId: string, data?: unknown): void {
    this.events.push({ kind: "step.failed", stepId, at: new Date().toISOString(), data: redact(data) });
  }

  snapshot(): WorkflowTrace {
    return { runId: this.runId, workflow: this.workflow, events: [...this.events] };
  }
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "string") return redactString(value);
  if (typeof value === "object" && value !== null) {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = isSensitiveKey(key) ? "[REDACTED]" : redact(item);
    }
    return output;
  }
  return value;
}

function isSensitiveKey(key: string): boolean {
  return /(?:secret|token|password|api[_-]?key)/i.test(key);
}

function redactString(value: string): string {
  return value.replace(/\b((?:api[_-]?key)|(?:access[_-]?token)|(?:auth[_-]?token)|token|password|secret)\s*=\s*[^\s"'&]+/gi, "$1=[REDACTED]");
}
