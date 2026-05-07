import { readFile } from "node:fs/promises";
import { ZodError } from "zod";
import { parseMcpwConfig } from "../config/config.js";
import { loadConfigBundle } from "../config/loadConfig.js";
import { demoTools } from "../manifests/demoManifests.js";
import { buildUniversalToolRegistry } from "../manifests/universalRegistry.js";
import { runtimeVersion } from "../packageInfo.js";

export type DoctorCheck = { code: string; ok: boolean; message: string };
export type DoctorResult = { ok: boolean; version: string; checks: DoctorCheck[] };

export async function runDoctor(input: { configPath?: string; overridesPath?: string } = {}): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  checks.push({ code: "NODE_OK", ok: true, message: `node ${process.version}` });
  checks.push({ code: "PACKAGE_OK", ok: true, message: `mcpw ${runtimeVersion}` });

  try {
    if (input.configPath) parseMcpwConfig(JSON.parse(await readFile(input.configPath, "utf8")));
    const bundle = await loadConfigBundle(input);
    checks.push({ code: "CONFIG_OK", ok: true, message: bundle.configPath ?? "using empty default config" });

    const registry = await buildUniversalToolRegistry({
      builtInTools: demoTools,
      sources: bundle.config.sources,
      overrides: bundle.overrides
    });

    checks.push({
      code: "SOURCE_OK",
      ok: true,
      message: `${registry.importedTools.length} imported tools, ${registry.diagnostics.length} diagnostics`
    });
  } catch (error) {
    checks.push({
      code: configErrorCode(error),
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    });
  }

  return { ok: checks.every((check) => check.ok), version: runtimeVersion, checks };
}

function configErrorCode(error: unknown): string {
  if (error instanceof ZodError || error instanceof SyntaxError) return "CONFIG_INVALID";
  return "MCP_TOOLS_LIST_FAILED";
}
