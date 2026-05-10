import type { Policy } from "../policy/policy.js";
import type { ToolManifest } from "../manifests/toolManifest.js";
import { compactToolManifests, type ToolSelectionCard } from "../manifests/quality.js";

export type PromptContextSection = {
  name: "system" | "policy" | "workflow_schema" | "tool_selection_cards" | "dynamic_state";
  cacheable: boolean;
  content: unknown;
};

export type PromptContextInput = {
  systemContract: string;
  policy: Policy;
  workflowSchema: unknown;
  toolManifests: ToolManifest[];
  dynamicState?: unknown;
};

export type PromptContext = {
  sections: PromptContextSection[];
  cacheableText: string;
  dynamicText: string;
  text: string;
  toolSelectionCards: ToolSelectionCard[];
  metrics: {
    cacheableTokens: number;
    dynamicTokens: number;
    totalTokens: number;
  };
};

export function buildPromptContext(input: PromptContextInput): PromptContext {
  const toolSelectionCards = compactToolManifests(input.toolManifests);
  const sections: PromptContextSection[] = [
    { name: "system", cacheable: true, content: input.systemContract },
    { name: "policy", cacheable: true, content: input.policy },
    { name: "workflow_schema", cacheable: true, content: input.workflowSchema },
    { name: "tool_selection_cards", cacheable: true, content: toolSelectionCards },
    { name: "dynamic_state", cacheable: false, content: input.dynamicState ?? {} }
  ];
  const cacheableText = renderSections(sections.filter((section) => section.cacheable));
  const dynamicText = renderSections(sections.filter((section) => !section.cacheable));
  const text = `${cacheableText}\n\n${dynamicText}`;
  const cacheableTokens = estimateTokens(cacheableText);
  const dynamicTokens = estimateTokens(dynamicText);

  return {
    sections,
    cacheableText,
    dynamicText,
    text,
    toolSelectionCards,
    metrics: {
      cacheableTokens,
      dynamicTokens,
      totalTokens: cacheableTokens + dynamicTokens
    }
  };
}

function renderSections(sections: PromptContextSection[]): string {
  return sections.map((section) => `<${section.name}>\n${renderContent(section.content)}\n</${section.name}>`).join("\n\n");
}

function renderContent(content: unknown): string {
  return typeof content === "string" ? content : JSON.stringify(content, null, 2);
}

function estimateTokens(text: string): number {
  return Math.ceil(Buffer.byteLength(text, "utf8") / 4);
}
