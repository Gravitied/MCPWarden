import type { ToolBroker } from "../runtime/broker.js";

export class CompositeToolBroker implements ToolBroker {
  constructor(
    private readonly primaryTools: Set<string>,
    private readonly primary: ToolBroker,
    private readonly fallback: ToolBroker
  ) {}

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (this.primaryTools.has(name)) return this.primary.callTool(name, args);
    return this.fallback.callTool(name, args);
  }
}
