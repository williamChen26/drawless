import { describe, expect, it } from "vitest";

import { createCoworkerApprovalRegistry } from "../coworker-approval-registry.js";

describe("coworker approval registry", () => {
  it("keeps runtime references behind a stable public approval id", () => {
    const registry = createCoworkerApprovalRegistry({
      createId: () => "11111111-1111-4111-8111-111111111111",
      now: () => Date.parse("2026-07-21T06:00:00.000Z")
    });
    const approval = registry.register({
      roomId: "alpha",
      runId: "runtime-run-1",
      toolCallId: "runtime-call-1",
      capability: "canvas.edit",
      risk: "write",
      proposal: { intent: "整理画布" }
    });

    expect(approval).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      roomId: "alpha",
      capability: "canvas.edit",
      risk: "write",
      proposal: { intent: "整理画布" },
      requestedAt: "2026-07-21T06:00:00.000Z"
    });
    expect(registry.acquire("alpha", approval.id, "approve")).toMatchObject({
      ok: true,
      lease: {
        runtime: {
          runId: "runtime-run-1",
          toolCallId: "runtime-call-1"
        }
      }
    });
  });

  it("deduplicates registration and serializes approval resolution", () => {
    const registry = createCoworkerApprovalRegistry({
      createId: () => "11111111-1111-4111-8111-111111111111"
    });
    const registration = {
      roomId: "alpha",
      runId: "runtime-run-1",
      toolCallId: "runtime-call-1",
      capability: "canvas.edit",
      risk: "write" as const,
      proposal: { intent: "整理画布" }
    };
    const approval = registry.register(registration);

    expect(registry.register(registration).id).toBe(approval.id);
    expect(registry.acquire("alpha", approval.id, "approve").ok).toBe(true);
    expect(registry.acquire("alpha", approval.id, "approve")).toEqual({
      ok: false,
      reason: "resolving"
    });

    registry.settle(approval.id, {
      succeeded: false,
      error: "runtime unavailable"
    });
    expect(registry.acquire("alpha", approval.id, "decline").ok).toBe(true);
    registry.settle(approval.id, { succeeded: true });
    expect(registry.acquire("alpha", approval.id, "decline")).toEqual({
      ok: false,
      reason: "resolved"
    });
    expect(registry.list("alpha")).toMatchObject([
      {
        status: "resolved",
        decision: "decline",
        audit: [
          { kind: "requested" },
          { kind: "resolution-started", decision: "approve" },
          {
            kind: "resolution-failed",
            decision: "approve",
            message: "runtime unavailable"
          },
          { kind: "resolution-started", decision: "decline" },
          { kind: "resolved", decision: "decline" }
        ]
      }
    ]);
  });

  it("does not allow an approval to cross room boundaries", () => {
    const registry = createCoworkerApprovalRegistry({
      createId: () => "11111111-1111-4111-8111-111111111111"
    });
    const approval = registry.register({
      roomId: "alpha",
      runId: "runtime-run-1",
      toolCallId: "runtime-call-1",
      capability: "canvas.edit",
      risk: "write",
      proposal: null
    });

    expect(registry.acquire("beta", approval.id, "approve")).toEqual({
      ok: false,
      reason: "room-mismatch"
    });
  });

  it("lists only recoverable pending approvals for the requested room", () => {
    const ids = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222"
    ];
    const registry = createCoworkerApprovalRegistry({
      createId: () => ids.shift()!,
      now: () => Date.parse("2026-07-21T06:00:00.000Z")
    });
    const pending = registry.register({
      roomId: "alpha",
      runId: "runtime-run-1",
      toolCallId: "runtime-call-1",
      capability: "canvas.edit",
      risk: "write",
      proposal: { intent: "待处理" }
    });
    const resolved = registry.register({
      roomId: "alpha",
      runId: "runtime-run-2",
      toolCallId: "runtime-call-2",
      capability: "canvas.edit",
      risk: "write",
      proposal: { intent: "已处理" }
    });
    registry.acquire("alpha", resolved.id, "decline");
    registry.settle(resolved.id, { succeeded: true });

    expect(registry.list("alpha", "pending")).toMatchObject([
      { approval: { id: pending.id }, status: "pending" }
    ]);
    expect(registry.list("beta")).toEqual([]);
  });
});
