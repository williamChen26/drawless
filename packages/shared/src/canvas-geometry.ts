import { z } from "zod";

/**
 * 从 tldraw shape 派生出的画布包围盒。
 */
export interface DrawlessCanvasBounds {
  /** 包围盒左上角的 x 坐标。 */
  x: number;
  /** 包围盒左上角的 y 坐标。 */
  y: number;
  /** 包围盒宽度。 */
  w: number;
  /** 包围盒高度。 */
  h: number;
}

/**
 * 画布上的一个点。
 */
export interface DrawlessCanvasPoint {
  /** 画布坐标系中的 x 坐标。 */
  x: number;
  /** 画布坐标系中的 y 坐标。 */
  y: number;
}

/**
 * 目标对象包围盒内的归一化坐标。
 */
export interface DrawlessCanvasNormalizedPoint {
  /** 目标包围盒内的归一化 x 坐标，范围为 0 到 1。 */
  x: number;
  /** 目标包围盒内的归一化 y 坐标，范围为 0 到 1。 */
  y: number;
}

/**
 * conversation chat 发起时用户当前可视区的临时上下文。
 */
export interface DrawlessCanvasViewportContext {
  /** 用户当前所在的 page ID；无法确定时为 null。 */
  currentPageId: string | null;
  /** 用户当前屏幕可见区域换算到画布坐标系后的包围盒。 */
  viewportBounds: DrawlessCanvasBounds;
  /** 用户当前屏幕中心点换算到画布坐标系后的坐标。 */
  viewportCenter: DrawlessCanvasPoint;
  /** 用户当前画布缩放比例。 */
  zoom: number;
}

export const canvasBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number()
}) satisfies z.ZodType<DrawlessCanvasBounds>;

export const canvasPointSchema = z.object({
  x: z.number(),
  y: z.number()
}) satisfies z.ZodType<DrawlessCanvasPoint>;

export const canvasNormalizedPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1)
}) satisfies z.ZodType<DrawlessCanvasNormalizedPoint>;

export const canvasViewportContextSchema = z.object({
  currentPageId: z.string().trim().min(1).nullable(),
  viewportBounds: canvasBoundsSchema,
  viewportCenter: canvasPointSchema,
  zoom: z.number().positive()
}) satisfies z.ZodType<DrawlessCanvasViewportContext>;
