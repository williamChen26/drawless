import {
  DRAWLESS_COWORKER_DISPLAY_NAME,
  canvasEditRequestSchema,
  canvasEditResultSchema,
  type DrawlessCanvasEditOperation,
  type DrawlessCoworkerApprovalRequest
} from "@drawless/shared";

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
  /** 按真实执行顺序展示的可审阅操作明细。 */
  operations: CoworkerApprovalOperationSummary[];
  /** 审批影响范围的可读说明。 */
  scope: string;
  /** 是否可以展示结构化画布修改计划。 */
  structured: boolean;
  /** 当前参数是否允许用户继续批准。 */
  canApprove: boolean;
  /** 参数不可执行时给用户的明确说明。 */
  validationMessage: string | null;
};

export type CoworkerApprovalOperationSummary = {
  /** 用于列表渲染的稳定操作 ID。 */
  id: string;
  /** 用户可快速扫描的操作类别。 */
  action: "新增" | "改字" | "移动" | "缩放" | "连接";
  /** 不暴露内部 ID 的操作标题。 */
  title: string;
  /** 对结果位置、尺寸或语义的补充说明。 */
  detail: string | null;
  /** 可以从当前 tldraw document 即时定位的现有对象。 */
  targetRecordIds: string[];
};

export type CoworkerCanvasTargetReference = {
  /** 从当前 tldraw document 即时读取的对象文字。 */
  label: string | null;
  /** 从当前 tldraw document 即时读取的对象类型。 */
  shapeKind: string | null;
};

export type CoworkerCanvasTargetResolver = (
  shapeId: string
) => CoworkerCanvasTargetReference | null;

export type CoworkerResultSummary = {
  /** 根据真实写入和警告派生的交付结果。 */
  outcome: "success" | "partial" | "not-applied";
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
  approval: DrawlessCoworkerApprovalRequest,
  resolveCanvasTarget?: CoworkerCanvasTargetResolver
): CoworkerApprovalSummary {
  const presenter = COWORKER_APPROVAL_PRESENTERS[approval.capability];
  return presenter
    ? presenter(approval, resolveCanvasTarget)
    : createGenericApprovalSummary(approval.capability);
}

const COWORKER_APPROVAL_PRESENTERS: Record<
  string,
  (
    approval: DrawlessCoworkerApprovalRequest,
    resolveCanvasTarget?: CoworkerCanvasTargetResolver
  ) => CoworkerApprovalSummary
> = {
  "canvas.edit": createCanvasEditApprovalSummary
};

