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
      displayName: "Drew",
      waitUntilLoaded: false
    });

    expect(status.status).toBe("starting");
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://127.0.0.1:4111/drawless/rooms/alpha/coworker/start");
    expect(init).toEqual(expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      serverUrl: "http://127.0.0.1:3001",
      displayName: "Drew",
      waitUntilLoaded: false,
      timeoutMs: 8000,
      sendIntroCursorChat: false
    });
  });

  it("calls coworker conversation approval routes as streams", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response("approved", {
          status: 200,
          headers: { "content-type": "text/event-stream; charset=utf-8" }
        })
      );
    const client = createCoworkerControlClient({
      enabled: true,
      baseUrl: "http://127.0.0.1:4111",
      serverUrl: "http://127.0.0.1:3001",
      requestTimeoutMs: 10000
    });

    const response = await client.approveConversationToolCall("alpha", {
      runId: "run-1",
      toolCallId: "call-1"
    });

    expect(await response.text()).toBe("approved");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4111/drawless/rooms/alpha/coworker/conversation/run-1/tool-calls/call-1/approve",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ runId: "run-1", toolCallId: "call-1" })
      })
    );
  });
});
