import type {
  DrawlessFeedbackCategory,
  DrawlessFeedbackRequest
} from "@drawless/shared";

import type { FeedbackServerConfig } from "../config.js";

const GITHUB_API_VERSION = "2026-03-10";

export interface FeedbackIssueResult {
  /** GitHub 创建的 Issue 编号。 */
  issueNumber: number;
}

export interface FeedbackClient {
  /** 把一条已校验的匿名反馈写入反馈仓库。 */
  createIssue(
    request: DrawlessFeedbackRequest
  ): Promise<FeedbackIssueResult>;
}

export class GithubFeedbackClientError extends Error {
  constructor(
    message: string,
    /** GitHub 返回的 HTTP 状态；网络错误时为 null。 */
    readonly upstreamStatus: number | null
  ) {
    super(message);
    this.name = "GithubFeedbackClientError";
  }
}

export function createGithubFeedbackClient(
  config: Extract<FeedbackServerConfig, { enabled: true }>,
  options: {
    /** 测试时可注入的 fetch 实现。 */
    fetcher?: typeof fetch;
    /** 测试时可注入的 server 时间。 */
    now?: () => Date;
  } = {}
): FeedbackClient {
  const fetcher = options.fetcher ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());

  return {
    async createIssue(request) {
      const endpoint = new URL(
        `/repos/${config.repository}/issues`,
        "https://api.github.com"
      );
      let response: Response;

      try {
        response = await fetcher(endpoint, {
          method: "POST",
          headers: {
            accept: "application/vnd.github+json",
            authorization: `Bearer ${config.token}`,
            "content-type": "application/json",
            "x-github-api-version": GITHUB_API_VERSION
          },
          body: JSON.stringify(createGithubIssuePayload(request, now())),
          signal: AbortSignal.timeout(config.requestTimeoutMs)
        });
      } catch (error) {
        throw new GithubFeedbackClientError(
          error instanceof Error ? error.message : "GitHub request failed.",
          null
        );
      }

      if (!response.ok) {
        throw new GithubFeedbackClientError(
          `GitHub create issue failed with status ${response.status}.`,
          response.status
        );
      }

      const payload = (await response.json()) as unknown;
      if (
        !payload ||
        typeof payload !== "object" ||
        !("number" in payload) ||
        typeof payload.number !== "number" ||
        !Number.isInteger(payload.number) ||
        payload.number < 1
      ) {
        throw new GithubFeedbackClientError(
          "GitHub create issue returned an invalid response.",
          response.status
        );
      }

      return { issueNumber: payload.number };
    }
  };
}

function createGithubIssuePayload(
  request: DrawlessFeedbackRequest,
  submittedAt: Date
) {
  const category = getCategoryMetadata(request.category);
  const message = sanitizeFeedbackMarkdown(request.message);
  const firstLine =
    request.message
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find(Boolean) ?? "用户反馈";
  const summary = sanitizeFeedbackTitle(firstLine).slice(0, 72);

  return {
    title: `${category.titlePrefix} ${summary}`,
    body: [
      "## 反馈内容",
      "",
      message,
      "",
      "## 基本信息",
      "",
      `- 类型：${category.label}`,
      "- 来源：drawless web",
      `- 界面：${request.surface}`,
      `- 提交时间：${submittedAt.toISOString()}`,
      "",
      "> 这条 Issue 由 drawless 应用内的匿名反馈入口创建。"
    ].join("\n"),
    labels: category.githubLabels
  };
}

function getCategoryMetadata(category: DrawlessFeedbackCategory) {
  switch (category) {
    case "bug":
      return {
        titlePrefix: "[问题]",
        label: "问题",
        githubLabels: ["bug"]
      };
    case "suggestion":
      return {
        titlePrefix: "[建议]",
        label: "建议",
        githubLabels: ["enhancement"]
      };
    case "other":
      return {
        titlePrefix: "[反馈]",
        label: "其他",
        githubLabels: []
      };
  }
}

function sanitizeFeedbackTitle(value: string) {
  return value
    .replace(/[\r\n\t]+/gu, " ")
    .replace(/[[\]#*_`<>]/gu, "")
    .replace(/@/gu, "@\u200B")
    .replace(/\s+/gu, " ")
    .trim();
}

function sanitizeFeedbackMarkdown(value: string) {
  return value
    .replace(/@/gu, "@\u200B")
    .replace(/!\[/gu, "\\![")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}
