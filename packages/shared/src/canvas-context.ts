import { z } from "zod";

import { canvasPointSchema } from "./canvas-geometry.js";
import type { DrawlessCanvasPoint } from "./canvas-geometry.js";
import {
  canvasObservationEventSchema,
  canvasSemanticEdgeSchema,
  canvasSemanticNodeSchema,
  canvasSemanticRegionSchema
} from "./canvas-observation.js";
import type {
  DrawlessCanvasObservationEvent,
  DrawlessCanvasSemanticEdge,
  DrawlessCanvasSemanticNode,
  DrawlessCanvasSemanticRegion
} from "./canvas-observation.js";
import { roomIdSchema } from "./identity.js";
import type { DrawlessRoomId } from "./identity.js";

/**
 * coworker 收集画布上下文时使用的只读请求。
 */
export interface DrawlessCanvasContextRequest {
  /** 请求上下文的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 调用方认为当前所在的 page ID；不确定时可以为空。 */
  currentPageId?: string | null | undefined;
  /** 调用方希望优先关注的 tldraw record ID 列表。 */
  focusedRecordIds?: string[] | undefined;
  /** cursor chat 或用户指向的位置；没有明确位置时为空。 */
  cursor?: DrawlessCanvasPoint | null | undefined;
}

/**
 * coworker 收集画布上下文后提供给模型的焦点信息。
 */
export interface DrawlessCanvasContextFocus {
  /** 当前从 presence 中观察到的用户选中对象 ID 列表。 */
  selectedRecordIds: string[];
  /** 本次请求显式要求关注的对象 ID 列表。 */
  focusedRecordIds: string[];
  /** 根据 cursor 或焦点对象推断出的附近对象 ID 列表。 */
  nearbyRecordIds: string[];
  /** 最近从远端同步变化中观察到的 record ID 列表。 */
  recentlyChangedRecordIds: string[];
}

/**
 * 提供给 agent 的轻量画布语义图；只保留结构内容，不重复 room 和时间元信息。
 */
export interface DrawlessCanvasContextSemanticGraph {
  /** 从 shape 派生出的语义节点列表。 */
  nodes: DrawlessCanvasSemanticNode[];
  /** 从箭头或绑定关系派生出的语义边列表。 */
  edges: DrawlessCanvasSemanticEdge[];
  /** 从 frame、group 或布局关系派生出的语义区域列表。 */
  regions: DrawlessCanvasSemanticRegion[];
}

/**
 * coworker 从本地 TLStore 派生出的只读画布上下文。它是观察结果，不是新的画布事实源。
 */
export interface DrawlessCanvasContextSnapshot {
  /** coworker 当前是否能读取到这个 room 的本地同步状态。 */
  available: boolean;
  /** 当前 page ID；无法确定时为 null。 */
  currentPageId: string | null;
  /** 从 tldraw records 派生出的人类可读画布摘要；不可用时为 null。 */
  summaryText: string | null;
  /** 从 tldraw records 派生出的轻量语义图；不可用时为 null。 */
  semanticGraph: DrawlessCanvasContextSemanticGraph | null;
  /** 本次上下文里模型应优先关注的对象集合。 */
  focus: DrawlessCanvasContextFocus;
  /** 摘要覆盖的最近画布观察事件。 */
  recentEvents: DrawlessCanvasObservationEvent[];
  /** 上下文收集过程中的限制、截断或不可用说明。 */
  warnings: string[];
}

export const canvasContextRequestSchema = z.object({
  roomId: roomIdSchema,
  currentPageId: z.string().trim().min(1).nullable().optional(),
  focusedRecordIds: z.array(z.string().trim().min(1)).optional(),
  cursor: canvasPointSchema.nullable().optional()
}) satisfies z.ZodType<DrawlessCanvasContextRequest>;

export const canvasContextFocusSchema = z.object({
  selectedRecordIds: z.array(z.string().trim().min(1)),
  focusedRecordIds: z.array(z.string().trim().min(1)),
  nearbyRecordIds: z.array(z.string().trim().min(1)),
  recentlyChangedRecordIds: z.array(z.string().trim().min(1))
}) satisfies z.ZodType<DrawlessCanvasContextFocus>;

export const canvasContextSemanticGraphSchema = z.object({
  nodes: z.array(canvasSemanticNodeSchema),
  edges: z.array(canvasSemanticEdgeSchema),
  regions: z.array(canvasSemanticRegionSchema)
}) satisfies z.ZodType<DrawlessCanvasContextSemanticGraph>;

export const canvasContextSnapshotSchema = z.object({
  available: z.boolean(),
  currentPageId: z.string().trim().min(1).nullable(),
  summaryText: z.string().trim().min(1).nullable(),
  semanticGraph: canvasContextSemanticGraphSchema.nullable(),
  focus: canvasContextFocusSchema,
  recentEvents: z.array(canvasObservationEventSchema),
  warnings: z.array(z.string().trim().min(1))
}) satisfies z.ZodType<DrawlessCanvasContextSnapshot>;
