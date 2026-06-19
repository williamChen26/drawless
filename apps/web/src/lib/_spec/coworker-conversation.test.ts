import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createCoworkerConversationStream,
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
        body: JSON.stringify({ message: "帮我看看画布。" })
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

  it("reads coworker conversation SSE events", async () => {
    const event = {
      type: "tool-call",
      from: "AGENT",
      payload: {
        toolName: "collect-canvas-context",
        toolCallId: "call-1"
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
