import type { DrawlessCoworkerApprovalRequest } from "@drawless/shared";
import type { CoworkerConversationStatus } from "./coworker-conversation-state";
import {
  getCoworkerConversationPendingApproval,
  type CoworkerConversationTimelineBlock
} from "./coworker-conversation-timeline";

export type CoworkerPresencePhase =
  | "ready"
  | "listening"
  | "receiving"
  | "thinking"
  | "executing"
  | "speaking"
  | "awaiting-approval"
  | "completed"
  | "interrupted"
  | "error";

export type CoworkerPresenceTurn = {
  /** 本地渲染用轮次 ID。 */
  id: string;
  /** 用户在这一轮发送的原始文本。 */
  userText: string | null;
  /** 当前轮次的请求生命周期状态。 */
  status: CoworkerConversationStatus;
  /** 当前轮次按到达顺序形成的内容块。 */
  blocks: CoworkerConversationTimelineBlock[];
};

export type CoworkerPresenceView = {
  /** Coworker 当前对用户可见的单一表现阶段。 */
  phase: CoworkerPresencePhase;
  /** 适用于状态标签和无障碍播报的简短文案。 */
  statusText: string;
  /** 当前最后一轮对话；尚未开始时为 null。 */
  activeTurn: CoworkerPresenceTurn | null;
  /** 当前轮次按事件顺序合并后的完整正文；没有正文时为 null。 */
  latestText: string | null;
  /** 当前轮次仍在等待处理的审批；没有时为 null。 */
  pendingApproval: DrawlessCoworkerApprovalRequest | null;
};

export type ResolveCoworkerPresenceViewInput = {
  /** 会话控制器的当前生命周期状态。 */
  status: CoworkerConversationStatus;
  /** 当前房间内的串行会话轮次。 */
  turns: CoworkerPresenceTurn[];
  /** Composer 当前是否正在接收用户输入。 */
  inputFocused?: boolean;
};

/**
 * 从会话事实派生 Coworker 的可见表现，不保存第二份可漂移的 UI 状态。
 */
export function resolveCoworkerPresenceView(
  input: ResolveCoworkerPresenceViewInput
): CoworkerPresenceView {
  const activeTurn = input.turns[input.turns.length - 1] ?? null;
  const latestText = activeTurn
    ? getLatestConversationText(activeTurn.blocks)
    : null;
  const pendingApproval = activeTurn
    ? getCoworkerConversationPendingApproval(activeTurn.blocks)
    : null;
  const phase = resolveCoworkerPresencePhase({
    status: input.status,
    activeTurn,
    latestText,
    pendingApproval,
    inputFocused: input.inputFocused ?? false
  });

  return {
    phase,
    statusText: getCoworkerPresenceStatusText(phase),
    activeTurn,
    latestText,
    pendingApproval
  };
}

export function getCoworkerPresenceStatusText(phase: CoworkerPresencePhase) {
  const labels: Record<CoworkerPresencePhase, string> = {
    ready: "随时可以开始",
    listening: "我在听",
    receiving: "已经接住，先让我看看",
    thinking: "正在理解和思考",
    executing: "正在处理画布",
    speaking: "正在向你说明",
    "awaiting-approval": "等你确认",
    completed: "刚刚回应了你",
    interrupted: "我已经停下来了",
    error: "这次没有顺利完成"
  };

  return labels[phase];
}

function resolveCoworkerPresencePhase(input: {
  status: CoworkerConversationStatus;
  activeTurn: CoworkerPresenceTurn | null;
  latestText: string | null;
  pendingApproval: DrawlessCoworkerApprovalRequest | null;
  inputFocused: boolean;
}): CoworkerPresencePhase {
  if (input.status === "error" || input.activeTurn?.status === "error") {
    return "error";
  }
  if (
    input.pendingApproval ||
    input.status === "awaiting_approval" ||
    input.activeTurn?.status === "awaiting_approval"
  ) {
    return "awaiting-approval";
  }
  if (input.status === "receiving") {
    return "receiving";
  }
  if (input.status === "streaming") {
    const latestBlock = getLatestMeaningfulBlock(
      input.activeTurn?.blocks ?? []
    );
    if (latestBlock?.kind === "text" && input.latestText) {
      return "speaking";
    }
    if (
      latestBlock?.kind === "tool" &&
      (latestBlock.status === "input-ready" ||
        latestBlock.status === "running")
    ) {
      return "executing";
    }
    return "thinking";
  }
  if (
    input.status === "cancelled" ||
    input.activeTurn?.status === "cancelled"
  ) {
    return "interrupted";
  }
  if (input.status === "done" || input.activeTurn?.status === "done") {
    return "completed";
  }
  if (input.inputFocused) {
    return "listening";
  }
  return "ready";
}

function getLatestConversationText(
  blocks: CoworkerConversationTimelineBlock[]
) {
  const text = blocks
    .filter(
      (block): block is Extract<
        CoworkerConversationTimelineBlock,
        { kind: "text" }
      > => block.kind === "text"
    )
    .map((block) => block.text)
    .join("")
    .trim();
  return text || null;
}

function getLatestMeaningfulBlock(
  blocks: CoworkerConversationTimelineBlock[]
) {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block?.kind !== "debug") {
      return block ?? null;
    }
  }

  return null;
}
