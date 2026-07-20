import {
  canvasEditRequestSchema,
  canvasEditResultSchema,
  type DrawlessCanvasEditOperation
} from "@drawless/shared";

import type { CoworkerConversationToolApproval } from "./coworker-conversation-output";
import type { CoworkerConversationTimelineBlock } from "./coworker-conversation-timeline";

export type CoworkerApprovalSummary = {
  /** 审批工作单标题。 */
  title: string;
  /** 用户可以快速理解的操作意图。 */
  intent: string;
  /** 已通过 shared schema 校验的操作总数；未知工具为 null。 */
  operationCount: number | null;
  /** 审批卡上展示的确定性操作摘要。 */
  operationSummary: string | null;
  /** 审批影响范围的可读说明。 */
  scope: string;
  /** 是否可以展示结构化画布修改计划。 */
  structured: boolean;
  /** 当前参数是否允许用户继续批准。 */
  canApprove: boolean;
  /** 参数不可执行时给用户的明确说明。 */
  validationMessage: string | null;
};

export type CoworkerResultSummary = {
  /** Coworker 返回的人类可读结果摘要。 */
  summary: string;
  /** 可重新向 tldraw store 查询的 record ID，不复制 shape 数据。 */
  recordIds: string[];
  /** 执行期间产生的警告。 */
  warnings: string[];
};

/**
 * 审批卡只展示 shared 契约可以证明的信息，避免前端根据任意工具参数猜测风险。
 */
export function createCoworkerApprovalSummary(
  approval: CoworkerConversationToolApproval
): CoworkerApprovalSummary {
  if (approval.toolName !== "edit-canvas") {
    return createGenericApprovalSummary(approval.toolName);
  }

  const result = canvasEditRequestSchema.safeParse(
    parseStructuredToolArguments(approval.args)
  );
  if (!result.success) {
    return createInvalidCanvasApprovalSummary();
  }

  const counts = countCanvasEditOperations(result.data.operations);
  const operationSummary = [
    formatOperationCount(counts.create, "新增"),
    formatOperationCount(counts.update, "更新"),
    formatOperationCount(counts.move, "移动"),
    formatOperationCount(counts.resize, "调整尺寸"),
    formatOperationCount(counts.connect, "连接")
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");

  return {
    title: "我准备修改当前画布",
    intent: result.data.intent,
    operationCount: result.data.operations.length,
    operationSummary,
    scope: result.data.currentPageId ? "当前页面" : "当前画布",
    structured: true,
    canApprove: true,
    validationMessage: null
  };
}

/**
 * 从工具结果中只提取展示信息和 record ID，tldraw document 继续作为形状事实源。
 */
export function createCoworkerResultSummary(
  result: unknown
): CoworkerResultSummary | null {
  const parsed = canvasEditResultSchema.safeParse(result);
  if (!parsed.success) {
    return null;
  }

  return {
    summary: parsed.data.summary,
    recordIds: Array.from(
      new Set([
        ...parsed.data.createdRecordIds,
        ...parsed.data.updatedRecordIds
      ])
    ),
    warnings: parsed.data.warnings
  };
}

export function getConversationPlainText(
  blocks: CoworkerConversationTimelineBlock[]
) {
  return blocks
    .filter(
      (block): block is Extract<
        CoworkerConversationTimelineBlock,
        { kind: "text" }
      > => block.kind === "text"
    )
    .map((block) => block.text)
    .join("")
    .trim();
}

/**
 * 对话气泡只展示最后一个语义段，完整正文仍保留在工作记录中。
 */
export function getLatestSemanticSegment(text: string, maxLength = 120) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  const segments = normalized.match(/[^。！？!?\n]+[。！？!?]?/g) ?? [normalized];
  const latest = segments.at(-1)?.trim() ?? normalized;
  if (latest.length <= maxLength) {
    return latest;
  }
  return `${latest.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

export function getLatestCanvasEditResult(
  blocks: CoworkerConversationTimelineBlock[]
) {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block?.kind !== "tool" || block.toolName !== "edit-canvas") {
      continue;
    }
    const summary = createCoworkerResultSummary(block.result);
    if (summary) {
      return summary;
    }
  }
  return null;
}

function createGenericApprovalSummary(
  toolName: string | null
): CoworkerApprovalSummary {
  return {
    title: "我需要你的确认",
    intent: toolName ? `准备运行 ${toolName}` : "准备继续执行下一步操作",
    operationCount: null,
    operationSummary: null,
    scope: "当前任务",
    structured: false,
    canApprove: true,
    validationMessage: null
  };
}

function createInvalidCanvasApprovalSummary(): CoworkerApprovalSummary {
  return {
    title: "这个画布计划还不能执行",
    intent: "计划参数没有通过画布编辑契约校验。",
    operationCount: null,
    operationSummary: null,
    scope: "当前画布",
    structured: false,
    canApprove: false,
    validationMessage: "请暂不执行，并让 Coworker 重新生成计划。"
  };
}

function parseStructuredToolArguments(args: unknown) {
  if (typeof args !== "string") {
    return args;
  }

  try {
    return JSON.parse(args) as unknown;
  } catch {
    return args;
  }
}

function countCanvasEditOperations(operations: DrawlessCanvasEditOperation[]) {
  return operations.reduce(
    (counts, operation) => {
      if (operation.kind === "create_shape") {
        counts.create += 1;
      } else if (operation.kind === "create_arrow") {
        counts.connect += 1;
      } else if (operation.kind === "move_shape") {
        counts.move += 1;
      } else if (operation.kind === "resize_shape") {
        counts.resize += 1;
      } else {
        counts.update += 1;
      }
      return counts;
    },
    { create: 0, update: 0, move: 0, resize: 0, connect: 0 }
  );
}

function formatOperationCount(count: number, label: string) {
  return count > 0 ? `${label} ${count} 项` : null;
}
