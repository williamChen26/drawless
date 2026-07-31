import {
  drawlessFeedbackRequestSchema,
  drawlessFeedbackResponseSchema,
  type DrawlessFeedbackRequest,
  type DrawlessFeedbackResponse
} from "@drawless/shared";

const DEFAULT_DRAWLESS_SERVER_URL = "http://127.0.0.1:3001";

export async function submitDrawlessFeedback(input: {
  /** 准备提交到 server 的反馈业务字段。 */
  request: DrawlessFeedbackRequest;
  /** 不参与业务的隐藏反机器人字段。 */
  website?: string | undefined;
  /** drawless server 的 HTTP 或 WebSocket 基础地址。 */
  serverUrl?: string | null | undefined;
  /** 测试时可注入的 fetch 实现。 */
  fetcher?: typeof fetch;
}): Promise<DrawlessFeedbackResponse> {
  const request = drawlessFeedbackRequestSchema.safeParse(input.request);
  if (!request.success) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      message:
        request.error.issues[0]?.message ?? "反馈内容格式不正确。"
    };
  }

  const endpoint = resolveFeedbackEndpoint(input.serverUrl);
  if (!endpoint) {
    return {
      ok: false,
      code: "FEEDBACK_UNAVAILABLE",
      message: "反馈服务地址配置不完整。"
    };
  }

  const fetcher =
    input.fetcher ??
    ((resource: URL | RequestInfo, init?: RequestInit) =>
      globalThis.fetch(resource, init));

  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        ...request.data,
        website: input.website ?? ""
      })
    });
    const payload = await readJsonResponse(response);
    const parsed = drawlessFeedbackResponseSchema.safeParse(payload);
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // 网络错误与非 JSON 响应对用户使用同一稳定文案，原始详情不进入反馈表单状态。
  }

  return {
    ok: false,
    code: "UPSTREAM_UNAVAILABLE",
    message: "反馈暂时没有提交成功，请稍后重试。"
  };
}

function resolveFeedbackEndpoint(
  serverUrl?: string | null | undefined
) {
  const rawUrl = serverUrl?.trim() || DEFAULT_DRAWLESS_SERVER_URL;
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "ws:") {
      url.protocol = "http:";
    } else if (url.protocol === "wss:") {
      url.protocol = "https:";
    } else if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    url.pathname = `${url.pathname.replace(/\/+$/u, "")}/feedback`;
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
