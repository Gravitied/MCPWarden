#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { Command } from "commander";
import { CompositeToolBroker } from "./adapters/compositeToolBroker.js";
import { McpToolBroker } from "./adapters/mcpToolBroker.js";
import { MockAgentRegistry } from "./adapters/mockAgents.js";
import { MockToolBroker } from "./adapters/mockTools.js";
import { InMemoryArtifactStore } from "./artifacts/artifactStore.js";
import { runDoctor } from "./cli/doctor.js";
import { initializeProject } from "./cli/init.js";
import { parseManifestOverrides, parseMcpwConfig } from "./config/config.js";
import { workflowJsonSchema } from "./ir/jsonSchema.js";
import { validateWorkflow } from "./ir/validate.js";
import { demoTools } from "./manifests/demoManifests.js";
import { auditToolManifests, compactToolManifests } from "./manifests/quality.js";
import { unresolvedImportedToolDenials } from "./manifests/unresolvedImports.js";
import type { UniversalRegistryResult } from "./manifests/universalRegistry.js";
import { buildUniversalToolRegistry } from "./manifests/universalRegistry.js";
import { runtimeVersion } from "./packageInfo.js";
import { checkWorkflow } from "./policy/checker.js";
import type { Policy } from "./policy/policy.js";
import { executeWorkflow, type ExecutionOptions } from "./runtime/executor.js";
import type { ToolBroker } from "./runtime/broker.js";
import { createService } from "./service/httpService.js";

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

async function brokerForCliRun(configPath: string | undefined, registryResult: UniversalRegistryResult): Promise<ToolBroker> {
  if (!configPath || registryResult.importedTools.length === 0) return new MockToolBroker();

  const { config } = await loadConfigBundle(configPath);
  const liveSourceIds = new Set(config.sources.filter((source) => source.transport !== "fixture").map((source) => source.id));
  const liveToolToSource = new Map(
    registryResult.importedTools
      .filter((tool) => liveSourceIds.has(tool.sourceId))
      .map((tool) => [tool.name, tool.sourceId])
  );

  if (liveToolToSource.size === 0) return new MockToolBroker();
  const mcpBroker = new McpToolBroker({ sources: config.sources, toolToSource: liveToolToSource });
  return new CompositeToolBroker(new Set(liveToolToSource.keys()), mcpBroker, new MockToolBroker());
}

const program = new Command();

program.name("mcpw").description("Policy-checkable workflow IR runtime for MCP agents").version(runtimeVersion);

program
  .command("init")
  .description("Create starter mcpw config and workflow files")
  .action(async () => {
    const result = await initializeProject();
    for (const item of result.created) console.log(`created ${item.name}`);
    for (const item of result.skipped) console.log(`exists  ${item.name}`);
  });

program
  .command("doctor")
  .description("Verify mcpw install health, config, and source discovery")
  .option("--config <path>")
  .option("--overrides <path>")
  .option("--json", "print JSON output")
  .action(async (options: { config?: string; overrides?: string; json?: boolean }) => {
    const doctorInput: { configPath?: string; overridesPath?: string } = {};
    if (options.config) doctorInput.configPath = options.config;
    if (options.overrides) doctorInput.overridesPath = options.overrides;
    const result = await runDoctor(doctorInput);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      for (const check of result.checks) console.log(`${check.ok ? "OK" : "FAIL"} ${check.code} ${check.message}`);
    }
    if (!result.ok) process.exitCode = 1;
  });

program
  .command("serve")
  .description("Start the local mcpw HTTP service")
  .option("--config <path>")
  .option("--overrides <path>")
  .option("--host <host>")
  .option("--port <port>")
  .option("--auth-token <token>")
  .action(async (options: { config?: string; overrides?: string; host?: string; port?: string; authToken?: string }) => {
    const serviceOptions: { configPath?: string; overridesPath?: string; host?: string; port?: number; authToken?: string } = {};
    if (options.config) serviceOptions.configPath = options.config;
    if (options.overrides) serviceOptions.overridesPath = options.overrides;
    if (options.host) serviceOptions.host = options.host;
    if (options.port) serviceOptions.port = Number(options.port);
    if (options.authToken) serviceOptions.authToken = options.authToken;
    const service = await createService(serviceOptions);
    await service.start();
    console.log(`mcpw service listening at ${service.url}`);
    console.log(`mcpw service token ${service.authToken}`);
  });

