import { describe, expect, it } from "vitest";

import {
  getCoworkerAvatarFramePath,
  getNextWorkingFrame,
  pickNextListeningFrame,
  resolveCoworkerAvatarMode
} from "../coworker-avatar-state";

describe("coworker avatar state", () => {
  it("gives conversation work priority over input and hover state", () => {
    expect(
      resolveCoworkerAvatarMode({
        conversationStatus: "streaming",
        inputFocused: true,
        entryEngaged: true
      })
    ).toBe("working");
  });

  it("uses a static listening pose while waiting for approval", () => {
    expect(
      resolveCoworkerAvatarMode({
        conversationStatus: "awaiting_approval",
        inputFocused: false,
        entryEngaged: true
      })
    ).toBe("awaiting-approval");
  });

  it("listens while the input is focused and reacts to hover otherwise", () => {
    expect(
      resolveCoworkerAvatarMode({
        conversationStatus: "idle",
        inputFocused: true,
        entryEngaged: true
      })
    ).toBe("listening");
    expect(
      resolveCoworkerAvatarMode({
        conversationStatus: "done",
        inputFocused: false,
        entryEngaged: true
      })
    ).toBe("hover");
  });

  it("loops working frames in a stable order", () => {
    expect(getNextWorkingFrame(1)).toBe(5);
    expect(getNextWorkingFrame(5)).toBe(6);
    expect(getNextWorkingFrame(6)).toBe(7);
    expect(getNextWorkingFrame(7)).toBe(5);
  });

  it("selects a different listening frame with deterministic randomness", () => {
    expect(pickNextListeningFrame(8, () => 0)).toBe(9);
    expect(pickNextListeningFrame(9, () => 0.99)).toBe(10);
    expect(pickNextListeningFrame(null, () => 0)).toBe(8);
  });

  it("maps frame numbers to zero-padded public asset paths", () => {
    expect(getCoworkerAvatarFramePath(1)).toBe(
      "/coworker/avatar/frame-01.webp"
    );
    expect(getCoworkerAvatarFramePath(10)).toBe(
      "/coworker/avatar/frame-10.webp"
    );
  });
});

