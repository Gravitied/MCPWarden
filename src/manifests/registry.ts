import type { Effect } from "./effects.js";
import type { EffectRule, ToolManifest } from "./toolManifest.js";

export class ToolRegistry {
  private readonly tools: Map<string, ToolManifest>;

  constructor(tools: ToolManifest[]) {
    this.tools = new Map(tools.map((tool) => [tool.name, tool]));
  }

  getTool(name: string): ToolManifest {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`unknown tool: ${name}`);
    return tool;
  }

  effectsForToolCall(name: string, args: Record<string, unknown>): Effect[] {
    const tool = this.getTool(name);
    const effects = new Set<Effect>();

    for (const rule of tool.effectRules) {
      for (const effect of applyRule(rule, args)) {
        effects.add(effect);
      }
    }

    return [...effects];
  }
}

function applyRule(rule: EffectRule, args: Record<string, unknown>): Effect[] {
  if (rule.kind === "static") return rule.effects;
  return Object.is(valueAtPath(args, rule.path), rule.equals) ? rule.effects : rule.otherwiseEffects;
}

function valueAtPath(value: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (typeof current !== "object" || current === null) return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}
