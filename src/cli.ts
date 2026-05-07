import { readFile } from "node:fs/promises";
import { Command } from "commander";
import { MockAgentRegistry } from "./adapters/mockAgents.js";
import { MockToolBroker } from "./adapters/mockTools.js";
import { InMemoryArtifactStore } from "./artifacts/artifactStore.js";
import { parseManifestOverrides, parseMcpwConfig } from "./config/config.js";
import { validateWorkflow } from "./ir/validate.js";
import type { Workflow } from "./ir/workflow.js";
import { demoTools } from "./manifests/demoManifests.js";
import { buildUniversalToolRegistry } from "./manifests/universalRegistry.js";
import { checkWorkflow } from "./policy/checker.js";
import type { Policy } from "./policy/policy.js";
import { executeWorkflow } from "./runtime/executor.js";

const policy: Policy = {
  allow: ["read.tests", "read.repo", "agent.debugger", "agent.coder", "run.tests"],
  requireApproval: ["write.repo", "write.github.issues"],
  deny: ["read.secrets", "shell.exec"]
};

async function loadWorkflow(path: string) {
  const raw = JSON.parse(await readFile(path, "utf8"));
  const validation = validateWorkflow(raw);
  if (!validation.ok) {
    throw new Error(validation.errors.join("\n"));
  }
  return validation.workflow;
}

async function loadConfigBundle(configPath: string | undefined) {
  if (!configPath) {
    return { config: { sources: [] }, overrides: { sources: {} } };
  }
  const config = parseMcpwConfig(JSON.parse(await readFile(configPath, "utf8")));
  const overridesPath = configPath.replace(/config\.json$/, "overrides.json");
  let overrides = parseManifestOverrides({ sources: {} });
  try {
    overrides = parseManifestOverrides(JSON.parse(await readFile(overridesPath, "utf8")));
  } catch (error) {
    if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) throw error;
  }
  return { config, overrides };
}

async function buildRegistryForCli(configPath: string | undefined) {
  const { config, overrides } = await loadConfigBundle(configPath);
  return buildUniversalToolRegistry({ builtInTools: demoTools, sources: config.sources, overrides });
}

type CliRegistryResult = Awaited<ReturnType<typeof buildRegistryForCli>>;

function unresolvedImportedToolDenials(workflow: Workflow, registryResult: CliRegistryResult): string[] {
  const builtInCounts = countManifestsByName(demoTools);
  const manifestCounts = countManifestsByName(registryResult.manifests);
  const unresolvedImports = new Set(
    registryResult.importedTools
      .filter((tool) => (manifestCounts.get(tool.name) ?? 0) <= (builtInCounts.get(tool.name) ?? 0))
      .map((tool) => tool.name)
  );
  const usedUnresolvedImports = new Set(
    workflow.steps
      .filter((step) => step.op === "tool.call" && unresolvedImports.has(step.tool))
      .map((step) => (step.op === "tool.call" ? step.tool : ""))
  );
  return [...usedUnresolvedImports].map((toolName) => `unknown tool: ${toolName}`);
}

function countManifestsByName(manifests: { name: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const manifest of manifests) counts.set(manifest.name, (counts.get(manifest.name) ?? 0) + 1);
  return counts;
}

const program = new Command();

program.name("mcpw").description("Policy-checkable workflow IR runtime for MCP agents").version("0.1.0");

program
  .command("check")
  .argument("<workflow>")
  .option("--config <path>")
  .action(async (path, options: { config?: string }) => {
    const workflow = await loadWorkflow(path);
    const registryResult = await buildRegistryForCli(options.config);
    const result = checkWorkflow(workflow, registryResult.registry, policy);
    const denied = [...unresolvedImportedToolDenials(workflow, registryResult), ...result.denied];
    if (denied.length > 0) throw new Error([...registryResult.diagnostics, ...denied].join("\n"));
    console.log(`OK workflow=${workflow.workflow} steps=${workflow.steps.length} effects=${result.effects.join(",")}`);
    console.log(`Approvals required: ${result.approvals.required.join(",") || "none"}`);
  });

