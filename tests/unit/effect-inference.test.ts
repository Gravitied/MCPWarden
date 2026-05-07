import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../../src/manifests/registry.js";
import { fixtureTools } from "../fixtures/manifests.js";

describe("effect inference", () => {
  it("infers read-only effects from a tool call", () => {
    const registry = new ToolRegistry(fixtureTools);
    const effects = registry.effectsForToolCall("tests.get_failures", { limit: 10 });
    expect(effects).toEqual(["read.tests"]);
  });

  it("infers write.repo only when repo.apply_patch mode is apply", () => {
    const registry = new ToolRegistry(fixtureTools);
    expect(registry.effectsForToolCall("repo.apply_patch", { mode: "dry_run" })).toEqual(["read.repo"]);
    expect(registry.effectsForToolCall("repo.apply_patch", { mode: "apply" })).toEqual(["read.repo", "write.repo"]);
  });

  it("denies unknown tools during checking", () => {
    const registry = new ToolRegistry(fixtureTools);
    expect(() => registry.effectsForToolCall("unknown.tool", {})).toThrow("unknown tool: unknown.tool");
  });
});
