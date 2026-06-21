import { describe, expect, it } from "vitest";

import type {
  DrawlessCoworkerConversationToolApprovalRequest,
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
      method:
        | "start"
        | "status"
        | "stop"
        | "streamConversation"
        | "approveConversationToolCall"
        | "declineConversationToolCall";
      roomId: string;
      request?:
        | DrawlessServerCoworkerStartRequest
        | { roomId: string; message: string }
        | DrawlessCoworkerConversationToolApprovalRequest;
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
      },
      approveConversationToolCall: async (roomId, request) => {
        calls.push({ method: "approveConversationToolCall", roomId, request });
        return new Response("approved", {
          headers: { "content-type": "text/event-stream; charset=utf-8" }
        });
      },
      declineConversationToolCall: async (roomId, request) => {
        calls.push({ method: "declineConversationToolCall", roomId, request });
        return new Response("declined", {
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

    const approve = await app.inject({
      method: "POST",
      url: "/rooms/alpha/coworker/conversation/run-1/tool-calls/call-1/approve"
    });
    expect(approve.statusCode).toBe(200);
    expect(approve.body).toBe("approved");

    const decline = await app.inject({
      method: "POST",
      url: "/rooms/alpha/coworker/conversation/run-1/tool-calls/call-1/decline"
    });
    expect(decline.statusCode).toBe(200);
    expect(decline.body).toBe("declined");

    expect(calls).toEqual([
      {
        method: "start",
        roomId: "alpha",
        request: { waitUntilLoaded: false }
      },
      { method: "status", roomId: "alpha" },
      { method: "stop", roomId: "alpha" },
      { method: "status", roomId: "alpha" },
      {
        method: "streamConversation",
        roomId: "alpha",
        request: { roomId: "alpha", message: "帮我看看画布。" }
      },
      {
        method: "approveConversationToolCall",
        roomId: "alpha",
        request: { runId: "run-1", toolCallId: "call-1" }
      },
      {
        method: "declineConversationToolCall",
        roomId: "alpha",
        request: { runId: "run-1", toolCallId: "call-1" }
      }
    ]);

    await app.close();
  });

  it("waits for coworker to be online before streaming conversation", async () => {
    const calls: string[] = [];
    const startingStatus: DrawlessCoworkerRoomStatusResponse = {
      roomId: "alpha",
      active: true,
      status: "starting",
      identity: null,
      snapshot: null,
      lastError: null,
      startedAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-11T00:00:00.000Z"
    };
    const onlineStatus: DrawlessCoworkerRoomStatusResponse = {
      ...startingStatus,
      status: "online"
    };
    const coworkerClient: CoworkerControlClient = {
      status: async () => {
        calls.push("status");
        return startingStatus;
      },
      start: async (_roomId, request) => {
        calls.push(`start:${request.waitUntilLoaded}:${request.timeoutMs}`);
        return onlineStatus;
      },
      stop: async (roomId) => ({
        roomId,
        stopped: true,
        status: "stopped"
      }),
      streamConversation: async () => {
        calls.push("streamConversation");
        return new Response("stream", {
          headers: { "content-type": "text/event-stream; charset=utf-8" }
        });
      },
      approveConversationToolCall: async () => new Response("approved"),
      declineConversationToolCall: async () => new Response("declined")
    };
    const { app } = await createServerApp({
      config: loadServerConfig({
        ALLOWED_ORIGINS: "http://127.0.0.1:3000",
        COWORKER_ENABLED: "true"
      }),
      coworkerClient
    });

    const conversation = await app.inject({
      method: "POST",
      url: "/rooms/alpha/coworker/conversation/stream",
      payload: { message: "画一个矩形" }
    });

    expect(conversation.statusCode).toBe(200);
    expect(conversation.body).toBe("stream");
    expect(calls).toEqual(["status", "start:true:8000", "streamConversation"]);

    await app.close();
  });
});
