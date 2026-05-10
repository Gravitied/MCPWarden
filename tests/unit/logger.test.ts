import { describe, expect, it } from "vitest";
import { createLogger } from "../../src/diagnostics/logger.js";

describe("diagnostic logger", () => {
  it("writes redacted structured JSON lines", () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: "debug",
      sink: (line) => lines.push(line),
      clock: () => new Date("2026-05-07T00:00:00.000Z")
    });

    logger.info("diagnostic.test", {
      ok: true,
      token: "abc123456789",
      nested: { apiKey: "secret-value" },
      text: "password=hunter2"
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain("abc123456789");
    expect(lines[0]).not.toContain("secret-value");
    expect(lines[0]).not.toContain("hunter2");
    expect(JSON.parse(lines[0] ?? "")).toEqual({
      at: "2026-05-07T00:00:00.000Z",
      level: "info",
      event: "diagnostic.test",
      data: {
        ok: true,
        token: "[REDACTED]",
        nested: { apiKey: "[REDACTED]" },
        text: "password=[REDACTED]"
      }
    });
  });

  it("filters events below the configured log level", () => {
    const lines: string[] = [];
    const logger = createLogger({ level: "warn", sink: (line) => lines.push(line) });

    logger.info("skip.me");
    logger.warn("keep.me");

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("keep.me");
  });
});
