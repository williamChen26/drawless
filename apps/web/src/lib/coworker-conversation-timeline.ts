import type {
  DrawlessCoworkerApprovalRequest,
  DrawlessCoworkerApprovalSnapshot
} from "@drawless/shared";

import type {
  CoworkerConversationEventSummary,
  CoworkerConversationOutput
} from "./coworker-conversation-output";

export type CoworkerConversationTimelineBlock =
  | CoworkerConversationTextBlock
  | CoworkerConversationToolBlock
  | CoworkerConversationDebugBlock;

export type CoworkerConversationTextBlock = {
  /** 本地渲染用 ID，不作为跨端消息事实源。 */
  id: string;
  /** 正文模块。 */
  kind: "text";
  /** Mastra text part ID；fallback textStream 没有该值时为 null。 */
  textId: string | null;
  /** 连续 text-delta 拼接出的正文。 */
  text: string;
  /** 当前正文模块是否已经收到 text-end。 */
  status: "streaming" | "done";
};

export type CoworkerConversationToolBlock = {
  /** 本地渲染用 ID，不作为跨端消息事实源。 */
  id: string;
  /** 工具模块。 */
  kind: "tool";
  /** Server 生成的公开操作 ID；用于把 input delta、approval、result 聚到一起。 */
  operationId: string;
  /** 工具名称；部分异常事件里可能缺失。 */
  toolName: string | null;
  /** 工具参数流拼接出的原始 JSON 文本。 */
  argsText: string;
  /** tool-call 或 approval 给出的最终参数。 */
  args: unknown;
  /** tool-result 返回的原始结果。 */
  result: unknown;
  /** 当前工具调用的生命周期状态。 */
  status: CoworkerConversationToolStatus;
  /** 需要用户确认的 tool call；普通工具事件为 null。 */
  approval: DrawlessCoworkerApprovalRequest | null;
  /** 与该 operationId 相关的公开 stream event。 */
  events: CoworkerConversationEventEntry[];
};

export type CoworkerConversationToolStatus =
  | "input-streaming"
  | "input-ready"
  | "awaiting-approval"
  | "running"
  | "resolved"
  | "done"
  | "declined"
  | "error";

export type CoworkerConversationDebugBlock = {
  /** 本地渲染用 ID，不作为跨端消息事实源。 */
  id: string;
  /** 非正文、非工具的调试事件模块。 */
  kind: "debug";
  /** 连续调试事件，按到达顺序保留。 */
  events: CoworkerConversationEventEntry[];
};

export type CoworkerConversationEventEntry = {
  /** 本地渲染用 ID，不作为跨端事件事实源。 */
  id: string;
  /** 当前 stream chunk 的展示摘要。 */
  summary: CoworkerConversationEventSummary;
};

export type CoworkerConversationIdFactory = () => string;

export function appendCoworkerConversationOutputBlock(
  blocks: CoworkerConversationTimelineBlock[],
  output: CoworkerConversationOutput,
  createId: CoworkerConversationIdFactory
): CoworkerConversationTimelineBlock[] {
  const type = output.event.type;

  if (output.kind === "text-delta") {
    return output.text
      ? appendTextChunk(blocks, output.text, getTextId(output.raw), createId)
      : blocks;
  }

  if (type === "text-end") {
    return completeTextBlock(blocks, getTextId(output.raw));
  }

  if (isToolLifecycleEvent(type)) {
    return appendToolEvent(blocks, output.event, createId);
  }

  if (isIgnoredControlEvent(type)) {
    return blocks;
  }

  return appendDebugEvent(blocks, output.event, createId);
}

export function appendCoworkerConversationTextChunk(
  blocks: CoworkerConversationTimelineBlock[],
  chunk: string,
  createId: CoworkerConversationIdFactory
): CoworkerConversationTimelineBlock[] {
  return appendTextChunk(blocks, chunk, null, createId);
}

export function getCoworkerConversationPendingApproval(
  blocks: CoworkerConversationTimelineBlock[]
): DrawlessCoworkerApprovalRequest | null {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block?.kind === "tool" && block.status === "awaiting-approval") {
      return block.approval;
    }
  }

  return null;
}

