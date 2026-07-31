export type FeedbackRateLimitResult =
  | {
      /** 本次提交是否可以继续。 */
      ok: true;
    }
  | {
      /** 本次提交是否可以继续。 */
      ok: false;
      /** 建议客户端等待的秒数。 */
      retryAfterSeconds: number;
    };

export interface FeedbackRateLimiter {
  /** 消耗当前来源的一次提交额度。 */
  consume(key: string): FeedbackRateLimitResult;
}

export function createFeedbackRateLimiter(options?: {
  /** 一个时间窗允许的最大提交次数。 */
  maxRequests?: number;
  /** 限流时间窗的毫秒数。 */
  windowMs?: number;
  /** 测试时可注入的当前时间。 */
  now?: () => number;
}): FeedbackRateLimiter {
  const maxRequests = options?.maxRequests ?? 3;
  const windowMs = options?.windowMs ?? 10 * 60 * 1_000;
  const now = options?.now ?? Date.now;
  const requestsByKey = new Map<string, number[]>();

  return {
    consume(key) {
      const currentTime = now();
      const recentRequests = (requestsByKey.get(key) ?? []).filter(
        (requestedAt) => currentTime - requestedAt < windowMs
      );

      if (recentRequests.length >= maxRequests) {
        const firstRequestAt = recentRequests[0] ?? currentTime;
        return {
          ok: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((firstRequestAt + windowMs - currentTime) / 1_000)
          )
        };
      }

      recentRequests.push(currentTime);
      requestsByKey.set(key, recentRequests);
      return { ok: true };
    }
  };
}
