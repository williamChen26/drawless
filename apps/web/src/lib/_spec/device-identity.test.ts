import { describe, expect, it } from "vitest";

import {
  createTabSessionId,
  getOrCreateDeviceIdentity
} from "../device-identity";

describe("device identity", () => {
  it("persists a drawless device id when storage is available", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };

    const first = getOrCreateDeviceIdentity({
      storage,
      randomUUID: () => "00000000-0000-4000-8000-000000000000"
    });
    const second = getOrCreateDeviceIdentity({ storage });

    expect(first).toBe(
      "drawless-device-00000000-0000-4000-8000-000000000000"
    );
    expect(second).toBe(first);
  });

  it("creates one tab id per page lifecycle", () => {
    expect(
      createTabSessionId(() => "00000000-0000-4000-8000-000000000001")
    ).toBe("tab-00000000-0000-4000-8000-000000000001");
  });
});
