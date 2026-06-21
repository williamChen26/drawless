import { describe, expect, it } from "vitest";

import type {
  CoworkerConversationEventSummary,
  CoworkerConversationToolApproval
} from "../coworker-conversation-output";
import {
  appendCoworkerConversationEventBlock,
  appendCoworkerConversationTextBlock,
  getCoworkerConversationPendingApproval,
  hasCoworkerConversationApproval,
  type CoworkerConversationTimelineBlock
} from "../coworker-conversation-timeline";

describe("coworker conversation timeline", () => {
  it("segments text and events by stream arrival order", () => {
    const createId = createIdSequence();
    let blocks: CoworkerConversationTimelineBlock[] = [];

    blocks = appendCoworkerConversationTextBlock(blocks, "先说", createId);
    blocks = appendCoworkerConversationTextBlock(blocks, "正文", createId);
    blocks = appendCoworkerConversationEventBlock(
      blocks,
      createSummary("tool-call"),
      createId
    );
    blocks = appendCoworkerConversationEventBlock(
      blocks,
      createSummary("tool-result"),
      createId
    );
    blocks = appendCoworkerConversationTextBlock(blocks, "再继续", createId);

    expect(blocks).toMatchObject([
      {
        kind: "text",
        text: "先说正文"
      },
      {
        kind: "events",
        events: [
          { summary: { type: "tool-call" } },
          { summary: { type: "tool-result" } }
        ]
      },
      {
        kind: "text",
        text: "再继续"
      }
    ]);
  });

  it("finds the pending approval in its event block", () => {
    const createId = createIdSequence();
    const approval = {
      runId: "run-1",
      toolCallId: "call-1",
      toolName: "edit-canvas",
      args: { roomId: "alpha" }
    };
    let blocks: CoworkerConversationTimelineBlock[] = [];

    blocks = appendCoworkerConversationTextBlock(blocks, "我需要确认。", createId);
    blocks = appendCoworkerConversationEventBlock(
      blocks,
      createSummary("tool-call-approval", approval),
      createId
    );

    const eventBlock = blocks[1];
    expect(getCoworkerConversationPendingApproval(blocks)).toBe(approval);
    expect(
      eventBlock ? hasCoworkerConversationApproval(eventBlock, approval) : false
    ).toBe(true);
  });
});

function createIdSequence() {
  let index = 0;
  return () => `id-${index++}`;
}

function createSummary(
  type: string,
  approval: CoworkerConversationToolApproval | null = null
): CoworkerConversationEventSummary {
  return {
    type,
    label: type,
    detail: null,
    runId: approval?.runId ?? null,
    approval,
    raw: { type }
  };
}
