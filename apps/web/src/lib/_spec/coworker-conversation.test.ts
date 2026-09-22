import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createCoworkerApprovalResolutionStream,
  createCoworkerConversationStream,
  loadCoworkerPendingApprovals,
  readCoworkerConversationEventStream
} from "../coworker-conversation";

describe("coworker conversation stream client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens a server conversation stream for the room", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("hello"));
        controller.close();
      }
    });
    const fetcher = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream; charset=utf-8" }
      })
    );

    const result = await createCoworkerConversationStream({
      roomId: "alpha",
      message: "  帮我看看画布。  ",
      serverUrl: "ws://127.0.0.1:3001",
      fetcher
    });

    expect(result.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:3001/rooms/alpha/coworker/conversation/stream",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "帮我看看画布。", viewport: null })
      })
    );
  });

  it("sends viewport context with a conversation stream", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(new ReadableStream<Uint8Array>(), {
        status: 200,
        headers: { "content-type": "text/event-stream; charset=utf-8" }
      })
    );

    await createCoworkerConversationStream({
      roomId: "alpha",
      message: "画一个矩形",
      serverUrl: "http://127.0.0.1:3001",
      viewport: {
        currentPageId: "page:page",
        viewportBounds: { x: -200, y: -120, w: 800, h: 600 },
        viewportCenter: { x: 200, y: 180 },
        zoom: 1
      },
      fetcher
    });

    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:3001/rooms/alpha/coworker/conversation/stream",
      expect.objectContaining({
        body: JSON.stringify({
          message: "画一个矩形",
          viewport: {
            currentPageId: "page:page",
            viewportBounds: { x: -200, y: -120, w: 800, h: 600 },
            viewportCenter: { x: 200, y: 180 },
            zoom: 1
          }
        })
      })
    );
  });

  it("returns validation errors without calling fetch", async () => {
    const fetcher = vi.fn();

    const result = await createCoworkerConversationStream({
      roomId: "alpha",
      message: "",
      serverUrl: "http://127.0.0.1:3001",
      fetcher
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" }
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("opens a server approval stream for a pending tool call", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(new ReadableStream<Uint8Array>(), {
        status: 200,
        headers: { "content-type": "text/event-stream; charset=utf-8" }
      })
    );

    const result = await createCoworkerApprovalResolutionStream({
      roomId: "alpha",
      approvalId: "11111111-1111-4111-8111-111111111111",
      decision: "approve",
      serverUrl: "http://127.0.0.1:3001",
      fetcher
    });

    expect(result.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:3001/rooms/alpha/coworker/approvals/11111111-1111-4111-8111-111111111111/resolve",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ decision: "approve" })
      })
    );
  });

  it("loads public pending approvals for room recovery", async () => {
    const approval = {
      id: "11111111-1111-4111-8111-111111111111",
      roomId: "alpha",
      capability: "canvas.edit",
      risk: "write",
      proposal: { intent: "整理画布" },
      requestedAt: "2026-07-21T06:00:00.000Z"
    };
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          roomId: "alpha",
          approvals: [
            {
              approval,
              status: "pending",
              decision: null,
              updatedAt: "2026-07-21T06:00:00.000Z",
              resolvedAt: null,
              audit: [
                {
                  kind: "requested",
                  occurredAt: "2026-07-21T06:00:00.000Z",
                  decision: null,
                  message: null
                }
              ]
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );

    const result = await loadCoworkerPendingApprovals({
      roomId: "alpha",
      serverUrl: "http://127.0.0.1:3001",
      fetcher
    });

    expect(result).toMatchObject({
      ok: true,
      approvals: [{ approval: { id: approval.id }, status: "pending" }]
    });
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:3001/rooms/alpha/coworker/approvals?status=pending",
      { method: "GET", headers: {} }
    );
  });

  it("reads coworker conversation SSE events", async () => {
    const event = {
      type: "tool-call",
      from: "AGENT",
      payload: {
        toolName: "collect-canvas-context",
        operationId: "11111111-1111-4111-8111-111111111111"
      }
    };
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(`event: tool-call\ndata: ${JSON.stringify(event)}\n\n`)
        );
        controller.close();
      }
    });
    const events: unknown[] = [];

    await readCoworkerConversationEventStream(stream, (nextEvent) => {
      events.push(nextEvent);
    });

    expect(events).toMatchObject([
      {
        type: "tool-call",
        payload: {
          toolName: "collect-canvas-context"
        }
      }
    ]);
  });
});
