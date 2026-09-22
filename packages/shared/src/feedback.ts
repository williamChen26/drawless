import { z } from "zod";

export const drawlessFeedbackCategorySchema = z.enum([
  "bug",
  "suggestion",
  "other"
]);

export type DrawlessFeedbackCategory = z.infer<
  typeof drawlessFeedbackCategorySchema
>;

export interface DrawlessFeedbackRequest {
  /** 浏览器为本次提交生成的 UUID，用于安全重试和避免重复创建 Issue。 */
  submissionId: string;
  /** 用户选择的反馈分类。 */
  category: DrawlessFeedbackCategory;
  /** 用户填写的反馈正文。 */
  message: string;
  /** 发起反馈的 drawless 产品界面。 */
  surface: "canvas";
}

export const drawlessFeedbackRequestSchema: z.ZodType<DrawlessFeedbackRequest> =
  z
    .object({
      submissionId: z.uuid(),
      category: drawlessFeedbackCategorySchema,
      message: z.string().trim().min(10).max(4_000),
      surface: z.literal("canvas")
    })
    .strict();

export interface DrawlessFeedbackSuccessResponse {
  /** 反馈是否成功写入 GitHub。 */
  ok: true;
  /** GitHub 创建的公开 Issue 编号。 */
  issueNumber: number;
}

export const drawlessFeedbackErrorCodeSchema = z.enum([
  "INVALID_INPUT",
  "FORBIDDEN_ORIGIN",
  "RATE_LIMITED",
  "FEEDBACK_UNAVAILABLE",
  "UPSTREAM_UNAVAILABLE"
]);

export type DrawlessFeedbackErrorCode = z.infer<
  typeof drawlessFeedbackErrorCodeSchema
>;

export interface DrawlessFeedbackErrorResponse {
  /** 反馈是否成功写入 GitHub。 */
  ok: false;
  /** 客户端可以稳定判断的失败类型。 */
  code: DrawlessFeedbackErrorCode;
  /** 可以直接展示给用户的中文错误说明。 */
  message: string;
  /** 被限流时建议等待的秒数。 */
  retryAfterSeconds?: number | undefined;
}

export type DrawlessFeedbackResponse =
  | DrawlessFeedbackSuccessResponse
  | DrawlessFeedbackErrorResponse;

export const drawlessFeedbackResponseSchema: z.ZodType<DrawlessFeedbackResponse> =
  z.discriminatedUnion("ok", [
    z
      .object({
        ok: z.literal(true),
        issueNumber: z.number().int().positive()
      })
      .strict(),
    z
      .object({
        ok: z.literal(false),
        code: drawlessFeedbackErrorCodeSchema,
        message: z.string().min(1),
        retryAfterSeconds: z.number().int().positive().optional()
      })
      .strict()
  ]);