program
  .command("plan")
  .argument("<workflow>")
  .option("--config <path>")
  .action(async (path, options: { config?: string }) => {
    const workflow = await loadWorkflow(path);
    const registryResult = await buildRegistryForCli(options.config);
    const result = checkWorkflow(workflow, registryResult.registry, policy);
    const denied = [...unresolvedImportedToolDenials(workflow, registryResult), ...result.denied];
    console.log(`Workflow: ${workflow.workflow}`);
    console.log(`Effects: ${result.effects.join(",") || "none"}`);
    console.log(`Approvals required: ${result.approvals.required.join(",") || "none"}`);
    if (registryResult.diagnostics.length > 0) console.log(`Diagnostics:\n${registryResult.diagnostics.join("\n")}`);
    if (denied.length > 0) console.log(`Denied:\n${denied.join("\n")}`);
  });

program
  .command("run")
  .argument("<workflow>")
  .option("--dry-run", "run with dry-run policy preview")
  .option("--config <path>")
  .action(async (path, options: { dryRun?: boolean; config?: string }) => {
    const workflow = await loadWorkflow(path);
    const registryResult = await buildRegistryForCli(options.config);
    const check = checkWorkflow(workflow, registryResult.registry, policy);
    const denied = [...unresolvedImportedToolDenials(workflow, registryResult), ...check.denied];
    if (denied.length > 0) throw new Error([...registryResult.diagnostics, ...denied].join("\n"));
    if (check.approvals.required.length > 0) {
      throw new Error(`approval required: ${check.approvals.required.join(",")}`);
    }
    const result = await executeWorkflow(workflow, {
      broker: new MockToolBroker(),
      agents: new MockAgentRegistry(),
      artifacts: new InMemoryArtifactStore()
    });
    console.log(JSON.stringify(result, null, 2));
  });

const sourcesCommand = program.command("sources").description("Inspect configured external tool sources");

sourcesCommand
  .command("list")
  .requiredOption("--config <path>")
  .action(async (options: { config: string }) => {
    const { config } = await loadConfigBundle(options.config);
    for (const source of config.sources) console.log(`${source.id}\t${source.kind}\t${source.defaultPolicy}`);
  });

sourcesCommand
  .command("inspect")
  .requiredOption("--config <path>")
  .requiredOption("--source <id>")
  .action(async (options: { config: string; source: string }) => {
    const { config } = await loadConfigBundle(options.config);
    const source = config.sources.find((item) => item.id === options.source);
    if (!source) throw new Error(`unknown source: ${options.source}`);
    const result = await buildUniversalToolRegistry({ builtInTools: [], sources: [source], overrides: { sources: {} } });
    console.log(`Source: ${source.id}`);
    for (const diagnostic of result.diagnostics) console.log(`- ${diagnostic}`);
    if (result.diagnostics.length === 0) console.log("- no diagnostics");
  });

const manifestsCommand = program.command("manifests").description("Export starter manifests for configured external sources");

manifestsCommand
  .command("export")
  .requiredOption("--config <path>")
  .requiredOption("--source <id>")
  .action(async (options: { config: string; source: string }) => {
    const { config } = await loadConfigBundle(options.config);
    const source = config.sources.find((item) => item.id === options.source);
    if (!source) throw new Error(`unknown source: ${options.source}`);
    const result = await buildUniversalToolRegistry({ builtInTools: [], sources: [source], overrides: { sources: {} } });
    const toolNames = [...new Set(result.importedTools.map((tool) => tool.name))];
    const starter = {
      sources: {
        [source.id]: {
          tools: Object.fromEntries(
            toolNames.map((toolName) => [toolName, { outputTrust: "untrusted", effectRules: [], requiresApproval: [] }])
          )
        }
      }
    };
    console.log(JSON.stringify(starter, null, 2));
  });

await program.parseAsync();
