import { describe, expect, it } from "vitest";

import { createRoomRegistry } from "../room-registry.js";

describe("room registry", () => {
  it("reuses one TLSocketRoom per room id", () => {
    const registry = createRoomRegistry();

    const first = registry.getOrCreateRoom("alpha");
    const second = registry.getOrCreateRoom("alpha");

    expect(first).toBe(second);
    expect(registry.getStats()).toEqual({
      roomCount: 1,
      roomIds: ["alpha"]
    });

    registry.closeAll();
  });

  it("rejects invalid room ids before creating a room", () => {
    const registry = createRoomRegistry();

    expect(() => registry.getOrCreateRoom("bad room")).toThrow("Invalid room id");
    expect(registry.getStats().roomCount).toBe(0);
  });
});
