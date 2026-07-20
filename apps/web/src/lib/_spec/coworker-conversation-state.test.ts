import { describe, expect, it } from "vitest";

import {
  createCoworkerApprovalOperationKey,
  createCoworkerConversationOperationCoordinator,
  isConversationBusy
} from "../coworker-conversation-state";

describe("coworker conversation state", () => {
  it("treats both request receipt and stream reading as busy", () => {
    expect(isConversationBusy("receiving")).toBe(true);
    expect(isConversationBusy("streaming")).toBe(true);
    expect(isConversationBusy("awaiting_approval")).toBe(true);
    expect(isConversationBusy("cancelled")).toBe(false);
  });

  it("allows only one active operation synchronously", () => {
    const coordinator =
      createCoworkerConversationOperationCoordinator("room-a");
    const first = coordinator.start("room-a");

    expect(first).not.toBeNull();
    expect(coordinator.start("room-a")).toBeNull();
    coordinator.finish(first!);
    expect(coordinator.start("room-a")).not.toBeNull();
  });

  it("invalidates old operations across an A to B to A room cycle", () => {
    const coordinator =
      createCoworkerConversationOperationCoordinator("room-a");
    const oldRoomAToken = coordinator.start("room-a")!;

    coordinator.enterRoom("room-b");
    const roomBToken = coordinator.start("room-b")!;
    coordinator.enterRoom("room-a");
    const newRoomAToken = coordinator.start("room-a")!;

    expect(coordinator.isCurrent(oldRoomAToken)).toBe(false);
    expect(coordinator.isCurrent(roomBToken)).toBe(false);
    expect(coordinator.isCurrent(newRoomAToken)).toBe(true);
  });

  it("locks approval by room, run and tool call identity", () => {
    const coordinator =
      createCoworkerConversationOperationCoordinator("room-a");
    const identity = {
      roomId: "room-a",
      runId: "run-1",
      toolCallId: "call-1"
    };

    expect(coordinator.acquireApproval(identity)).toBe(true);
    expect(coordinator.acquireApproval(identity)).toBe(false);
    expect(
      coordinator.acquireApproval({ ...identity, toolCallId: "call-2" })
    ).toBe(true);

    coordinator.releaseApproval(identity);
    expect(coordinator.acquireApproval(identity)).toBe(true);
  });

  it("does not allow an old-room approval identity", () => {
    const coordinator =
      createCoworkerConversationOperationCoordinator("room-a");

    expect(
      coordinator.acquireApproval({
        roomId: "room-b",
        runId: "run-1",
        toolCallId: "call-1"
      })
    ).toBe(false);
  });

  it("serializes approval keys without delimiter collisions", () => {
    expect(
      createCoworkerApprovalOperationKey({
        roomId: "room:a",
        runId: "run:1",
        toolCallId: "call:1"
      })
    ).not.toBe(
      createCoworkerApprovalOperationKey({
        roomId: "room",
        runId: "a:run",
        toolCallId: "1:call:1"
      })
    );
  });
});
