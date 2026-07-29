import { describe, expect, it } from "vitest";

import { resolveCoworkerAvatarMode } from "../coworker-avatar-state";

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
});
