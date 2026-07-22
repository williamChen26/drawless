import { describe, expect, it } from "vitest";

import { createCoworkerConversationOutput } from "../coworker-conversation-output";

describe("coworker conversation output processor", () => {
  it("keeps tool events as complete raw chunks", () => {
    const event = {
      type: "tool-call",
      from: "AGENT",
      payload: {
        toolName: "collect-canvas-context",
        operationId: "11111111-1111-4111-8111-111111111111",
        args: { roomId: "alpha" }
      }
    };

    expect(createCoworkerConversationOutput(event)).toEqual({
      kind: "tool",
      event: {
        type: "tool-call",
        label: "工具调用",
        detail: "collect-canvas-context",
        approval: null,
        raw: event
      },
      raw: event
    });
  });

  it("extracts only payload text from text-delta chunks", () => {
    const output = createCoworkerConversationOutput({
      type: "text-delta",
      runId: "bec942c7-def5-440c-b8c0-e16c01c968a4",
      from: "AGENT",
      payload: {
        id: "txt-0",
        text: "你好"
      }
    });

    expect(output).toMatchObject({
      kind: "text-delta",
      text: "你好",
      event: {
        type: "text-delta",
        label: "正文增量",
        detail: "2 字符"
      }
    });
  });

  it("preserves consecutive text-delta chunks as text increments", () => {
    const events = [
      {
        type: "text-delta",
        payload: { id: "txt-0", text: "你" }
      },
      {
        type: "text-delta",
        payload: { id: "txt-0", text: "好" }
      }
    ];

    const text = events
      .map(createCoworkerConversationOutput)
      .filter((output) => output.kind === "text-delta")
      .map((output) => output.text)
      .join("");

    expect(text).toBe("你好");
  });

  it("summarizes stream error chunks for the current reply", () => {
    const event = {
      type: "error",
      error: { message: "stream failed" }
    };

    expect(createCoworkerConversationOutput(event)).toEqual({
      kind: "raw",
      event: {
        type: "error",
        label: "流式错误",
        detail: "stream failed",
        approval: null,
        raw: event
      },
      raw: event
    });
  });

  it("summarizes tool approval chunks with the pending tool call", () => {
    const event = {
      type: "tool-call-approval",
      operationId: "11111111-1111-4111-8111-111111111111",
      approval: {
        id: "11111111-1111-4111-8111-111111111111",
        roomId: "alpha",
        capability: "canvas.edit",
        risk: "write",
        proposal: {
          roomId: "alpha",
          intent: "画一个节点",
          operations: []
        },
        requestedAt: "2026-07-21T06:00:00.000Z"
      },
      payload: {
        toolName: "edit-canvas",
        operationId: "11111111-1111-4111-8111-111111111111",
        args: {
          roomId: "alpha",
          intent: "画一个节点",
          operations: []
        }
      }
    };

    expect(createCoworkerConversationOutput(event)).toEqual({
      kind: "tool",
      event: {
        type: "tool-call-approval",
        label: "等待确认",
        detail: "canvas.edit",
        approval: event.approval,
        raw: event
      },
      raw: event
    });
  });
});
