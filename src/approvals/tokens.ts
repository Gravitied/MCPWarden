import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Effect } from "../manifests/effects.js";

export type ApprovalTokenPayload = {
  version: 1;
  nonce: string;
  workflowHash: string;
  policyHash: string;
  effects: Effect[];
  issuedAt: number;
  expiresAt: number;
};

export type IssueApprovalTokenInput = {
  secret: string;
  workflowHash: string;
  policyHash: string;
  effects: Effect[];
  expiresInMs: number;
  now?: number;
  nonce?: string;
};

export type VerifyApprovalTokenInput = {
  secret: string;
  now?: number;
  seenNonces?: Set<string>;
};

export function issueApprovalToken(input: IssueApprovalTokenInput): string {
  if (input.expiresInMs <= 0) throw new Error("expiresInMs must be positive");
  const issuedAt = input.now ?? Date.now();
  const payload: ApprovalTokenPayload = {
    version: 1,
    nonce: input.nonce ?? randomBytes(16).toString("base64url"),
    workflowHash: input.workflowHash,
    policyHash: input.policyHash,
    effects: [...new Set(input.effects)].sort() as Effect[],
    issuedAt,
    expiresAt: issuedAt + input.expiresInMs
  };
  const body = encode(JSON.stringify(payload));
  return `${body}.${sign(body, input.secret)}`;
}

export function verifyApprovalToken(
  token: string,
  input: VerifyApprovalTokenInput
): { ok: true; payload: ApprovalTokenPayload } | { ok: false; reason: string } {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) return { ok: false, reason: "approval token malformed" };
  if (!safeEqual(signature, sign(body, input.secret))) return { ok: false, reason: "approval token signature invalid" };

  let payload: ApprovalTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ApprovalTokenPayload;
  } catch {
    return { ok: false, reason: "approval token payload invalid" };
  }

  if ((input.now ?? Date.now()) > payload.expiresAt) return { ok: false, reason: "approval token expired" };
  if (input.seenNonces?.has(payload.nonce)) return { ok: false, reason: "approval token replayed" };
  input.seenNonces?.add(payload.nonce);
  return { ok: true, payload };
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
