export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export type Logger = {
  debug(event: string, data?: unknown): void;
  info(event: string, data?: unknown): void;
  warn(event: string, data?: unknown): void;
  error(event: string, data?: unknown): void;
};

export type LoggerOptions = {
  level?: LogLevel;
  sink?: (line: string) => void;
  clock?: () => Date;
};

const priorities: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50
};

export const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {}
};

export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? "silent";
  const sink = options.sink ?? ((line) => process.stderr.write(`${line}\n`));
  const clock = options.clock ?? (() => new Date());

  function write(entryLevel: Exclude<LogLevel, "silent">, event: string, data?: unknown): void {
    if (priorities[entryLevel] < priorities[level]) return;
    const entry: Record<string, unknown> = {
      at: clock().toISOString(),
      level: entryLevel,
      event
    };
    if (data !== undefined) entry.data = redact(data);
    sink(JSON.stringify(entry));
  }

  return {
    debug(event, data) {
      write("debug", event, data);
    },
    info(event, data) {
      write("info", event, data);
    },
    warn(event, data) {
      write("warn", event, data);
    },
    error(event, data) {
      write("error", event, data);
    }
  };
}

export function createLoggerFromEnv(env: NodeJS.ProcessEnv = process.env): Logger {
  return createLogger({ level: logLevelFromEnv(env) });
}

function logLevelFromEnv(env: NodeJS.ProcessEnv): LogLevel {
  const requested = env.MCPW_LOG_LEVEL?.toLowerCase();
  if (requested === "debug" || requested === "info" || requested === "warn" || requested === "error" || requested === "silent") {
    return requested;
  }
  return env.MCPW_DEBUG === "1" || env.MCPW_DEBUG === "true" ? "debug" : "silent";
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "string") return redactString(value);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, isSensitiveKey(key) ? "[REDACTED]" : redact(item)])
    );
  }
  return value;
}

function isSensitiveKey(key: string): boolean {
  return /(?:secret|token|password|api[_-]?key|authorization)/i.test(key);
}

function redactString(value: string): string {
  return value.replace(/\b((?:api[_-]?key)|(?:access[_-]?token)|(?:auth[_-]?token)|token|password|secret)\s*=\s*[^\s"'&]+/gi, "$1=[REDACTED]");
}