export function setCoworkerConversationToolStatus(
  blocks: CoworkerConversationTimelineBlock[],
  approvalId: string,
  status: Extract<
    CoworkerConversationToolStatus,
    "running" | "resolved" | "declined" | "awaiting-approval" | "error"
  >
): CoworkerConversationTimelineBlock[] {
  return blocks.map((block) =>
    block.kind === "tool" && block.approval?.id === approvalId
      ? {
          ...block,
          status
        }
      : block
  );
}

/**
 * 从 server 的公开生命周期快照恢复待审批工具块，不复制 runtime 私有标识。
 */
export function createRecoveredCoworkerApprovalBlocks(
  approvals: DrawlessCoworkerApprovalSnapshot[]
): CoworkerConversationToolBlock[] {
  return approvals
    .filter((snapshot) => snapshot.status === "pending")
    .map(({ approval }) => ({
      id: `recovered-approval:${approval.id}`,
      kind: "tool",
      operationId: approval.id,
      toolName: getToolNameForCapability(approval.capability),
      argsText: "",
      args: approval.proposal,
      result: null,
      status: "awaiting-approval",
      approval,
      events: []
    }));
}

function appendTextChunk(
  blocks: CoworkerConversationTimelineBlock[],
  chunk: string,
  textId: string | null,
  createId: CoworkerConversationIdFactory
): CoworkerConversationTimelineBlock[] {
  const lastBlock = blocks[blocks.length - 1];
  if (
    lastBlock?.kind === "text" &&
    lastBlock.status === "streaming" &&
    isSameTextPart(lastBlock.textId, textId)
  ) {
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
      textId,
      text: chunk,
      status: "streaming"
    }
  ];
}

function completeTextBlock(
  blocks: CoworkerConversationTimelineBlock[],
  textId: string | null
): CoworkerConversationTimelineBlock[] {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block?.kind === "text" && isSameTextPart(block.textId, textId)) {
      return [
        ...blocks.slice(0, index),
        {
          ...block,
          status: "done"
        },
        ...blocks.slice(index + 1)
      ];
    }
  }

  return blocks;
}

function appendToolEvent(
  blocks: CoworkerConversationTimelineBlock[],
  summary: CoworkerConversationEventSummary,
  createId: CoworkerConversationIdFactory
): CoworkerConversationTimelineBlock[] {
  const operationId = getOperationId(summary.raw) ?? summary.approval?.id;
  if (!operationId) {
    return appendDebugEvent(blocks, summary, createId);
  }

  const event = { id: createId(), summary };
  const index = blocks.findIndex(
    (block) => block.kind === "tool" && block.operationId === operationId
  );
  const current =
    index >= 0 && blocks[index]?.kind === "tool"
      ? (blocks[index] as CoworkerConversationToolBlock)
      : createToolBlock({
          createId,
          operationId,
          toolName: getToolName(summary.raw)
        });
  const next = updateToolBlock(current, summary, event);

  if (index < 0) {
    return [...blocks, next];
  }

  return [...blocks.slice(0, index), next, ...blocks.slice(index + 1)];
}

function createToolBlock(input: {
  createId: CoworkerConversationIdFactory;
  operationId: string;
  toolName: string | null;
}): CoworkerConversationToolBlock {
  return {
    id: input.createId(),
    kind: "tool",
    operationId: input.operationId,
    toolName: input.toolName,
    argsText: "",
    args: null,
    result: null,
    status: "input-streaming",
    approval: null,
    events: []
  };
}

function updateToolBlock(
  block: CoworkerConversationToolBlock,
  summary: CoworkerConversationEventSummary,
  event: CoworkerConversationEventEntry
): CoworkerConversationToolBlock {
  const type = summary.type;
  const argsTextDelta = getArgsTextDelta(summary.raw);
  const nextArgsText = argsTextDelta
    ? `${block.argsText}${argsTextDelta}`
    : block.argsText;
  const explicitArgs = getToolArgs(summary.raw) ?? summary.approval?.proposal;
  const nextArgs = explicitArgs ?? parseArgsText(nextArgsText) ?? block.args;
  const explicitResult = getToolResult(summary.raw);
  const toolName = getToolName(summary.raw) ?? block.toolName;

  return {
    ...block,
    toolName,
    argsText: nextArgsText,
    args: nextArgs,
    result: explicitResult ?? block.result,
    status: getNextToolStatus(type, block.status),
    approval: summary.approval ?? block.approval,
    events: [...block.events, event]
  };
}

