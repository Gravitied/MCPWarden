import { describe, expect, it } from "vitest";
import { issueApprovalToken, verifyApprovalToken } from "../../src/approvals/tokens.js";

describe("approval tokens", () => {
  it("issues signed approval tokens and rejects replay or tampering", () => {
    const token = issueApprovalToken({
      secret: "test-secret",
      workflowHash: "wf_123",
      policyHash: "policy_123",
      effects: ["write.repo"],
      expiresInMs: 60_000,
      now: 1_000,
      nonce: "nonce-1"
    });

    const seen = new Set<string>();
    expect(verifyApprovalToken(token, { secret: "test-secret", now: 2_000, seenNonces: seen })).toMatchObject({
      ok: true,
      payload: { workflowHash: "wf_123", effects: ["write.repo"] }
    });
    expect(verifyApprovalToken(token, { secret: "test-secret", now: 2_000, seenNonces: seen })).toMatchObject({
      ok: false,
      reason: "approval token replayed"
    });
    expect(verifyApprovalToken(`${token}x`, { secret: "test-secret", now: 2_000 })).toMatchObject({
      ok: false
    });
  });

  it("rejects expired tokens", () => {
    const token = issueApprovalToken({
      secret: "test-secret",
      workflowHash: "wf_123",
      policyHash: "policy_123",
      effects: ["write.repo"],
      expiresInMs: 10,
      now: 1_000,
      nonce: "nonce-2"
    });

    expect(verifyApprovalToken(token, { secret: "test-secret", now: 2_000 })).toMatchObject({
      ok: false,
      reason: "approval token expired"
    });
  });
});
