import { afterEach, describe, expect, it, vi } from "vitest";

import { createRoomRegistry } from "../room-registry.js";

const ROOM_IDLE_TTL_MS = 30 * 60 * 1000;

describe("room registry", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("keeps active rooms and removes idle rooms after the cleanup window", () => {
    vi.useFakeTimers();
    const registry = createRoomRegistry();

    const release = registry.registerConnection("alpha");

    expect(registry.getStats()).toEqual({
      roomCount: 1,
      roomIds: ["alpha"]
    });

    vi.advanceTimersByTime(ROOM_IDLE_TTL_MS);
    expect(registry.getStats().roomIds).toEqual(["alpha"]);

    release();
    vi.advanceTimersByTime(ROOM_IDLE_TTL_MS - 1);
    expect(registry.getStats().roomIds).toEqual(["alpha"]);

    vi.advanceTimersByTime(1);
    expect(registry.getStats()).toEqual({
      roomCount: 0,
      roomIds: []
    });

    registry.closeAll();
  });

  it("ignores duplicate connection release calls", () => {
    vi.useFakeTimers();
    const registry = createRoomRegistry();

    const releaseFirst = registry.registerConnection("alpha");
    const releaseSecond = registry.registerConnection("alpha");

    releaseFirst();
    releaseFirst();
    vi.advanceTimersByTime(ROOM_IDLE_TTL_MS);
    expect(registry.getStats().roomIds).toEqual(["alpha"]);

    releaseSecond();
    vi.advanceTimersByTime(ROOM_IDLE_TTL_MS);
    expect(registry.getStats().roomIds).toEqual([]);

    registry.closeAll();
  });
});
