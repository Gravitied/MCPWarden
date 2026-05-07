export type AgentRegistry = {
  ask(agent: string, input: Record<string, unknown>): Promise<unknown>;
};
