import { describe, expect, it } from "vitest";
import { policyPackNames, resolvePolicyPack } from "../../src/policy/packs.js";

describe("policy packs", () => {
  it("provides named least-privilege profiles", () => {
    expect(policyPackNames()).toContain("enterprise-strict");
    expect(resolvePolicyPack("local-dev")).toMatchObject({
      name: "local-dev",
      policy: {
        allow: expect.arrayContaining(["read.repo", "read.tests"]),
        requireApproval: expect.arrayContaining(["write.repo"]),
        deny: expect.arrayContaining(["read.secrets", "shell.exec"])
      }
    });
  });

  it("fails closed for unknown profiles", () => {
    expect(() => resolvePolicyPack("unknown")).toThrow("unknown policy profile");
  });
});
