import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createCoworkerControlClient,
  resolveCoworkerControlServerUrl
} from "../coworker-control";

describe("coworker control client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resolves websocket sync urls into http server urls", () => {
    expect(resolveCoworkerControlServerUrl("ws://127.0.0.1:3001")).toEqual({
      ok: true,
      value: "http://127.0.0.1:3001"
    });
    expect(resolveCoworkerControlServerUrl("wss://example.com/sync")).toEqual({
      ok: true,
      value: "https://example.com/sync"
    });
    expect(resolveCoworkerControlServerUrl("file:///tmp/drawless").ok).toBe(false);
  });

  it("starts coworker through the server lifecycle route", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          roomId: "alpha",
          active: true,
          status: "online",
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
      roomId: "alpha",
      serverUrl: "ws://127.0.0.1:3001",
      fetcher
    });

    const result = await client.start({
      waitUntilLoaded: false,
      sendIntroCursorChat: true
    });

    expect(result).toMatchObject({
      ok: true,
      value: { roomId: "alpha", status: "online" }
    });
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:3001/rooms/alpha/coworker/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          waitUntilLoaded: false,
          sendIntroCursorChat: true
        })
      })
    );
  });

  it("keeps the default browser fetch bound to globalThis", async () => {
    const fetcher = vi.fn(function (
      this: typeof globalThis,
      _resource: RequestInfo | URL,
      _init?: RequestInit
    ) {
      if (this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            roomId: "alpha",
            active: false,
            status: "not_started",
            identity: null,
            snapshot: null,
            lastError: null,
            startedAt: null,
            updatedAt: null
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );
    });
    vi.stubGlobal("fetch", fetcher);
    const client = createCoworkerControlClient({
      roomId: "alpha",
      serverUrl: "http://127.0.0.1:3001"
    });

    const result = await client.status();

    expect(result).toMatchObject({
      ok: true,
      value: { roomId: "alpha", status: "not_started" }
    });
    expect(fetcher).toHaveBeenCalled();
  });

  it("returns server errors without throwing", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: "Drew 暂时不可用，请稍后再试。"
        }),
        { status: 503, headers: { "content-type": "application/json" } }
      )
    );
    const client = createCoworkerControlClient({
      roomId: "alpha",
      serverUrl: "http://127.0.0.1:3001",
      fetcher
    });

    const result = await client.status();

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "HTTP_ERROR",
        message: "Drew 暂时不可用，请稍后再试。"
      }
    });
  });
});
