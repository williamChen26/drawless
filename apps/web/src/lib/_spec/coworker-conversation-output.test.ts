import { describe, expect, it } from "vitest";

import { createCoworkerConversationOutput } from "../coworker-conversation-output";

describe("coworker conversation output processor", () => {
  it("keeps tool events as complete raw chunks", () => {
    const event = {
      type: "tool-call",
      runId: "run-1",
      from: "AGENT",
      payload: {
        toolName: "collect-canvas-context",
        toolCallId: "call-1",
        args: { roomId: "alpha" }
      }
    };

    expect(createCoworkerConversationOutput(event)).toEqual({
      kind: "tool",
      event: {
        type: "tool-call",
        label: "工具调用",
        detail: "collect-canvas-context",
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
        raw: event
      },
      raw: event
    });
  });
});
