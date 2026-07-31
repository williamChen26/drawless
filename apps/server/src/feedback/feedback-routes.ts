import type { FastifyInstance } from "fastify";
import {
  drawlessFeedbackRequestSchema,
  type DrawlessFeedbackErrorResponse
} from "@drawless/shared";

import { isOriginAllowed } from "../config.js";
import {
  createFeedbackRateLimiter,
  type FeedbackRateLimiter
} from "./feedback-rate-limiter.js";
import {
  createFeedbackSubmissionRegistry,
  type FeedbackSubmissionRegistry
} from "./feedback-submission-registry.js";
import {
  GithubFeedbackClientError,
  type FeedbackClient
} from "./github-feedback-client.js";

type RegisterFeedbackRoutesOptions = {
  /** 允许调用反馈接口的浏览器来源。 */
  allowedOrigins: readonly string[];
  /** 已配置 GitHub 凭据时可用的反馈客户端。 */
  feedbackClient?: FeedbackClient | null;
  /** 测试时可注入的来源限流器。 */
  rateLimiter?: FeedbackRateLimiter;
  /** 测试时可注入的幂等提交注册表。 */
  submissionRegistry?: FeedbackSubmissionRegistry;
};

export function registerFeedbackRoutes(
  app: FastifyInstance,
  options: RegisterFeedbackRoutesOptions
) {
  const rateLimiter =
    options.rateLimiter ?? createFeedbackRateLimiter();
  const submissionRegistry =
    options.submissionRegistry ?? createFeedbackSubmissionRegistry();

  app.post(
    "/feedback",
    { bodyLimit: 8_192 },
    async (request, reply) => {
      const origin = request.headers.origin;
      if (
        !origin ||
        !isOriginAllowed(origin, options.allowedOrigins)
      ) {
        return reply.code(403).send(
          createFeedbackError(
            "FORBIDDEN_ORIGIN",
            "当前页面不能提交反馈。"
          )
        );
      }

      const extracted = extractFeedbackPayload(request.body);
      if (extracted.honeypot) {
        return reply.code(400).send(
          createFeedbackError(
            "INVALID_INPUT",
            "反馈内容格式不正确。"
          )
        );
      }

      const parsed = drawlessFeedbackRequestSchema.safeParse(
        extracted.payload
      );
      if (!parsed.success) {
        return reply.code(400).send(
          createFeedbackError(
            "INVALID_INPUT",
            parsed.error.issues[0]?.message ?? "反馈内容格式不正确。"
          )
        );
      }

      if (!options.feedbackClient) {
        return reply.code(503).send(
          createFeedbackError(
            "FEEDBACK_UNAVAILABLE",
            "反馈暂时不可用，请稍后再试。"
          )
        );
      }

      const submissionKey = `${request.ip}:${parsed.data.submissionId}`;
      const existing = submissionRegistry.get(submissionKey);
      if (!existing) {
        const rateLimit = rateLimiter.consume(request.ip);
        if (!rateLimit.ok) {
          reply.header(
            "retry-after",
            String(rateLimit.retryAfterSeconds)
          );
          return reply.code(429).send({
            ...createFeedbackError(
              "RATE_LIMITED",
              "反馈提交得有些频繁，请稍后再试。"
            ),
            retryAfterSeconds: rateLimit.retryAfterSeconds
          });
        }
      }

      try {
        const result = await (
          existing ??
          submissionRegistry.run(
            submissionKey,
            () => options.feedbackClient!.createIssue(parsed.data)
          )
        );
        return reply.code(201).send({
          ok: true,
          issueNumber: result.issueNumber
        });
      } catch (error) {
        request.log.warn(
          {
            errorName:
              error instanceof Error ? error.name : "UnknownError",
            upstreamStatus:
              error instanceof GithubFeedbackClientError
                ? error.upstreamStatus
                : null
          },
          "GitHub feedback request failed"
        );
        return reply.code(502).send(
          createFeedbackError(
            "UPSTREAM_UNAVAILABLE",
            "反馈暂时没有提交成功，请稍后重试。"
          )
        );
      }
    }
  );
}

function extractFeedbackPayload(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { honeypot: false, payload: body };
  }

  const { website, ...payload } = body as Record<string, unknown>;
  return {
    honeypot:
      typeof website === "string" && website.trim().length > 0,
    payload
  };
}

function createFeedbackError(
  code: DrawlessFeedbackErrorResponse["code"],
  message: string
): DrawlessFeedbackErrorResponse {
  return { ok: false, code, message };
}
