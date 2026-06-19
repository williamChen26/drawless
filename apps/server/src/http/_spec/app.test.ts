import { describe, expect, it } from "vitest";

import type {
  DrawlessCoworkerRoomStatusResponse,
  DrawlessServerCoworkerStartRequest
} from "@drawless/shared";
import { loadServerConfig } from "../../config.js";
import type { CoworkerControlClient } from "../../coworker/coworker-control-client.js";
import { createServerApp } from "../app.js";

describe("server app", () => {
  it("exposes health and ready payloads for the sync backend", async () => {
    const { app } = await createServerApp({
      config: loadServerConfig({ ALLOWED_ORIGINS: "http://127.0.0.1:3000" })
    });

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({
      ok: true,
      service: "@drawless/server",
      syncRoute: "/sync/:roomId"
    });

    const ready = await app.inject({ method: "GET", url: "/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({
      ok: true,
      ready: true,
      rooms: { roomCount: 0, roomIds: [] },
      storage: { kind: "process-local-memory", durable: false }
    });

    await app.close();
  });

  it("keeps coworker control disabled unless config enables it", async () => {
    const { app } = await createServerApp({
      config: loadServerConfig({ ALLOWED_ORIGINS: "http://127.0.0.1:3000" })
    });

    const response = await app.inject({
      method: "GET",
      url: "/rooms/alpha/coworker/status"
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      ok: false,
      error: "Coworker control is disabled."
    });

    await app.close();
  });

  it("returns a successful CORS preflight for coworker control routes", async () => {
    const { app } = await createServerApp({
      config: loadServerConfig({ ALLOWED_ORIGINS: "http://127.0.0.1:3000" })
    });

    const response = await app.inject({
      method: "OPTIONS",
      url: "/rooms/alpha/coworker/start",
      headers: {
        origin: "http://127.0.0.1:3000",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://127.0.0.1:3000"
    );
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
    expect(response.headers["access-control-allow-headers"]).toContain(
      "content-type"
    );

    await app.close();
  });

  it("forwards coworker lifecycle requests through the configured client", async () => {
    const calls: Array<{
      method: "start" | "status" | "stop" | "streamConversation";
      roomId: string;
      request?: DrawlessServerCoworkerStartRequest | { roomId: string; message: string };
    }> = [];
    const status: DrawlessCoworkerRoomStatusResponse = {
      roomId: "alpha",
      active: true,
      status: "online",
      identity: null,
      snapshot: null,
      lastError: null,
      startedAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-11T00:00:00.000Z"
    };
    const coworkerClient: CoworkerControlClient = {
      start: async (roomId, request) => {
        calls.push({ method: "start", roomId, request });
        return status;
      },
      status: async (roomId) => {
        calls.push({ method: "status", roomId });
        return status;
      },
      stop: async (roomId) => {
        calls.push({ method: "stop", roomId });
        return {
          roomId,
          stopped: true,
          status: "stopped"
        };
      },
      streamConversation: async (roomId, request) => {
        calls.push({ method: "streamConversation", roomId, request });
        return new Response("hello from coworker", {
          headers: { "content-type": "text/event-stream; charset=utf-8" }
        });
      }
    };
    const { app } = await createServerApp({
      config: loadServerConfig({
        ALLOWED_ORIGINS: "http://127.0.0.1:3000",
        COWORKER_ENABLED: "true"
      }),
      coworkerClient
    });

    const start = await app.inject({
      method: "POST",
      url: "/rooms/alpha/coworker/start",
      payload: { waitUntilLoaded: false }
    });
    expect(start.statusCode).toBe(200);
    expect(start.json()).toMatchObject({ roomId: "alpha", status: "online" });

    const current = await app.inject({
      method: "GET",
      url: "/rooms/alpha/coworker/status"
    });
    expect(current.statusCode).toBe(200);

    const stop = await app.inject({
      method: "DELETE",
      url: "/rooms/alpha/coworker/stop"
    });
    expect(stop.statusCode).toBe(200);
    expect(stop.json()).toMatchObject({ roomId: "alpha", stopped: true });

    const conversation = await app.inject({
      method: "POST",
      url: "/rooms/alpha/coworker/conversation/stream",
      payload: { message: "帮我看看画布。" }
    });
    expect(conversation.statusCode).toBe(200);
    expect(conversation.headers["content-type"]).toContain("text/event-stream");
    expect(conversation.body).toBe("hello from coworker");

    expect(calls).toEqual([
      {
        method: "start",
        roomId: "alpha",
        request: { waitUntilLoaded: false }
      },
      { method: "status", roomId: "alpha" },
      { method: "stop", roomId: "alpha" },
      {
        method: "streamConversation",
        roomId: "alpha",
        request: { roomId: "alpha", message: "帮我看看画布。" }
      }
    ]);

    await app.close();
  });
});
