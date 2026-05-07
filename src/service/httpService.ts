import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { CompositeToolBroker } from "../adapters/compositeToolBroker.js";
import { McpToolBroker } from "../adapters/mcpToolBroker.js";
import { MockToolBroker } from "../adapters/mockTools.js";
import { loadConfigBundle } from "../config/loadConfig.js";
import { demoTools } from "../manifests/demoManifests.js";
import { buildUniversalToolRegistry } from "../manifests/universalRegistry.js";
import { runtimeVersion } from "../packageInfo.js";
import type { Policy } from "../policy/policy.js";
import type { ToolBroker } from "../runtime/broker.js";
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
  broker?: ToolBroker;
  authToken?: string;
};

export async function createService(options: ServiceOptions = {}) {
  const bundle = await loadConfigBundle(toConfigInput(options));
  const startedAt = Date.now();
  const authToken = options.authToken ?? randomBytes(32).toString("base64url");
  let url = "";

  const server = createServer(async (request, response) => {
    try {
      const pathname = request.url?.split("?")[0] ?? "/";
      const rejection = authorizeRequest(request, pathname, authToken);
      if (rejection) return send(response, rejection.status, { ok: false, code: rejection.code, message: rejection.message });

      if (request.method === "GET" && pathname === "/health") {
        return send(response, 200, { ok: true, version: runtimeVersion, uptimeMs: Date.now() - startedAt, configPath: bundle.configPath });
      }

      if (request.method === "GET" && pathname === "/sources") {
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

      if (request.method === "POST" && pathname === "/workflows/check") {
        const result = await checkWorkflowPayload(await readJson(request), {
          config: bundle.config,
          overrides: bundle.overrides,
          policy: options.policy ?? defaultPolicy
        });
        return send(response, result.status, result);
      }

      if (request.method === "POST" && pathname === "/workflows/plan") {
        const result = await checkWorkflowPayload(await readJson(request), {
          config: bundle.config,
          overrides: bundle.overrides,
          policy: options.policy ?? defaultPolicy
        });
        return send(response, result.status, result);
      }

      if (request.method === "POST" && pathname === "/workflows/run") {
        const broker = options.broker ?? (await defaultServiceBroker());
        const deps = {
          config: bundle.config,
          overrides: bundle.overrides,
          policy: options.policy ?? defaultPolicy
        };
        const result = await runWorkflowPayload(
          await readJson(request),
          { ...deps, broker }
        );
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
    get authToken() {
      return authToken;
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

  async function defaultServiceBroker() {
    const registry = await buildUniversalToolRegistry({
      builtInTools: demoTools,
      sources: bundle.config.sources,
      overrides: bundle.overrides
    });
    const liveSourceIds = new Set(bundle.config.sources.filter((source) => source.transport !== "fixture").map((source) => source.id));
    const liveToolToSource = new Map(
      registry.importedTools
        .filter((tool) => liveSourceIds.has(tool.sourceId))
        .map((tool) => [tool.name, tool.sourceId])
    );

    if (liveToolToSource.size === 0) return new MockToolBroker();
    const mcpBroker = new McpToolBroker({ sources: bundle.config.sources, toolToSource: liveToolToSource });
    return new CompositeToolBroker(new Set(liveToolToSource.keys()), mcpBroker, new MockToolBroker());
  }
}

function authorizeRequest(
  request: IncomingMessage,
  pathname: string,
  authToken: string
): { status: number; code: string; message: string } | undefined {
  if (request.method === "GET" && pathname === "/health") return undefined;

  const origin = headerValue(request.headers.origin);
  if (origin) {
    return { status: 403, code: "FORBIDDEN_ORIGIN", message: "browser origins are not accepted by the local service" };
  }

  const fetchSite = headerValue(request.headers["sec-fetch-site"]);
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site" && fetchSite !== "none") {
    return { status: 403, code: "FORBIDDEN_ORIGIN", message: "cross-site browser requests are not accepted by the local service" };
  }

  if (!isAuthorized(request, authToken)) {
    return { status: 401, code: "UNAUTHORIZED", message: "missing or invalid bearer token" };
  }

  if (request.method === "POST" && !isJsonRequest(request)) {
    return { status: 415, code: "UNSUPPORTED_MEDIA_TYPE", message: "POST requests must use content-type application/json" };
  }

  return undefined;
}

function isAuthorized(request: IncomingMessage, authToken: string): boolean {
  const header = headerValue(request.headers.authorization);
  const prefix = "Bearer ";
  if (!header?.startsWith(prefix)) return false;

  const supplied = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(authToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function isJsonRequest(request: IncomingMessage): boolean {
  return (headerValue(request.headers["content-type"]) ?? "").toLowerCase().split(";")[0]?.trim() === "application/json";
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
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
