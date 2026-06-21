import type {
  CoworkerConversationEventSummary,
  CoworkerConversationToolApproval
} from "./coworker-conversation-output";

export type CoworkerConversationTimelineBlock =
  | {
      /** 本地渲染用 ID，不作为跨端消息事实源。 */
      id: string;
      /** 正文 text-delta 连续片段。 */
      kind: "text";
      /** 连续 text-delta 拼接出的正文。 */
      text: string;
    }
  | {
      /** 本地渲染用 ID，不作为跨端消息事实源。 */
      id: string;
      /** 连续非正文 stream event 片段。 */
      kind: "events";
      /** 当前 event block 内按到达顺序保留的事件。 */
      events: CoworkerConversationEventEntry[];
    };

export type CoworkerConversationEventEntry = {
  /** 本地渲染用 ID，不作为跨端事件事实源。 */
  id: string;
  /** 当前 stream chunk 的展示摘要。 */
  summary: CoworkerConversationEventSummary;
};

export type CoworkerConversationIdFactory = () => string;

export function appendCoworkerConversationTextBlock(
  blocks: CoworkerConversationTimelineBlock[],
  chunk: string,
  createId: CoworkerConversationIdFactory
): CoworkerConversationTimelineBlock[] {
  const lastBlock = blocks[blocks.length - 1];
  if (lastBlock?.kind === "text") {
    return [
      ...blocks.slice(0, -1),
      {
        ...lastBlock,
        text: `${lastBlock.text}${chunk}`
      }
    ];
  }

  return [
    ...blocks,
    {
      id: createId(),
      kind: "text",
      text: chunk
    }
  ];
}

export function appendCoworkerConversationEventBlock(
  blocks: CoworkerConversationTimelineBlock[],
  summary: CoworkerConversationEventSummary,
  createId: CoworkerConversationIdFactory
): CoworkerConversationTimelineBlock[] {
  const event = { id: createId(), summary };
  const lastBlock = blocks[blocks.length - 1];
  if (lastBlock?.kind === "events") {
    return [
      ...blocks.slice(0, -1),
      {
        ...lastBlock,
        events: [...lastBlock.events, event]
      }
    ];
  }

  return [
    ...blocks,
    {
      id: createId(),
      kind: "events",
      events: [event]
    }
  ];
}

export function getCoworkerConversationPendingApproval(
  blocks: CoworkerConversationTimelineBlock[]
): CoworkerConversationToolApproval | null {
  for (let blockIndex = blocks.length - 1; blockIndex >= 0; blockIndex -= 1) {
    const block = blocks[blockIndex];
    if (!block || block.kind !== "events") {
      continue;
    }

    for (let eventIndex = block.events.length - 1; eventIndex >= 0; eventIndex -= 1) {
      const approval = block.events[eventIndex]?.summary.approval;
      if (approval) {
        return approval;
      }
    }
  }

  return null;
}

export function hasCoworkerConversationApproval(
  block: CoworkerConversationTimelineBlock,
  approval: CoworkerConversationToolApproval
) {
  return (
    block.kind === "events" &&
    block.events.some(
      (event) =>
        event.summary.approval?.toolCallId === approval.toolCallId &&
        event.summary.approval.runId === approval.runId
    )
  );
}
