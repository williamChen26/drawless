import { describe, expect, it } from "vitest";

import {
  resolveCoworkerPresenceView,
  type CoworkerPresenceTurn
} from "../coworker-presence-state";
import type { CoworkerConversationTimelineBlock } from "../coworker-conversation-timeline";

describe("resolveCoworkerPresenceView", () => {
  it("derives ready and listening without creating a conversation turn", () => {
    expect(resolveView("idle").phase).toBe("ready");
    expect(resolveView("idle", [], true).phase).toBe("listening");
  });

  it("separates receiving from thinking before content arrives", () => {
    const turn = createTurn("receiving");
    expect(resolveView("receiving", [turn]).phase).toBe("receiving");
    expect(
      resolveView("streaming", [{ ...turn, status: "streaming" }]).phase
    ).toBe("thinking");
  });

  it("uses the latest meaningful block to distinguish executing and speaking", () => {
    const toolBlock = createToolBlock("running");
    const executing = resolveView("streaming", [
      createTurn("streaming", [toolBlock])
    ]);
    expect(executing.phase).toBe("executing");

    const speaking = resolveView("streaming", [
      createTurn("streaming", [toolBlock, createTextBlock("已经处理好了")])
    ]);
    expect(speaking.phase).toBe("speaking");
    expect(speaking.latestText).toBe("已经处理好了");
  });

  it("keeps approval ahead of streaming presentation states", () => {
    const approvalBlock = createToolBlock("awaiting-approval");
    const view = resolveView("streaming", [
      createTurn("streaming", [approvalBlock])
    ]);

    expect(view.phase).toBe("awaiting-approval");
    expect(view.pendingApproval).toEqual({
      runId: "run-1",
      toolCallId: "call-1",
      toolName: "update-canvas",
      args: { shapeIds: ["shape-1"] }
    });
  });

  it("keeps the completed result visible while the composer remains focused", () => {
    const turn = createTurn("done", [createTextBlock("完成")]);
    expect(resolveView("done", [turn]).phase).toBe("completed");
    expect(resolveView("done", [turn], true).phase).toBe("completed");
  });

  it("gives error precedence and exposes a cancelled interruption", () => {
    expect(
      resolveView("error", [createTurn("error", [createTextBlock("失败")])])
        .phase
    ).toBe("error");
    expect(
      resolveView("cancelled", [createTurn("cancelled")]).phase
    ).toBe("interrupted");
  });

  it("combines separated text blocks into one complete expression", () => {
    const view = resolveView("done", [
      createTurn("done", [
        createTextBlock("第一段。"),
        createToolBlock("running"),
        createTextBlock("第二段。")
      ])
    ]);

    expect(view.latestText).toBe("第一段。第二段。");
  });

  it("returns stable active-turn and status metadata for the UI", () => {
    const first = createTurn("done", [createTextBlock("旧结果")], "turn-1");
    const active = createTurn(
      "streaming",
      [createTextBlock("最新结果")],
      "turn-2"
    );
    const view = resolveView("streaming", [first, active]);

    expect(view.activeTurn).toBe(active);
    expect(view.latestText).toBe("最新结果");
    expect(view.statusText).toBe("正在向你说明");
  });
});

function resolveView(
  status: CoworkerPresenceTurn["status"],
  turns: CoworkerPresenceTurn[] = [],
  inputFocused = false
) {
  return resolveCoworkerPresenceView({ status, turns, inputFocused });
}

function createTurn(
  status: CoworkerPresenceTurn["status"],
  blocks: CoworkerConversationTimelineBlock[] = [],
  id = "turn-1"
): CoworkerPresenceTurn {
  return {
    id,
    userText: "帮我整理画布",
    runId: "run-1",
    status,
    blocks
  };
}

function createTextBlock(
  text: string
): CoworkerConversationTimelineBlock {
  return {
    id: `text-${text}`,
    kind: "text",
    textId: "text-1",
    text,
    status: "streaming"
  };
}

function createToolBlock(
  status: "running" | "awaiting-approval"
): CoworkerConversationTimelineBlock {
  return {
    id: "tool-1",
    kind: "tool",
    toolCallId: "call-1",
    toolName: "update-canvas",
    argsText: '{"shapeIds":["shape-1"]}',
    args: { shapeIds: ["shape-1"] },
    result: null,
    status,
    approval:
      status === "awaiting-approval"
        ? {
            runId: "run-1",
            toolCallId: "call-1",
            toolName: "update-canvas",
            args: { shapeIds: ["shape-1"] }
          }
        : null,
    events: []
  };
}
