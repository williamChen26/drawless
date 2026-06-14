import { afterEach, describe, expect, it, vi } from "vitest";

import { createCoworkerControlClient } from "../coworker-control-client.js";

describe("coworker control client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls coworker custom api routes with server-owned sync url", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            roomId: "alpha",
            active: true,
            status: "starting",
            identity: null,
            snapshot: null,
            lastError: null,
            startedAt: "2026-06-11T00:00:00.000Z",
            updatedAt: "2026-06-11T00:00:00.000Z"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );
    const client = createCoworkerControlClient({
      enabled: true,
      baseUrl: "http://127.0.0.1:4111",
      serverUrl: "http://127.0.0.1:3001",
      requestTimeoutMs: 10000
    });

    const status = await client.start("alpha", {
      displayName: "Drawless Coworker",
      waitUntilLoaded: false
    });

    expect(status.status).toBe("starting");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4111/drawless/rooms/alpha/coworker/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          serverUrl: "http://127.0.0.1:3001",
          displayName: "Drawless Coworker",
          waitUntilLoaded: false,
          timeoutMs: 8000
        })
      })
    );
  });
});
