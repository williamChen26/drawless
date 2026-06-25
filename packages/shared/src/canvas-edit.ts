import { z } from "zod";

import {
  canvasBoundsSchema,
  canvasPointSchema
} from "./canvas-geometry.js";
import type {
  DrawlessCanvasBounds,
  DrawlessCanvasPoint
} from "./canvas-geometry.js";
import { roomIdSchema } from "./identity.js";
import type { DrawlessRoomId } from "./identity.js";

/**
 * coworker 可以创建的基础画布形状类型。
 */
export type DrawlessCanvasEditableShapeKind =
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "text";

/**
 * coworker 写画布时允许模型表达的语义化视觉角色。
 */
export type DrawlessCanvasEditStyleRole =
  | "default"
  | "start"
  | "step"
  | "decision"
  | "success"
  | "error"
  | "note";

/**
 * coworker 创建箭头时用于绑定箭头端点的目标。
 */
export interface DrawlessCanvasEditArrowBindingTarget {
  /** 已存在的 tldraw shape ID；连接已有对象时使用。 */
  shapeId?: string | undefined;
  /** 同一编辑请求内 create_shape 操作的 operationId；连接本次新建对象时使用。 */
  operationId?: string | undefined;
}

/**
 * coworker 创建基础 shape 的受控操作。
 */
export interface DrawlessCanvasEditCreateShapeOperation {
  /** 单次编辑请求内的操作 ID，用于回溯模型意图和写入结果。 */
  operationId: string;
  /** 操作类型。 */
  kind: "create_shape";
  /** 要创建的基础 shape 类型。 */
  shapeKind: DrawlessCanvasEditableShapeKind;
  /** 写入 shape 的文字；没有文字时可以为空。 */
  text?: string | undefined;
  /** shape 在画布坐标系中的目标包围盒。 */
  bounds: DrawlessCanvasBounds;
  /** shape 的语义化视觉角色；不传时由 coworker 使用默认角色。 */
  styleRole?: DrawlessCanvasEditStyleRole | undefined;
}

/**
 * coworker 更新已有 shape 文本的受控操作。
 */
export interface DrawlessCanvasEditUpdateShapeTextOperation {
  /** 单次编辑请求内的操作 ID，用于回溯模型意图和写入结果。 */
  operationId: string;
  /** 操作类型。 */
  kind: "update_shape_text";
  /** 要更新的 tldraw shape ID。 */
  shapeId: string;
  /** 更新后的文本内容。 */
  text: string;
}

/**
 * coworker 移动已有 shape 的受控操作。
 */
export interface DrawlessCanvasEditMoveShapeOperation {
  /** 单次编辑请求内的操作 ID，用于回溯模型意图和写入结果。 */
  operationId: string;
  /** 操作类型。 */
  kind: "move_shape";
  /** 要移动的 tldraw shape ID。 */
  shapeId: string;
  /** shape 左上角移动后的画布坐标。 */
  point: DrawlessCanvasPoint;
}

/**
 * coworker 调整已有 shape 包围盒的受控操作。
 */
export interface DrawlessCanvasEditResizeShapeOperation {
  /** 单次编辑请求内的操作 ID，用于回溯模型意图和写入结果。 */
  operationId: string;
  /** 操作类型。 */
  kind: "resize_shape";
  /** 要调整尺寸的 tldraw shape ID。 */
  shapeId: string;
  /** shape 调整后的目标包围盒。 */
  bounds: DrawlessCanvasBounds;
}

/**
 * coworker 创建基础箭头的受控操作。
 */
export interface DrawlessCanvasEditCreateArrowOperation {
  /** 单次编辑请求内的操作 ID，用于回溯模型意图和写入结果。 */
  operationId: string;
  /** 操作类型。 */
  kind: "create_arrow";
  /** 箭头起点的画布坐标。 */
  from: DrawlessCanvasPoint;
  /** 箭头终点的画布坐标。 */
  to: DrawlessCanvasPoint;
  /** 箭头起点绑定的目标 shape；不传时仅使用坐标起点。 */
  startBinding?: DrawlessCanvasEditArrowBindingTarget | undefined;
  /** 箭头终点绑定的目标 shape；不传时仅使用坐标终点。 */
  endBinding?: DrawlessCanvasEditArrowBindingTarget | undefined;
  /** 箭头标签文本；没有标签时可以为空。 */
  text?: string | undefined;
  /** 箭头的语义化视觉角色；不传时由 coworker 使用默认角色。 */
  styleRole?: DrawlessCanvasEditStyleRole | undefined;
}

/**
 * coworker 可以执行的受控画布编辑操作。
 */
export type DrawlessCanvasEditOperation =
  | DrawlessCanvasEditCreateShapeOperation
  | DrawlessCanvasEditUpdateShapeTextOperation
  | DrawlessCanvasEditMoveShapeOperation
  | DrawlessCanvasEditResizeShapeOperation
  | DrawlessCanvasEditCreateArrowOperation;

/**
 * conversation agent 请求 coworker 写画布时传入的受控编辑计划。
 */