program
  .command("check")
  .argument("<workflow>")
  .option("--config <path>")
  .action(async (path, options: { config?: string }) => {
    const workflow = await loadWorkflow(path);
    const registryResult = await buildRegistryForCli(options.config);
    const result = checkWorkflow(workflow, registryResult.registry, policy);
    const denied = [...unresolvedImportedToolDenials(workflow, registryResult, demoTools), ...result.denied];
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
    const denied = [...unresolvedImportedToolDenials(workflow, registryResult, demoTools), ...result.denied];
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
  .option("--verbosity <mode>", "compact, normal, or debug")
  .option("--outputs <mode>", "full, summary, or refs")
  .option("--trace <mode>", "full or summary")
  .option("--max-output-bytes <bytes>")
  .option("--max-trace-events <count>")
  .option("--max-items <count>")
  .option("--parallel", "run independent workflow steps concurrently")
  .action(async (path, options: { dryRun?: boolean; config?: string; verbosity?: string; outputs?: string; trace?: string; maxOutputBytes?: string; maxTraceEvents?: string; maxItems?: string; parallel?: boolean }) => {
    const workflow = await loadWorkflow(path);
    const registryResult = await buildRegistryForCli(options.config);
    const check = checkWorkflow(workflow, registryResult.registry, policy);
    const denied = [...unresolvedImportedToolDenials(workflow, registryResult, demoTools), ...check.denied];
    if (denied.length > 0) throw new Error([...registryResult.diagnostics, ...denied].join("\n"));
    if (check.approvals.required.length > 0) {
      throw new Error(`approval required: ${check.approvals.required.join(",")}`);
    }
    const result = await executeWorkflow(workflow, {
      broker: await brokerForCliRun(options.config, registryResult),
      agents: new MockAgentRegistry(),
      artifacts: new InMemoryArtifactStore(),
      stepTrust: check.stepTrust
    }, executionOptionsFromCli(options));
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

manifestsCommand
  .command("compact")
  .requiredOption("--config <path>")
  .requiredOption("--source <id>")
  .action(async (options: { config: string; source: string }) => {
    const { config, overrides } = await loadConfigBundle(options.config);
    const source = config.sources.find((item) => item.id === options.source);
    if (!source) throw new Error(`unknown source: ${options.source}`);
    const result = await buildUniversalToolRegistry({ builtInTools: [], sources: [source], overrides });
    console.log(JSON.stringify(compactToolManifests(result.manifests), null, 2));
  });

manifestsCommand
  .command("audit")
  .requiredOption("--config <path>")
  .requiredOption("--source <id>")
  .action(async (options: { config: string; source: string }) => {
    const { config, overrides } = await loadConfigBundle(options.config);
    const source = config.sources.find((item) => item.id === options.source);
    if (!source) throw new Error(`unknown source: ${options.source}`);
    const result = await buildUniversalToolRegistry({ builtInTools: [], sources: [source], overrides });
    console.log(JSON.stringify(auditToolManifests(result.manifests), null, 2));
  });

const generateCommand = program.command("generate").description("Generate model-facing schemas and examples");

generateCommand
  .command("workflow")
  .option("--schema", "print the Workflow IR JSON Schema")
  .option("--example", "print a minimal workflow example")
  .action((options: { schema?: boolean; example?: boolean }) => {
    if (options.example) {
      console.log(
        JSON.stringify(
          {
            version: "0.1",
            workflow: "example",
            steps: [{ id: "failures", op: "tool.call", tool: "tests.get_failures", args: { limit: 1 } }]
          },
          null,
          2
        )
      );
      return;
    }
    console.log(JSON.stringify(workflowJsonSchema, null, 2));
  });

await program.parseAsync();

function executionOptionsFromCli(options: {
  verbosity?: string;
  outputs?: string;
  trace?: string;
  maxOutputBytes?: string;
  maxTraceEvents?: string;
  maxItems?: string;
  parallel?: boolean;
}): ExecutionOptions {
  const execution: ExecutionOptions = {};
  if (options.verbosity === "compact") {
    execution.outputMode = "summary";
    execution.traceMode = "summary";
    execution.maxItems = 3;
    execution.maxTraceEvents = 10;
  } else if (options.verbosity === "debug") {
    execution.outputMode = "full";
    execution.traceMode = "full";
  } else if (options.verbosity && options.verbosity !== "normal") {
    throw new Error(`unknown verbosity: ${options.verbosity}`);
  }
  if (options.outputs === "full" || options.outputs === "summary" || options.outputs === "refs") execution.outputMode = options.outputs;
  if (options.trace === "full" || options.trace === "summary") execution.traceMode = options.trace;
  if (options.parallel) execution.parallel = true;
  assignPositiveInteger(options.maxOutputBytes, (value) => (execution.maxOutputBytes = value));
  assignPositiveInteger(options.maxTraceEvents, (value) => (execution.maxTraceEvents = value));
  assignPositiveInteger(options.maxItems, (value) => (execution.maxItems = value));
  return execution;
}

function assignPositiveInteger(raw: string | undefined, assign: (value: number) => void): void {
  if (!raw) return;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`expected positive integer, got: ${raw}`);
  assign(value);
}
