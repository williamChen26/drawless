import { z } from "zod";

import { canvasViewportContextSchema } from "./canvas-geometry.js";
import type { DrawlessCanvasViewportContext } from "./canvas-geometry.js";
import { roomIdSchema } from "./identity.js";
import type { DrawlessRoomId } from "./identity.js";

/**
 * conversation chat 发送给 coworker 的长对话请求。
 */
export interface DrawlessCoworkerConversationStreamRequest {
  /** 请求所属的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 用户在 conversation chat 中输入的原始消息。 */
  message: string;
  /** conversation 发起时用户当前可视区上下文；没有 editor 实例时为空。 */
  viewport?: DrawlessCanvasViewportContext | null | undefined;
}

/**
 * web 或 server 对 conversation tool call 做人工确认时使用的请求。
 */
export interface DrawlessCoworkerConversationToolApprovalRequest {
  /** Coworker runtime 当前 agent stream 的 run ID；仅供 server 内部控制面使用。 */
  runId: string;
  /** Coworker runtime 等待用户确认的 tool call ID；仅供 server 内部控制面使用。 */
  toolCallId: string;
}

/**
 * Web 可以稳定消费的 Coworker 审批请求。
 *
 * 该契约描述“需要用户授权的一次能力调用”，不把审批误建模成工作卡，
 * 也不暴露具体 agent runtime 的 runId、toolCallId 等实现标识。
 */
export interface DrawlessCoworkerApprovalRequest {
  /** 对 Web 稳定且不可推断 runtime 信息的审批 ID。 */
  id: string;
  /** 审批所属的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 本次调用申请使用的产品能力，例如 canvas.edit。 */
  capability: string;
  /** 本次能力调用的风险类别。 */
  risk: "write" | "external-action";
  /** 供对应能力展示器校验和呈现的结构化提案。 */
  proposal: unknown;
  /** Server 首次登记审批的 ISO 时间。 */
  requestedAt: string;
}

/**
 * 用户对 Coworker 审批请求给出的决定。
 */
export interface DrawlessCoworkerApprovalResolutionRequest {
  /** 用户允许或拒绝本次能力调用。 */
  decision: "approve" | "decline";
}

/**
 * 审批在公开协议中的生命周期状态。
 */
export type DrawlessCoworkerApprovalStatus =
  | "pending"
  | "resolving"
  | "resolved";

/**
 * 审批生命周期中的一条审计事件。
 */
export interface DrawlessCoworkerApprovalAuditEvent {
  /** 审计事件类型。 */
  kind:
    | "requested"
    | "resolution-started"
    | "resolution-failed"
    | "resolved";
  /** 审计事件发生的 ISO 时间。 */
  occurredAt: string;
  /** 与事件相关的用户决定；尚未决定时为空。 */
  decision: "approve" | "decline" | null;
  /** 失败原因等补充信息；没有时为空。 */
  message: string | null;
}

/**
 * 不包含 runtime 私有标识的审批生命周期快照。
 */
export interface DrawlessCoworkerApprovalSnapshot {
  /** 面向 Web 的稳定审批请求。 */
  approval: DrawlessCoworkerApprovalRequest;
  /** 当前审批生命周期状态。 */
  status: DrawlessCoworkerApprovalStatus;
  /** 已接受的用户决定；尚未完成时为空。 */
  decision: "approve" | "decline" | null;
  /** 最近一次状态变化的 ISO 时间。 */
  updatedAt: string;
  /** Coworker runtime 成功接受审批决定的 ISO 时间；尚未完成时为空。 */
  resolvedAt: string | null;
  /** 按发生顺序保留的审批审计事件。 */
  audit: DrawlessCoworkerApprovalAuditEvent[];
}

/**
 * 查询一个 room 内审批生命周期时使用的过滤条件。
 */
export interface DrawlessCoworkerApprovalListQuery {
  /** 只返回指定生命周期状态；省略时返回当前保留的全部记录。 */
  status?: DrawlessCoworkerApprovalStatus | undefined;
}

/**
 * 一个 room 内的公开审批生命周期列表。
 */
export interface DrawlessCoworkerApprovalListResponse {
  /** 查询所属的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 不包含 runtime 私有标识的审批生命周期记录。 */
  approvals: DrawlessCoworkerApprovalSnapshot[];
}

export const coworkerConversationStreamRequestSchema = z.object({
  roomId: roomIdSchema,
  message: z.string().trim().min(1).max(8_000),
  viewport: canvasViewportContextSchema.nullable().optional()
}) satisfies z.ZodType<DrawlessCoworkerConversationStreamRequest>;

export const coworkerConversationToolApprovalRequestSchema = z.object({
  runId: z.string().trim().min(1),
  toolCallId: z.string().trim().min(1)
}) satisfies z.ZodType<DrawlessCoworkerConversationToolApprovalRequest>;

export const coworkerApprovalIdSchema = z.string().uuid();

export const coworkerApprovalRequestSchema = z.object({
  id: coworkerApprovalIdSchema,
  roomId: roomIdSchema,
  capability: z.string().trim().min(1).max(128),
  risk: z.enum(["write", "external-action"]),
  proposal: z.unknown(),
  requestedAt: z.string().datetime()
}) satisfies z.ZodType<DrawlessCoworkerApprovalRequest>;

export const coworkerApprovalResolutionRequestSchema = z.object({
  decision: z.enum(["approve", "decline"])
}) satisfies z.ZodType<DrawlessCoworkerApprovalResolutionRequest>;

export const coworkerApprovalStatusSchema = z.enum([
  "pending",
  "resolving",
  "resolved"
]);

export const coworkerApprovalAuditEventSchema = z.object({
  kind: z.enum([
    "requested",
    "resolution-started",
    "resolution-failed",
    "resolved"
  ]),
  occurredAt: z.string().datetime(),
  decision: z.enum(["approve", "decline"]).nullable(),
  message: z.string().nullable()
}) satisfies z.ZodType<DrawlessCoworkerApprovalAuditEvent>;

export const coworkerApprovalSnapshotSchema = z.object({
  approval: coworkerApprovalRequestSchema,
  status: coworkerApprovalStatusSchema,
  decision: z.enum(["approve", "decline"]).nullable(),
  updatedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
  audit: z.array(coworkerApprovalAuditEventSchema)
}) satisfies z.ZodType<DrawlessCoworkerApprovalSnapshot>;

export const coworkerApprovalListQuerySchema = z.object({
  status: coworkerApprovalStatusSchema.optional()
}) satisfies z.ZodType<DrawlessCoworkerApprovalListQuery>;

export const coworkerApprovalListResponseSchema = z.object({
  roomId: roomIdSchema,
  approvals: z.array(coworkerApprovalSnapshotSchema)
}) satisfies z.ZodType<DrawlessCoworkerApprovalListResponse>;