export interface DrawlessCanvasEditRequest {
  /** 编辑所属的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 调用方认为当前所在的 page ID；不确定时可以为空。 */
  currentPageId?: string | null | undefined;
  /** 用户本次希望达成的画布编辑意图。 */
  intent: string;
  /** 需要按顺序应用到 tldraw document 的受控编辑操作。 */
  operations: DrawlessCanvasEditOperation[];
}

/**
 * coworker 应用受控画布编辑后的结果摘要。
 */
export interface DrawlessCanvasEditResult {
  /** 编辑所属的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 本次编辑是否至少成功写入了一个 record。 */
  applied: boolean;
  /** 本次编辑新建的 tldraw record ID 列表。 */
  createdRecordIds: string[];
  /** 本次编辑更新的 tldraw record ID 列表。 */
  updatedRecordIds: string[];
  /** 编辑过程中跳过、降级或失败的操作说明。 */
  warnings: string[];
  /** 给 conversation agent 和 UI 展示的人类可读结果摘要。 */
  summary: string;
}

export const canvasEditableShapeKindSchema = z.enum([
  "rectangle",
  "ellipse",
  "diamond",
  "text"
]) satisfies z.ZodType<DrawlessCanvasEditableShapeKind>;

export const canvasEditStyleRoleSchema = z.enum([
  "default",
  "start",
  "step",
  "decision",
  "success",
  "error",
  "note"
]) satisfies z.ZodType<DrawlessCanvasEditStyleRole>;

const canvasEditOperationBaseSchema = z.object({
  operationId: z.string().trim().min(1).max(120)
});

export const canvasEditArrowBindingTargetSchema = z
  .object({
    shapeId: z.string().trim().min(1).optional(),
    operationId: z.string().trim().min(1).max(120).optional()
  })
  .refine((value) => Boolean(value.shapeId || value.operationId), {
    message: "Arrow binding target must include shapeId or operationId."
  }) satisfies z.ZodType<DrawlessCanvasEditArrowBindingTarget>;

export const canvasEditCreateShapeOperationSchema = canvasEditOperationBaseSchema.extend({
  kind: z.literal("create_shape"),
  shapeKind: canvasEditableShapeKindSchema,
  text: z.string().trim().max(1_000).optional(),
  bounds: canvasBoundsSchema,
  styleRole: canvasEditStyleRoleSchema.optional()
}) satisfies z.ZodType<DrawlessCanvasEditCreateShapeOperation>;

export const canvasEditUpdateShapeTextOperationSchema = canvasEditOperationBaseSchema.extend({
  kind: z.literal("update_shape_text"),
  shapeId: z.string().trim().min(1),
  text: z.string().trim().max(1_000)
}) satisfies z.ZodType<DrawlessCanvasEditUpdateShapeTextOperation>;

export const canvasEditMoveShapeOperationSchema = canvasEditOperationBaseSchema.extend({
  kind: z.literal("move_shape"),
  shapeId: z.string().trim().min(1),
  point: canvasPointSchema
}) satisfies z.ZodType<DrawlessCanvasEditMoveShapeOperation>;

export const canvasEditResizeShapeOperationSchema = canvasEditOperationBaseSchema.extend({
  kind: z.literal("resize_shape"),
  shapeId: z.string().trim().min(1),
  bounds: canvasBoundsSchema
}) satisfies z.ZodType<DrawlessCanvasEditResizeShapeOperation>;

export const canvasEditCreateArrowOperationSchema = canvasEditOperationBaseSchema.extend({
  kind: z.literal("create_arrow"),
  from: canvasPointSchema,
  to: canvasPointSchema,
  startBinding: canvasEditArrowBindingTargetSchema.optional(),
  endBinding: canvasEditArrowBindingTargetSchema.optional(),
  text: z.string().trim().max(1_000).optional(),
  styleRole: canvasEditStyleRoleSchema.optional()
}) satisfies z.ZodType<DrawlessCanvasEditCreateArrowOperation>;

export const canvasEditOperationSchema = z.discriminatedUnion("kind", [
  canvasEditCreateShapeOperationSchema,
  canvasEditUpdateShapeTextOperationSchema,
  canvasEditMoveShapeOperationSchema,
  canvasEditResizeShapeOperationSchema,
  canvasEditCreateArrowOperationSchema
]) satisfies z.ZodType<DrawlessCanvasEditOperation>;

export const canvasEditRequestSchema = z.object({
  roomId: roomIdSchema,
  currentPageId: z.string().trim().min(1).nullable().optional(),
  intent: z.string().trim().min(1).max(1_000),
  operations: z.array(canvasEditOperationSchema).min(1).max(20)
}) satisfies z.ZodType<DrawlessCanvasEditRequest>;

export const canvasEditResultSchema = z.object({
  roomId: roomIdSchema,
  applied: z.boolean(),
  createdRecordIds: z.array(z.string().trim().min(1)),
  updatedRecordIds: z.array(z.string().trim().min(1)),
  warnings: z.array(z.string().trim().min(1)),
  summary: z.string().trim().min(1)
}) satisfies z.ZodType<DrawlessCanvasEditResult>;
