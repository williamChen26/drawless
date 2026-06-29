import { z } from "zod";

import { canvasBoundsSchema } from "./canvas-geometry.js";
import type { DrawlessCanvasBounds } from "./canvas-geometry.js";
import { roomIdSchema, sessionIdSchema } from "./identity.js";
import type { DrawlessRoomId, DrawlessSessionId } from "./identity.js";

/**
 * coworker 观察到的画布事件类型。
 */
export type DrawlessCanvasObservationKind =
  | "shape_created"
  | "shape_updated"
  | "shape_deleted"
  | "selection_changed"
  | "presence_updated"
  | "page_changed"
  | "unknown_change";

/**
 * 从 tldraw document 或协作者 presence 派生出的画布观察事件。
 */
export interface DrawlessCanvasObservationEvent {
  /** 事件所属的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 事件 ID，用于去重、排序和排查问题。 */
  eventId: string;
  /** 事件发生时间，使用 ISO 字符串。 */
  occurredAt: string;
  /** 触发事件的协作者会话 ID。 */
  actorSessionId: DrawlessSessionId;
  /** 观察事件的类型。 */
  kind: DrawlessCanvasObservationKind;
  /** 受影响的 tldraw record ID 列表。 */
  recordIds: string[];
  /** 给 coworker 快速理解的人类可读摘要。 */
  summary: string;
}

/**
 * coworker 判断介入时使用的画布焦点上下文。
 */
export interface DrawlessCanvasFocusContext {
  /** 用户当前选中的 tldraw record ID 列表。 */
  selectedRecordIds: string[];
  /** 最近发生变化的 tldraw record ID 列表。 */
  recentlyChangedRecordIds: string[];
  /** 当前视口内可见的 tldraw record ID 列表。 */
  viewportRecordIds: string[];
}

/**
 * 提供给 coworker 的画布语义摘要。
 */
export interface DrawlessCanvasSummary {
  /** 摘要所属的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 摘要生成时间，使用 ISO 字符串。 */
  capturedAt: string;
  /** 当前 page ID；无法确定时为 null。 */
  currentPageId: string | null;
  /** 从 tldraw records 派生出的人类可读摘要。 */
  summary: string;
  /** coworker 当前应该优先关注的画布上下文。 */
  focus: DrawlessCanvasFocusContext;
  /** 摘要覆盖的最近画布观察事件。 */
  recentEvents: DrawlessCanvasObservationEvent[];
}

/**
 * coworker 理解画布节点时使用的粗粒度节点类型。
 */
export type DrawlessCanvasSemanticNodeKind =
  | "text"
  | "shape"
  | "arrow"
  | "frame"
  | "group"
  | "lane"
  | "unknown";

/**
 * 从 tldraw shape 派生出的语义节点。
 */
export interface DrawlessCanvasSemanticNode {
  /** 对应的 tldraw shape ID。 */
  id: string;
  /** coworker 用于理解画布语义的节点类型。 */
  kind: DrawlessCanvasSemanticNodeKind;
  /** tldraw 原始 shape type。 */
  shapeType: string;
  /** 从 shape props 中提取的文本；没有文本时为 null。 */
  text: string | null;
  /** 从 shape 位置和尺寸派生出的包围盒。 */
  bounds: DrawlessCanvasBounds;
  /** tldraw parentId，用于表达 page、frame、group 等层级关系。 */
  parentId: string;
  /** 节点所属 page ID；无法直接判断时为 null。 */
  pageId: string | null;
}

/**
 * 语义边的方向。
 */
export type DrawlessCanvasSemanticEdgeDirection =
  | "forward"
  | "reverse"
  | "bidirectional"
  | "unknown";

/**
 * 从箭头或连接关系派生出的语义边。
 */
export interface DrawlessCanvasSemanticEdge {
  /** 语义边 ID，通常复用对应的 arrow shape ID。 */
  id: string;
  /** 起点 shape ID；无法识别时为 null。 */
  fromId: string | null;
  /** 终点 shape ID；无法识别时为 null。 */
  toId: string | null;
  /** 箭头上的文本标签；没有标签时为 null。 */
  label: string | null;
  /** 连接方向。 */
  direction: DrawlessCanvasSemanticEdgeDirection;
  /** 产生这条语义边的 tldraw record ID。 */
  recordId: string;
}

/**
 * coworker 理解容器区域时使用的粗粒度区域类型。
 */
export type DrawlessCanvasSemanticRegionKind =
  | "frame"
  | "group"
  | "cluster"
  | "swimlane"
  | "unknown";

/**
 * 从 frame、group 或空间包含关系派生出的语义区域。
 */
