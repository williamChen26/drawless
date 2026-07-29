import { describe, expect, it } from "vitest";

import {
  createInitialCoworkerWorkspaceSurface,
  createCoworkerWorkspacePresentationKey,
  reduceCoworkerWorkspaceSurface,
  resolveCoworkerPrimaryArtifact,
  resolveCoworkerWorkspaceAttention,
  type CoworkerWorkspaceSurface
} from "../coworker-workspace-view";

describe("coworker workspace view", () => {
  it("opens the Drew entry surface when a room initializes", () => {
    expect(createInitialCoworkerWorkspaceSurface()).toEqual({
      kind: "composer",
      purpose: "open"
    });
  });

  it("keeps auxiliary surfaces mutually exclusive", () => {
    let surface: CoworkerWorkspaceSurface = { kind: "closed" };
    surface = reduceCoworkerWorkspaceSurface(surface, {
      type: "show-current"
    });
    expect(surface).toEqual({ kind: "current" });

    surface = reduceCoworkerWorkspaceSurface(surface, {
      type: "open-composer"
    });
    expect(surface).toEqual({ kind: "composer", purpose: "open" });

    surface = reduceCoworkerWorkspaceSurface(surface, {
      type: "show-activity"
    });
    expect(surface).toEqual({ kind: "activity" });

    surface = reduceCoworkerWorkspaceSurface(surface, {
      type: "show-delivery"
    });
    expect(surface).toEqual({ kind: "delivery" });

    expect(
      reduceCoworkerWorkspaceSurface(surface, { type: "close" })
    ).toEqual({ kind: "closed" });
  });

  it("keeps feedback purpose inside the same communication surface", () => {
    expect(
      reduceCoworkerWorkspaceSurface(
        { kind: "delivery" },
        { type: "open-composer", purpose: "delivery-feedback" }
      )
    ).toEqual({ kind: "composer", purpose: "delivery-feedback" });
  });

  it("lets a composer take focus without leaving an old artifact beside it", () => {
    expect(
      resolveCoworkerPrimaryArtifact({
        phase: "completed",
        hasHandoff: false,
        hasPendingApproval: false,
        hasText: true,
        hasCanvasResult: false,
        surface: { kind: "composer", purpose: "plan-adjustment" }
      })
    ).toEqual({ kind: "none" });
  });

  it("gives approvals priority over presentation intent", () => {
    expect(
      resolveCoworkerPrimaryArtifact({
        phase: "awaiting-approval",
        hasHandoff: true,
        hasPendingApproval: true,
        hasText: true,
        hasCanvasResult: true,
        surface: { kind: "current" }
      })
    ).toEqual({ kind: "approval" });
  });

  it("hides every main artifact when the workspace is closed", () => {
    expect(
      resolveCoworkerPrimaryArtifact({
        phase: "awaiting-approval",
        hasHandoff: true,
        hasPendingApproval: true,
        hasText: true,
        hasCanvasResult: true,
        surface: { kind: "closed" }
      })
    ).toEqual({ kind: "none" });
  });

  it("separates natural dialogue from verified canvas delivery", () => {
    const base = {
      phase: "completed" as const,
      hasHandoff: false,
      hasPendingApproval: false,
      hasText: true,
      surface: { kind: "current" } as const
    };

    expect(
      resolveCoworkerPrimaryArtifact({
        ...base,
        hasCanvasResult: false
      })
    ).toEqual({ kind: "dialogue" });
    expect(
      resolveCoworkerPrimaryArtifact({
        ...base,
        hasCanvasResult: true
      })
    ).toEqual({ kind: "delivery-preview" });
    expect(
      resolveCoworkerPrimaryArtifact({
        ...base,
        hasCanvasResult: true,
        surface: { kind: "delivery" }
      })
    ).toEqual({ kind: "delivery" });
  });

  it("keeps action-required and unread attention separate from surface visibility", () => {
    expect(
      resolveCoworkerWorkspaceAttention({
        phase: "awaiting-approval",
        hasPendingApproval: true,
        hasText: true,
        hasCanvasResult: false,
        acknowledged: true
      })
    ).toEqual({ kind: "approval", label: "等你确认" });

    expect(
      resolveCoworkerWorkspaceAttention({
        phase: "completed",
        hasPendingApproval: false,
        hasText: true,
        hasCanvasResult: true,
        acknowledged: false
      })
    ).toEqual({ kind: "delivery", label: "有新交付" });

    expect(
      resolveCoworkerWorkspaceAttention({
        phase: "completed",
        hasPendingApproval: false,
        hasText: true,
        hasCanvasResult: true,
        acknowledged: true
      })
    ).toEqual({ kind: "none" });
  });

  it("creates one stable presentation key for approval, delivery, and reply", () => {
    expect(
      createCoworkerWorkspacePresentationKey({
        phase: "awaiting-approval",
        turnId: "turn-1",
        approvalId: "approval-1",
        hasText: true,
        hasCanvasResult: false
      })
    ).toBe("approval:approval-1");
    expect(
      createCoworkerWorkspacePresentationKey({
        phase: "completed",
        turnId: "turn-1",
        approvalId: null,
        hasText: true,
        hasCanvasResult: true
      })
    ).toBe("delivery:turn-1");
    expect(
      createCoworkerWorkspacePresentationKey({
        phase: "completed",
        turnId: "turn-2",
        approvalId: null,
        hasText: true,
        hasCanvasResult: false
      })
    ).toBe("reply:turn-2");
  });
});