function createCanvasEditApprovalSummary(
  approval: DrawlessCoworkerApprovalRequest,
  resolveCanvasTarget?: CoworkerCanvasTargetResolver
): CoworkerApprovalSummary {
  const result = canvasEditRequestSchema.safeParse(
    parseStructuredToolArguments(approval.proposal)
  );
  if (!result.success) {
    return createInvalidCanvasApprovalSummary();
  }

  const counts = countCanvasEditOperations(result.data.operations);
  const operations = createCanvasEditOperationSummaries(
    result.data.operations,
    resolveCanvasTarget
  );
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
    operations,
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
    outcome:
      !parsed.data.applied ||
      parsed.data.createdRecordIds.length + parsed.data.updatedRecordIds.length === 0
        ? "not-applied"
        : parsed.data.warnings.length > 0
          ? "partial"
          : "success",
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

/**
 * 把模型常见的 Markdown 控制语法整理成适合浮层表达的纯文本。
 */
export function normalizeCoworkerExpression(text: string) {
  return text
    .replace(/^[\t ]*[-_]{3,}[\t ]*$/gmu, "")
    .replace(/^[\t ]*```[^\n]*$/gmu, "")
    .replace(/^[\t ]*\|?[\t ]*:?-{3,}:?[\t ]*(?:\|[\t ]*:?-{3,}:?[\t ]*)+\|?[\t ]*$/gmu, "")
    .replace(/^[\t ]*\|(.+)\|[\t ]*$/gmu, (_line, cells: string) =>
      cells
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean)
        .join(" · ")
    )
    .replace(/^#{1,6}\s+/gmu, "")
    .replace(/\*\*([^*]+)\*\*/gu, "$1")
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

export function splitSemanticParagraphs(text: string) {
  return normalizeCoworkerExpression(text)
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
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
  capability: string
): CoworkerApprovalSummary {
  return {
    title: "这份计划暂时不能执行",
    intent: capability !== "unknown"
      ? `当前界面还不能安全审核 ${capability}。`
      : "当前计划缺少可以审核的工具信息。",
    operationCount: null,
    operationSummary: null,
    operations: [],
    scope: "未知范围",
    structured: false,
    canApprove: false,
    validationMessage: `请暂不执行，并让 ${DRAWLESS_COWORKER_DISPLAY_NAME} 重新整理成可验证的计划。`
  };
}

function createInvalidCanvasApprovalSummary(): CoworkerApprovalSummary {
  return {
    title: "这个画布计划还不能执行",
    intent: "计划参数没有通过画布编辑契约校验。",
    operationCount: null,
    operationSummary: null,
    operations: [],
    scope: "当前画布",
    structured: false,
    canApprove: false,
    validationMessage: `请暂不执行，并让 ${DRAWLESS_COWORKER_DISPLAY_NAME} 重新生成计划。`
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

function createCanvasEditOperationSummaries(
  operations: DrawlessCanvasEditOperation[],
  resolveCanvasTarget?: CoworkerCanvasTargetResolver
): CoworkerApprovalOperationSummary[] {
  const createdTargetLabels = new Map<string, string>();
  for (const operation of operations) {
    if (operation.kind === "create_shape") {
      createdTargetLabels.set(
        operation.operationId,
        getCreatedShapeLabel(operation.shapeKind, operation.text)
      );
    }
  }

  return operations.map((operation) => {
    if (operation.kind === "create_shape") {
      const subject = getCreatedShapeLabel(operation.shapeKind, operation.text);
      return {
        id: operation.operationId,
        action: "新增",
        title: `新增${subject}`,
        detail: joinDetail([
          formatStyleRole(operation.styleRole),
          formatDimensions(operation.bounds.w, operation.bounds.h)
        ]),
        targetRecordIds: []
      };
    }

    if (operation.kind === "update_shape_text") {
      return {
        id: operation.operationId,
        action: "改字",
        title: `修改${resolveExistingTarget(operation.shapeId, resolveCanvasTarget)}的文字`,
        detail: `改为${quoteReadableText(operation.text)}`,
        targetRecordIds: [operation.shapeId]
      };
    }

    if (operation.kind === "move_shape") {
      return {
        id: operation.operationId,
        action: "移动",
        title: `移动${resolveExistingTarget(operation.shapeId, resolveCanvasTarget)}`,
        detail: `移到画布位置 ${formatNumber(operation.point.x)}, ${formatNumber(operation.point.y)}`,
        targetRecordIds: [operation.shapeId]
      };
    }

    if (operation.kind === "resize_shape") {
      return {
        id: operation.operationId,
        action: "缩放",
        title: `调整${resolveExistingTarget(operation.shapeId, resolveCanvasTarget)}的尺寸`,
        detail: formatDimensions(operation.bounds.w, operation.bounds.h),
        targetRecordIds: [operation.shapeId]
      };
    }

    const start = resolveBindingTarget(
      operation.startBinding,
      createdTargetLabels,
      resolveCanvasTarget
    );
    const end = resolveBindingTarget(
      operation.endBinding,
      createdTargetLabels,
      resolveCanvasTarget
    );
    const hasNamedEndpoints = start !== "指定位置" || end !== "指定位置";
    return {
      id: operation.operationId,
      action: "连接",
      title: hasNamedEndpoints
        ? `从${start}连接到${end}`
        : "新增一条连接线",
      detail: joinDetail([
        operation.text ? `标注${quoteReadableText(operation.text)}` : null,
        formatStyleRole(operation.styleRole)
      ]),
      targetRecordIds: Array.from(
        new Set(
          [operation.startBinding?.shapeId, operation.endBinding?.shapeId].filter(
            (shapeId): shapeId is string => Boolean(shapeId)
          )
        )
      )
    };
  });
}

function resolveBindingTarget(
  target: Extract<DrawlessCanvasEditOperation, { kind: "create_arrow" }>["startBinding"],
  createdTargetLabels: Map<string, string>,
  resolveCanvasTarget?: CoworkerCanvasTargetResolver
) {
  if (target?.operationId) {
    return createdTargetLabels.get(target.operationId) ?? "本次新增对象";
  }
  if (target?.shapeId) {
    return resolveExistingTarget(target.shapeId, resolveCanvasTarget);
  }
  return "指定位置";
}

function resolveExistingTarget(
  shapeId: string,
  resolveCanvasTarget?: CoworkerCanvasTargetResolver
) {
  const target = resolveCanvasTarget?.(shapeId);
  if (target?.label) {
    return quoteReadableText(target.label);
  }
  if (target?.shapeKind) {
    return `现有${formatShapeKind(target.shapeKind)}`;
  }
  return "一个现有对象";
}

function getCreatedShapeLabel(
  shapeKind: Extract<DrawlessCanvasEditOperation, { kind: "create_shape" }>["shapeKind"],
  text?: string
) {
  const kind = formatShapeKind(shapeKind);
  return text ? `${kind}${quoteReadableText(text)}` : kind;
}

function formatShapeKind(shapeKind: string) {
  const labels: Record<string, string> = {
    rectangle: "矩形",
    ellipse: "圆形",
    diamond: "菱形",
    text: "文本",
    geo: "形状",
    note: "便笺",
    frame: "分组框",
    arrow: "连接线"
  };
  return labels[shapeKind] ?? "对象";
}

function formatStyleRole(
  styleRole: Extract<DrawlessCanvasEditOperation, { kind: "create_shape" | "create_arrow" }>["styleRole"]
) {
  const labels = {
    start: "起点",
    step: "步骤",
    decision: "判断",
    success: "完成",
    error: "异常",
    note: "说明"
  } as const;
  return styleRole && styleRole !== "default" ? `${labels[styleRole]}样式` : null;
}

function formatDimensions(width: number, height: number) {
  return `尺寸 ${formatNumber(width)} × ${formatNumber(height)}`;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function quoteReadableText(value: string) {
  const text = value.replace(/\s+/gu, " ").trim();
  const visible = text.length > 42 ? `${text.slice(0, 41)}…` : text;
  return `「${visible}」`;
}

function joinDetail(parts: Array<string | null>) {
  const detail = parts.filter((part): part is string => Boolean(part)).join(" · ");
  return detail || null;
}
