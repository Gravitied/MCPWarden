import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileRunStore } from "../../src/runs/runStore.js";

describe("persistent run store", () => {
  it("persists and reloads workflow run records", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "mcpw-runs-"));
    try {
      const path = join(cwd, "runs.jsonl");
      const store = new FileRunStore(path);
      await store.append({ runId: "run_1", workflow: "wf", ok: true, createdAt: "2026-05-10T00:00:00.000Z", metrics: { durationMs: 1 } });

      const reloaded = new FileRunStore(path);
      expect(await reloaded.list()).toEqual([
        expect.objectContaining({ runId: "run_1", workflow: "wf", ok: true })
      ]);
      await expect(reloaded.get("run_1")).resolves.toMatchObject({ runId: "run_1" });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
