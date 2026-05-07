import { z } from "zod";
import { knownEffects } from "../manifests/effects.js";

const effectSchema = z.enum(knownEffects);
const trustSchema = z.enum(["trusted", "untrusted", "secret", "artifact", "patch"]);

export const mcpSourceConfigSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("mcp"),
  transport: z.enum(["fixture", "stdio", "http"]).default("fixture"),
  fixturePath: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().url().optional(),
  timeoutMs: z.number().int().positive().default(5000),
  defaultPolicy: z.enum(["deny-unknown", "inspect-only", "allow-annotated"]).default("deny-unknown")
});

export const serviceConfigSchema = z.object({
  host: z.string().default("127.0.0.1"),
  port: z.number().int().min(0).max(65535).default(8765)
});

export const mcpwConfigSchema = z.object({
  service: serviceConfigSchema.default({}),
  sources: z.array(mcpSourceConfigSchema).default([])
});

const staticEffectRuleSchema = z.object({
  kind: z.literal("static"),
  effects: z.array(effectSchema)
});

const argumentEffectRuleSchema = z.object({
  kind: z.literal("argumentEquals"),
  path: z.string().min(1),
  equals: z.unknown(),
  effects: z.array(effectSchema),
  otherwiseEffects: z.array(effectSchema)
});

export const manifestOverrideSchema = z.object({
  outputTrust: trustSchema.optional(),
  effectRules: z.array(z.union([staticEffectRuleSchema, argumentEffectRuleSchema])).optional(),
  requiresApproval: z.array(effectSchema).optional(),
  aliases: z.array(z.string()).optional(),
  description: z.string().optional()
});

export const manifestOverridesSchema = z.object({
  sources: z.record(
    z.object({
      defaults: manifestOverrideSchema.optional(),
      tools: z.record(manifestOverrideSchema).default({})
    })
  ).default({})
});

export type McpwConfig = z.infer<typeof mcpwConfigSchema>;
export type McpSourceConfig = z.infer<typeof mcpSourceConfigSchema>;
export type ServiceConfig = z.infer<typeof serviceConfigSchema>;
export type ManifestOverride = z.infer<typeof manifestOverrideSchema>;
export type ManifestOverrides = z.infer<typeof manifestOverridesSchema>;

export function parseMcpwConfig(input: unknown): McpwConfig {
  return mcpwConfigSchema.parse(input);
}

export function parseManifestOverrides(input: unknown): ManifestOverrides {
  return manifestOverridesSchema.parse(input);
}
