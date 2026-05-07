import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { loadConfigBundle } from "../config/loadConfig.js";
import { demoTools } from "../manifests/demoManifests.js";
import { buildUniversalToolRegistry } from "../manifests/universalRegistry.js";
import { runtimeVersion } from "../packageInfo.js";
import type { Policy } from "../policy/policy.js";
import { checkWorkflowPayload, runWorkflowPayload } from "./workflowHandlers.js";

const defaultPolicy: Policy = {
  allow: ["read.tests", "read.repo", "agent.debugger", "agent.coder", "run.tests"],
  requireApproval: ["write.repo", "write.github.issues"],
  deny: ["read.secrets", "shell.exec"]
};

export type ServiceOptions = {
  configPath?: string;
  overridesPath?: string;
  host?: string;
  port?: number;
  policy?: Policy;
};

export async function createService(options: ServiceOptions = {}) {
  const bundle = await loadConfigBundle(toConfigInput(options));
  const startedAt = Date.now();
  let url = "";

  const server = createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        return send(response, 200, { ok: true, version: runtimeVersion, uptimeMs: Date.now() - startedAt, configPath: bundle.configPath });
      }

      if (request.method === "GET" && request.url === "/sources") {
        const registry = await buildUniversalToolRegistry({
          builtInTools: demoTools,
          sources: bundle.config.sources,
          overrides: bundle.overrides
        });
        return send(response, 200, {
          sources: bundle.config.sources,
          diagnostics: registry.diagnostics,
          importedTools: registry.importedTools.map((tool) => tool.name)
        });
      }

      if (request.method === "POST" && request.url === "/workflows/check") {
        const result = await checkWorkflowPayload(await readJson(request), {
          config: bundle.config,
          overrides: bundle.overrides,
          policy: options.policy ?? defaultPolicy
        });
        return send(response, result.status, result);
      }

      if (request.method === "POST" && request.url === "/workflows/plan") {
        const result = await checkWorkflowPayload(await readJson(request), {
          config: bundle.config,
          overrides: bundle.overrides,
          policy: options.policy ?? defaultPolicy
        });
        return send(response, result.status, result);
      }

      if (request.method === "POST" && request.url === "/workflows/run") {
        const result = await runWorkflowPayload(await readJson(request), {
          config: bundle.config,
          overrides: bundle.overrides,
          policy: options.policy ?? defaultPolicy
        });
        return send(response, result.status, result);
      }

      return send(response, 404, { ok: false, code: "NOT_FOUND", message: "unknown endpoint" });
    } catch (error) {
      return send(response, 500, {
        ok: false,
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return {
    get url() {
      return url;
    },
    async start() {
      const host = options.host ?? bundle.config.service.host;
      const port = options.port ?? bundle.config.service.port;
      await new Promise<void>((resolve) => server.listen(port, host, resolve));
      const address = server.address() as AddressInfo;
      url = `http://${address.address}:${address.port}`;
    },
    async stop() {
      await closeServer(server);
    }
  };
}

function toConfigInput(options: ServiceOptions): { configPath?: string; overridesPath?: string } {
  const input: { configPath?: string; overridesPath?: string } = {};
  if (options.configPath) input.configPath = options.configPath;
  if (options.overridesPath) input.overridesPath = options.overridesPath;
  return input;
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
