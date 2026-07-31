import { describe, expect, it, vi } from "vitest";

import type {
  DrawlessCoworkerConversationToolApprovalRequest,
  DrawlessCoworkerRoomStatusResponse,
  DrawlessServerCoworkerStartRequest
} from "@drawless/shared";
import { loadServerConfig } from "../../config.js";
import { createCoworkerApprovalRegistry } from "../../coworker/coworker-approval-registry.js";
import type { CoworkerControlClient } from "../../coworker/coworker-control-client.js";
import type { FeedbackClient } from "../../feedback/github-feedback-client.js";
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
      error: "Drew 暂时不可用，请稍后再试。"
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

  it("creates one GitHub issue for safe retries of the same feedback", async () => {
    const createIssue = vi.fn<FeedbackClient["createIssue"]>(
      async () => ({ issueNumber: 24 })
    );
    const { app } = await createServerApp({
      config: loadServerConfig({
        ALLOWED_ORIGINS: "http://127.0.0.1:3000"
      }),
      feedbackClient: { createIssue }
    });
    const payload = {
      submissionId: "11111111-1111-4111-8111-111111111111",
      category: "suggestion",
      message: "希望断线恢复时能给出更明确的提示。",
      surface: "canvas"
    };

    const first = await app.inject({
      method: "POST",
      url: "/feedback",
      headers: { origin: "http://127.0.0.1:3000" },
      payload
    });
    const retry = await app.inject({
      method: "POST",
      url: "/feedback",
      headers: { origin: "http://127.0.0.1:3000" },
      payload
    });

    expect(first.statusCode, first.body).toBe(201);
    expect(first.json()).toEqual({ ok: true, issueNumber: 24 });
    expect(retry.statusCode).toBe(201);
    expect(createIssue).toHaveBeenCalledTimes(1);
    expect(createIssue).toHaveBeenCalledWith(payload);

    await app.close();
  });

  it("rejects untrusted origins and rate limits anonymous feedback", async () => {
    const feedbackClient: FeedbackClient = {
      createIssue: async () => ({ issueNumber: 1 })
    };
    const { app } = await createServerApp({
      config: loadServerConfig({
        ALLOWED_ORIGINS: "http://127.0.0.1:3000"
      }),
      feedbackClient
    });
    const basePayload = {
      category: "bug",
      message: "这个反馈内容足够长，可以通过共享校验。",
      surface: "canvas"
    };
    const forbidden = await app.inject({
      method: "POST",
      url: "/feedback",
      headers: { origin: "https://untrusted.example" },
      payload: {
        ...basePayload,
        submissionId: "11111111-1111-4111-8111-111111111111"
      }
    });
    expect(forbidden.statusCode).toBe(403);

    for (const submissionId of [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333"
    ]) {
      const accepted = await app.inject({
        method: "POST",
        url: "/feedback",
        headers: { origin: "http://127.0.0.1:3000" },
        payload: { ...basePayload, submissionId }
      });
      expect(accepted.statusCode, accepted.body).toBe(201);
    }

    const limited = await app.inject({
      method: "POST",
      url: "/feedback",
      headers: { origin: "http://127.0.0.1:3000" },
      payload: {
        ...basePayload,
        submissionId: "44444444-4444-4444-8444-444444444444"
      }
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBeTruthy();
    expect(limited.json()).toMatchObject({
      ok: false,
      code: "RATE_LIMITED"
    });

    await app.close();
  });

  it("forwards coworker lifecycle requests through the configured client", async () => {
    const approvalRegistry = createCoworkerApprovalRegistry();
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
        return createSseResponse({
          type: "tool-call-approval",
          runId: "run-1",
          payload: {
            toolCallId: "call-1",
            toolName: "edit-canvas",
            args: {
              roomId: "alpha",
              intent: "整理流程",
              operations: [
                {
                  operationId: "create-1",
                  kind: "create_shape",
                  shapeKind: "rectangle",
                  text: "开始",
                  bounds: { x: 0, y: 0, w: 160, h: 80 }
                }
              ]
            }
          }
        });
      },
      approveConversationToolCall: async (roomId, request) => {
        calls.push({ method: "approveConversationToolCall", roomId, request });
        return createSseResponse({
          type: "tool-result",
          runId: request.runId,
          payload: {
            toolCallId: request.toolCallId,
            toolName: "edit-canvas",
            result: { applied: true }
          }
        });
      },
      declineConversationToolCall: async (roomId, request) => {
        calls.push({ method: "declineConversationToolCall", roomId, request });
        return createSseResponse({ type: "finish", runId: request.runId });
      }
    };
    const declinedApproval = approvalRegistry.register({
      id: "22222222-2222-4222-8222-222222222222",
      roomId: "alpha",
      runId: "run-2",
      toolCallId: "call-2",
      capability: "canvas.edit",
      risk: "write",
      proposal: { roomId: "alpha", intent: "另一个计划", operations: [] }
    });
    const { app } = await createServerApp({
      config: loadServerConfig({
        ALLOWED_ORIGINS: "http://127.0.0.1:3000",
        COWORKER_ENABLED: "true"
      }),
      coworkerClient,
      coworkerApprovalRegistry: approvalRegistry
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
    const publicApprovalEvent = readFirstSseEvent(conversation.body);
    expect(publicApprovalEvent).not.toHaveProperty("runId");
    expect(publicApprovalEvent.payload).not.toHaveProperty("toolCallId");
    expect(publicApprovalEvent).toMatchObject({
      type: "tool-call-approval",
      approval: {
        roomId: "alpha",
        capability: "canvas.edit",
        risk: "write"
      }
    });
    const publicApproval = publicApprovalEvent.approval as { id: string };

    const pendingApprovals = await app.inject({
      method: "GET",
      url: "/rooms/alpha/coworker/approvals?status=pending"
    });
    expect(pendingApprovals.statusCode).toBe(200);
    expect(pendingApprovals.json()).toMatchObject({
      roomId: "alpha",
      approvals: expect.arrayContaining([
        expect.objectContaining({
          approval: expect.objectContaining({
            id: publicApproval.id,
            capability: "canvas.edit"
          }),
          status: "pending",
          audit: expect.arrayContaining([
            expect.objectContaining({ kind: "requested" })
          ])
        })
      ])
    });
    expect(pendingApprovals.body).not.toContain("run-1");
    expect(pendingApprovals.body).not.toContain("call-1");

    const approve = await app.inject({
      method: "POST",
      url: `/rooms/alpha/coworker/approvals/${publicApproval.id}/resolve`,
      payload: { decision: "approve" }
    });
    expect(approve.statusCode).toBe(200);
    expect(readFirstSseEvent(approve.body)).toMatchObject({
      type: "tool-result",
      operationId: publicApproval.id
    });

    const decline = await app.inject({
      method: "POST",
      url: `/rooms/alpha/coworker/approvals/${declinedApproval.id}/resolve`,
      payload: { decision: "decline" }
    });
    expect(decline.statusCode).toBe(200);
    expect(readFirstSseEvent(decline.body)).toMatchObject({ type: "finish" });

    const remainingPending = await app.inject({
      method: "GET",
      url: "/rooms/alpha/coworker/approvals?status=pending"
    });
    expect(remainingPending.json()).toMatchObject({ approvals: [] });

    const approvalAudit = await app.inject({
      method: "GET",
      url: "/rooms/alpha/coworker/approvals?status=resolved"
    });
    expect(approvalAudit.json()).toMatchObject({
      approvals: expect.arrayContaining([
        expect.objectContaining({
          approval: expect.objectContaining({ id: publicApproval.id }),
          status: "resolved",
          decision: "approve",
          audit: expect.arrayContaining([
            expect.objectContaining({
              kind: "resolution-started",
              decision: "approve"
            }),
            expect.objectContaining({
              kind: "resolved",
              decision: "approve"
            })
          ])
        })
      ])
    });

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
        request: { runId: "run-2", toolCallId: "call-2" }
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
        return createSseResponse({ type: "text-delta", payload: { text: "stream" } });
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
    expect(readFirstSseEvent(conversation.body)).toMatchObject({
      type: "text-delta",
      payload: { text: "stream" }
    });
    expect(calls).toEqual(["status", "start:true:8000", "streamConversation"]);

    await app.close();
  });
});

function createSseResponse(event: unknown) {
  const type =
    event && typeof event === "object" && "type" in event &&
    typeof event.type === "string"
      ? event.type
      : "message";
  return new Response(`event: ${type}\ndata: ${JSON.stringify(event)}\n\n`, {
    headers: { "content-type": "text/event-stream; charset=utf-8" }
  });
}

function readFirstSseEvent(body: string): Record<string, unknown> {
  const dataLine = body
    .split(/\r?\n/u)
    .find((line) => line.startsWith("data:"));
  if (!dataLine) {
    throw new Error("Expected an SSE data line.");
  }
  return JSON.parse(dataLine.slice(5).trimStart()) as Record<string, unknown>;
}