function appendDebugEvent(
  blocks: CoworkerConversationTimelineBlock[],
  summary: CoworkerConversationEventSummary,
  createId: CoworkerConversationIdFactory
): CoworkerConversationTimelineBlock[] {
  const event = { id: createId(), summary };
  const lastBlock = blocks[blocks.length - 1];
  if (lastBlock?.kind === "debug") {
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
      kind: "debug",
      events: [event]
    }
  ];
}

function getNextToolStatus(
  type: string,
  current: CoworkerConversationToolStatus
): CoworkerConversationToolStatus {
  if (type === "tool-result") {
    return "done";
  }
  if (type === "tool-call-approval") {
    return "awaiting-approval";
  }
  if (type === "tool-call" || type === "tool-call-input-streaming-end") {
    return current === "awaiting-approval" ? current : "input-ready";
  }
  if (type === "error") {
    return "error";
  }
  return current === "awaiting-approval" ? current : "input-streaming";
}

function isSameTextPart(currentTextId: string | null, nextTextId: string | null) {
  return currentTextId === nextTextId || currentTextId === null || nextTextId === null;
}

function isToolLifecycleEvent(type: string) {
  return (
    type === "tool-call-input-streaming-start" ||
    type === "tool-call-delta" ||
    type === "tool-call-input-streaming-end" ||
    type === "tool-call" ||
    type === "tool-call-approval" ||
    type === "tool-result"
  );
}

function isIgnoredControlEvent(type: string) {
  return (
    type === "drawless-run" ||
    type === "start" ||
    type === "step-start" ||
    type === "step-finish" ||
    type === "text-start" ||
    type === "finish"
  );
}

function parseArgsText(argsText: string) {
  if (!argsText.trim()) {
    return null;
  }

  try {
    return JSON.parse(argsText) as unknown;
  } catch {
    return null;
  }
}

function getTextId(event: unknown) {
  const payload = getObjectField(event, "payload");
  return getStringField(payload, "id") ?? getStringField(event, "id");
}

function getOperationId(event: unknown) {
  const payload = getObjectField(event, "payload");
  return (
    getStringField(payload, "operationId") ??
    getStringField(event, "operationId")
  );
}

function getToolNameForCapability(capability: string) {
  if (capability === "canvas.edit") {
    return "edit-canvas";
  }
  return null;
}

function getToolName(event: unknown) {
  const payload = getObjectField(event, "payload");
  return (
    getStringField(payload, "toolName") ??
    getStringField(payload, "name") ??
    getStringField(event, "toolName") ??
    getStringField(event, "name")
  );
}

function getArgsTextDelta(event: unknown) {
  const payload = getObjectField(event, "payload");
  return getStringField(payload, "argsTextDelta") ?? getStringField(event, "argsTextDelta");
}

function getToolArgs(event: unknown) {
  const payload = getObjectField(event, "payload");
  return (
    getUnknownField(payload, "args") ??
    getUnknownField(payload, "input") ??
    getUnknownField(event, "args") ??
    getUnknownField(event, "input")
  );
}

function getToolResult(event: unknown) {
  const payload = getObjectField(event, "payload");
  return (
    getUnknownField(payload, "result") ??
    getUnknownField(payload, "output") ??
    getUnknownField(event, "result") ??
    getUnknownField(event, "output")
  );
}

function getObjectField(input: unknown, key: string) {
  if (!input || typeof input !== "object" || !(key in input)) {
    return null;
  }

  const value = (input as Record<string, unknown>)[key];
  return value && typeof value === "object" ? value : null;
}

function getUnknownField(input: unknown, key: string) {
  if (!input || typeof input !== "object" || !(key in input)) {
    return null;
  }

  return (input as Record<string, unknown>)[key];
}

function getStringField(input: unknown, key: string) {
  if (!input || typeof input !== "object" || !(key in input)) {
    return null;
  }

  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}
