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
  /** Mastra 当前 agent stream 的 run ID。 */
  runId: string;
  /** 等待用户确认的 tool call ID。 */
  toolCallId: string;
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
