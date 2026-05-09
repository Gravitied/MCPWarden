import { describe, expect, it } from "vitest";
import { auditToolManifests, compactToolManifests } from "../../src/manifests/quality.js";
import type { ToolManifest } from "../../src/manifests/toolManifest.js";

describe("manifest quality tools", () => {
  it("scores missing purpose, schema, side effect, example, and danger metadata", () => {
    const manifests: ToolManifest[] = [
      {
        name: "weak.tool",
        description: "Tool.",
        inputSchema: {},
        outputTrust: "untrusted",
        effectRules: []
      }
    ];

    const [audit] = auditToolManifests(manifests);

    expect(audit).toMatchObject({
      tool: "weak.tool",
      score: expect.any(Number),
      checks: {
        purpose: false,
        args: false,
        output: true,
        sideEffects: false,
        examples: false,
        dangerNotes: false
      }
    });
    expect(audit.score).toBeLessThan(50);
  });

  it("produces concise model-facing tool selection cards", () => {
    const [card] = compactToolManifests([
      {
        name: "repo.apply_patch",
        description: "Apply or dry-run a patch against the repository. Use dry_run to preview before writing.",
        inputSchema: { type: "object", properties: { mode: { enum: ["dry_run", "apply"] }, patch: { type: "string" } } },
        outputTrust: "artifact",
        effectRules: [{ kind: "static", effects: ["write.repo"] }],
        requiresApproval: ["write.repo"]
      }
    ]);

    expect(card).toEqual({
      name: "repo.apply_patch",
      purpose: "Apply or dry-run a patch against the repository.",
      inputs: ["mode", "patch"],
      outputTrust: "artifact",
      effects: ["write.repo"],
      approvalRequired: ["write.repo"]
    });
  });
});
