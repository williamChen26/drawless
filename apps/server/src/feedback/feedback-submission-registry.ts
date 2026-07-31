import type { FeedbackIssueResult } from "./github-feedback-client.js";

type FeedbackSubmissionEntry = {
  /** 缓存条目失效的毫秒时间戳。 */
  expiresAt: number;
  /** 首次提交创建 Issue 的共享 Promise。 */
  result: Promise<FeedbackIssueResult>;
};

export interface FeedbackSubmissionRegistry {
  /** 读取仍在处理或已经完成的同一次提交。 */
  get(key: string): Promise<FeedbackIssueResult> | null;
  /** 执行并暂存一次新提交；失败时立即释放以允许用户重试。 */
  run(
    key: string,
    action: () => Promise<FeedbackIssueResult>
  ): Promise<FeedbackIssueResult>;
}

export function createFeedbackSubmissionRegistry(options?: {
  /** 成功提交结果的缓存毫秒数。 */
  ttlMs?: number;
  /** 测试时可注入的当前时间。 */
  now?: () => number;
}): FeedbackSubmissionRegistry {
  const ttlMs = options?.ttlMs ?? 10 * 60 * 1_000;
  const now = options?.now ?? Date.now;
  const entries = new Map<string, FeedbackSubmissionEntry>();

  function get(key: string) {
    const entry = entries.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= now()) {
      entries.delete(key);
      return null;
    }
    return entry.result;
  }

  return {
    get,
    run(key, action) {
      const existing = get(key);
      if (existing) {
        return existing;
      }

      const result = action().catch((error: unknown) => {
        entries.delete(key);
        throw error;
      });
      entries.set(key, {
        expiresAt: now() + ttlMs,
        result
      });
      return result;
    }
  };
}
