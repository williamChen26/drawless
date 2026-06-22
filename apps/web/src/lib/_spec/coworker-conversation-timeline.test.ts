import { describe, expect, it } from "vitest";

import { createCoworkerConversationOutput } from "../coworker-conversation-output";
import {
  appendCoworkerConversationOutputBlock,
  getCoworkerConversationPendingApproval,
  setCoworkerConversationToolStatus,
  type CoworkerConversationTimelineBlock
} from "../coworker-conversation-timeline";

describe("coworker conversation timeline", () => {
  it("normalizes text and tool lifecycle chunks into serial blocks", () => {
    const createId = createIdSequence();
    let blocks: CoworkerConversationTimelineBlock[] = [];

    blocks = appendEvent(blocks, { type: "text-start", payload: { id: "txt-0" } }, createId);
    blocks = appendEvent(
      blocks,
      { type: "text-delta", payload: { id: "txt-0", text: "我先看看。" } },
      createId
    );
    blocks = appendEvent(blocks, { type: "text-end", payload: { id: "txt-0" } }, createId);
    blocks = appendEvent(
      blocks,
      {
        type: "tool-call-input-streaming-start",
        payload: { toolCallId: "call-1", toolName: "collect-canvas-context" }
      },
      createId
    );
    blocks = appendEvent(
      blocks,
      {
        type: "tool-call-delta",
        payload: {
          toolCallId: "call-1",
          toolName: "collect-canvas-context",
          argsTextDelta: "{\"roomId\":"
        }
      },
      createId
    );
    blocks = appendEvent(
      blocks,
      {
        type: "tool-call-delta",
        payload: {
          toolCallId: "call-1",
          toolName: "collect-canvas-context",
          argsTextDelta: "\"alpha\"}"
        }
      },
      createId
    );
    blocks = appendEvent(
      blocks,
      {
        type: "tool-call",
        payload: {
          toolCallId: "call-1",
          toolName: "collect-canvas-context",
          args: { roomId: "alpha" }
        }
      },
      createId
    );
    blocks = appendEvent(
      blocks,
      {
        type: "tool-call-approval",
        runId: "run-1",
        payload: {
          toolCallId: "call-1",
          toolName: "collect-canvas-context",
          args: { roomId: "alpha" }
        }
      },
      createId
    );

    expect(blocks).toMatchObject([
      {
        kind: "text",
        text: "我先看看。",
        status: "done"
      },
      {
        kind: "tool",
        toolCallId: "call-1",
        toolName: "collect-canvas-context",
        argsText: "{\"roomId\":\"alpha\"}",
        args: { roomId: "alpha" },
        status: "awaiting-approval"
      }
    ]);
    expect(getCoworkerConversationPendingApproval(blocks)).toMatchObject({
      runId: "run-1",
      toolCallId: "call-1"
    });

    blocks = setCoworkerConversationToolStatus(
      blocks,
      {
        runId: "run-1",
        toolCallId: "call-1",
        toolName: "collect-canvas-context",
        args: { roomId: "alpha" }
      },
      "running"
    );
    blocks = appendEvent(
      blocks,
      {
        type: "tool-result",
        payload: {
          toolCallId: "call-1",
          toolName: "collect-canvas-context",
          result: { available: true }
        }
      },
      createId
    );
    blocks = appendEvent(
      blocks,
      { type: "text-delta", payload: { id: "txt-1", text: "画布是空的。" } },
      createId
    );

    expect(blocks).toMatchObject([
      { kind: "text", text: "我先看看。" },
      {
        kind: "tool",
        status: "done",
        result: { available: true }
      },
      { kind: "text", text: "画布是空的。" }
    ]);
  });

  it("ignores known control events and keeps unknown events in debug blocks", () => {
    const createId = createIdSequence();
    let blocks: CoworkerConversationTimelineBlock[] = [];

    for (const event of [
      { type: "drawless-run", runId: "run-1" },
      { type: "start", runId: "run-1" },
      { type: "step-start", runId: "run-1" },
      { type: "step-finish", runId: "run-1" },
      { type: "finish", runId: "run-1" }
    ]) {
      blocks = appendEvent(blocks, event, createId);
    }

    expect(blocks).toEqual([]);

    blocks = appendEvent(blocks, { type: "provider-warning", message: "careful" }, createId);

    expect(blocks).toMatchObject([
      {
        kind: "debug",
        events: [{ summary: { type: "provider-warning" } }]
      }
    ]);
  });
});

function appendEvent(
  blocks: CoworkerConversationTimelineBlock[],
  event: unknown,
  createId: () => string
) {
  return appendCoworkerConversationOutputBlock(
    blocks,
    createCoworkerConversationOutput(event),
    createId
  );
}

function createIdSequence() {
  let index = 0;
  return () => `id-${index++}`;
}
