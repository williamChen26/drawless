import { describe, expect, it } from "vitest";

import { resolveSyncConfig } from "../sync-config";

describe("sync config", () => {
  it("builds a websocket room uri from an http backend base url", () => {
    expect(
      resolveSyncConfig({
        serverUrl: "http://127.0.0.1:3001",
        roomId: "alpha",
        deviceId: "drawless-device-00000000-0000-4000-8000-000000000000",
        tabId: "tab-00000000-0000-4000-8000-000000000001"
      })
    ).toMatchObject({
      ok: true,
      value: {
        roomUri: "ws://127.0.0.1:3001/sync/alpha"
      }
    });
  });

  it("rejects hosted tldraw demo sync urls", () => {
    const result = resolveSyncConfig({
      serverUrl: "https://demo.tldraw.xyz",
      roomId: "alpha",
      deviceId: "drawless-device-00000000-0000-4000-8000-000000000000",
      tabId: "tab-00000000-0000-4000-8000-000000000001"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("HOSTED_DEMO_SYNC_URL");
    }
  });

  it("resolves room and session ids through shared validation", () => {
    const result = resolveSyncConfig({
      serverUrl: "http://127.0.0.1:3001",
      roomId: "alpha",
      deviceId: "drawless-device-00000000-0000-4000-8000-000000000000",
      tabId: "tab-00000000-0000-4000-8000-000000000001"
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        roomId: "alpha",
        sessionId:
          "drawless-device-00000000-0000-4000-8000-000000000000:tab-00000000-0000-4000-8000-000000000001"
      }
    });
  });
});