export interface DrawlessCanvasSemanticRegion {
  /** 区域 ID，通常复用对应的容器 shape ID。 */
  id: string;
  /** coworker 用于理解区域语义的区域类型。 */
  kind: DrawlessCanvasSemanticRegionKind;
  /** 区域标题；没有标题时为 null。 */
  title: string | null;
  /** 区域在画布上的包围盒。 */
  bounds: DrawlessCanvasBounds;
  /** 当前判断属于该区域的 shape ID 列表。 */
  shapeIds: string[];
}

/**
 * 从 tldraw document 派生出的画布语义图。它只作为观察视图，不作为新的画布事实源。
 */
export interface DrawlessCanvasSemanticGraph {
  /** 语义图所属的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 语义图生成时间，使用 ISO 字符串。 */
  generatedAt: string;
  /** 当前 page ID；无法确定时为 null。 */
  currentPageId: string | null;
  /** 从 shape 派生出的语义节点列表。 */
  nodes: DrawlessCanvasSemanticNode[];
  /** 从箭头或绑定关系派生出的语义边列表。 */
  edges: DrawlessCanvasSemanticEdge[];
  /** 从 frame、group 或布局关系派生出的语义区域列表。 */
  regions: DrawlessCanvasSemanticRegion[];
}

export const canvasObservationKindSchema = z.enum([
  "shape_created",
  "shape_updated",
  "shape_deleted",
  "selection_changed",
  "presence_updated",
  "page_changed",
  "unknown_change"
]);

export const canvasObservationEventSchema = z.object({
  roomId: roomIdSchema,
  eventId: z.string().trim().min(1),
  occurredAt: z.string().datetime(),
  actorSessionId: sessionIdSchema,
  kind: canvasObservationKindSchema,
  recordIds: z.array(z.string().trim().min(1)),
  summary: z.string().trim().min(1)
}) satisfies z.ZodType<DrawlessCanvasObservationEvent>;

export const canvasFocusContextSchema = z.object({
  selectedRecordIds: z.array(z.string().trim().min(1)),
  recentlyChangedRecordIds: z.array(z.string().trim().min(1)),
  viewportRecordIds: z.array(z.string().trim().min(1))
}) satisfies z.ZodType<DrawlessCanvasFocusContext>;

export const canvasSummarySchema = z.object({
  roomId: roomIdSchema,
  capturedAt: z.string().datetime(),
  currentPageId: z.string().trim().min(1).nullable(),
  summary: z.string().trim().min(1),
  focus: canvasFocusContextSchema,
  recentEvents: z.array(canvasObservationEventSchema)
}) satisfies z.ZodType<DrawlessCanvasSummary>;

export const canvasSemanticNodeKindSchema = z.enum([
  "text",
  "shape",
  "arrow",
  "frame",
  "group",
  "lane",
  "unknown"
]);

export const canvasSemanticEdgeDirectionSchema = z.enum([
  "forward",
  "reverse",
  "bidirectional",
  "unknown"
]);

export const canvasSemanticRegionKindSchema = z.enum([
  "frame",
  "group",
  "cluster",
  "swimlane",
  "unknown"
]);

export const canvasSemanticNodeSchema = z.object({
  id: z.string().trim().min(1),
  kind: canvasSemanticNodeKindSchema,
  shapeType: z.string().trim().min(1),
  text: z.string().trim().min(1).nullable(),
  bounds: canvasBoundsSchema,
  parentId: z.string().trim().min(1),
  pageId: z.string().trim().min(1).nullable()
}) satisfies z.ZodType<DrawlessCanvasSemanticNode>;

export const canvasSemanticEdgeSchema = z.object({
  id: z.string().trim().min(1),
  fromId: z.string().trim().min(1).nullable(),
  toId: z.string().trim().min(1).nullable(),
  label: z.string().trim().min(1).nullable(),
  direction: canvasSemanticEdgeDirectionSchema,
  recordId: z.string().trim().min(1)
}) satisfies z.ZodType<DrawlessCanvasSemanticEdge>;

export const canvasSemanticRegionSchema = z.object({
  id: z.string().trim().min(1),
  kind: canvasSemanticRegionKindSchema,
  title: z.string().trim().min(1).nullable(),
  bounds: canvasBoundsSchema,
  shapeIds: z.array(z.string().trim().min(1))
}) satisfies z.ZodType<DrawlessCanvasSemanticRegion>;

export const canvasSemanticGraphSchema = z.object({
  roomId: roomIdSchema,
  generatedAt: z.string().datetime(),
  currentPageId: z.string().trim().min(1).nullable(),
  nodes: z.array(canvasSemanticNodeSchema),
  edges: z.array(canvasSemanticEdgeSchema),
  regions: z.array(canvasSemanticRegionSchema)
}) satisfies z.ZodType<DrawlessCanvasSemanticGraph>;
