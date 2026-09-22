import {
  DRAWLESS_COWORKER_DISPLAY_NAME,
  createRoomAccessToken,
  coworkerConversationToolApprovalRequestSchema,
  coworkerRoomStatusResponseSchema,
  coworkerStopResponseSchema,
  coworkerConversationStreamRequestSchema,
  type DrawlessCoworkerControlConfig,
  type DrawlessCoworkerConversationToolApprovalRequest,
  type DrawlessCoworkerConversationStreamRequest,
  type DrawlessCoworkerRoomStatusResponse,
  type DrawlessCoworkerStartRequest,
  type DrawlessCoworkerStopResponse,
  type DrawlessRoomId,
  type DrawlessServerCoworkerStartRequest
} from "@drawless/shared";

export interface CoworkerControlClient {
  /** 请求 coworker 以协作者身份进入指定 room。 */
  start(
    roomId: DrawlessRoomId,
    request: DrawlessServerCoworkerStartRequest
  ): Promise<DrawlessCoworkerRoomStatusResponse>;
  /** 查询 coworker 在指定 room 内的生命周期状态。 */
  status(roomId: DrawlessRoomId): Promise<DrawlessCoworkerRoomStatusResponse>;
  /** 请求 coworker 离开指定 room 并释放本地 sync client。 */
  stop(roomId: DrawlessRoomId): Promise<DrawlessCoworkerStopResponse>;
  /** 向 coworker 发送 conversation chat 长对话请求并返回流式响应。 */
  streamConversation(
    roomId: DrawlessRoomId,
    request: DrawlessCoworkerConversationStreamRequest,
    signal?: AbortSignal
  ): Promise<Response>;
  /** 确认 conversation stream 中等待审批的 tool call，并返回续流响应。 */
  approveConversationToolCall(
    roomId: DrawlessRoomId,
    request: DrawlessCoworkerConversationToolApprovalRequest,
    signal?: AbortSignal
  ): Promise<Response>;
  /** 拒绝 conversation stream 中等待审批的 tool call，并返回续流响应。 */
  declineConversationToolCall(
    roomId: DrawlessRoomId,
    request: DrawlessCoworkerConversationToolApprovalRequest,
    signal?: AbortSignal
  ): Promise<Response>;
}

export class CoworkerControlClientError extends Error {
  constructor(
    message: string,
    readonly statusCode = 502
  ) {
    super(message);
    this.name = "CoworkerControlClientError";
  }
}

export function createCoworkerControlClient(
  config: DrawlessCoworkerControlConfig
): CoworkerControlClient {
  if (!config.baseUrl) {
    throw new CoworkerControlClientError(`${DRAWLESS_COWORKER_DISPLAY_NAME} 的连接服务尚未配置。`, 503);
  }

  return {
    start: async (roomId, request) => {
      // web 只传用户可控项；server 在这里补齐 serverUrl 和默认超时，避免浏览器绕过控制面直连 coworker。
      const coworkerRequest: DrawlessCoworkerStartRequest = {
        serverUrl: config.serverUrl,
        syncRoute: config.syncRoute,
        accessToken: config.roomAccessSecret ? await createRoomAccessToken(roomId, config.roomAccessSecret) : undefined,
        instanceId: request.instanceId,
        displayName: request.displayName,
        color: request.color,
        waitUntilLoaded: request.waitUntilLoaded ?? true,
        timeoutMs: request.timeoutMs ?? 8_000,
        // 入场引导必须由真实 coworker presence 发出，前端不能伪造另一个协作者的 cursor chat。
        sendIntroCursorChat: request.sendIntroCursorChat ?? false
      };
      const payload = await sendCoworkerRequest({
        config,
        roomId,
        action: "start",
        method: "POST",
        body: coworkerRequest
      });

      return coworkerRoomStatusResponseSchema.parse(payload);
    },
    status: async (roomId) => {
      const payload = await sendCoworkerRequest({
        config,
        roomId,
        action: "status",
        method: "GET"
      });

      return coworkerRoomStatusResponseSchema.parse(payload);
    },
    stop: async (roomId) => {
      const payload = await sendCoworkerRequest({
        config,
        roomId,
        action: "stop",
        method: "DELETE"
      });

      return coworkerStopResponseSchema.parse(payload);
    },
    streamConversation: async (roomId, request, signal) => {
      const body = coworkerConversationStreamRequestSchema.parse({
        ...request,
        roomId
      });
      return sendCoworkerStreamRequest({
        config,
        roomId,
        signal,
        action: "conversation/stream",
        body
      });
    },
    approveConversationToolCall: async (roomId, request, signal) => {
      const body = coworkerConversationToolApprovalRequestSchema.parse(request);
      return sendCoworkerStreamRequest({
        config,
        roomId,
        signal,
        action: createConversationToolApprovalAction(body, "approve"),
        body
      });
    },
    declineConversationToolCall: async (roomId, request, signal) => {
      const body = coworkerConversationToolApprovalRequestSchema.parse(request);
      return sendCoworkerStreamRequest({
        config,
        roomId,
        signal,
        action: createConversationToolApprovalAction(body, "decline"),
        body
      });
    }
  };
}

async function sendCoworkerStreamRequest(input: {
  /** coworker 控制面配置。 */
  config: DrawlessCoworkerControlConfig;
  /** 要对话的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** coworker custom API 的流式动作名称。 */
  action: string;
  /** 浏览器关闭请求时取消上游。 */
  signal?: AbortSignal | undefined;
  /** POST 请求体。 */
  body:
    | DrawlessCoworkerConversationStreamRequest
    | DrawlessCoworkerConversationToolApprovalRequest;
}) {
  if (!input.config.baseUrl) {
    throw new CoworkerControlClientError(`${DRAWLESS_COWORKER_DISPLAY_NAME} 的连接服务尚未配置。`, 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.config.requestTimeoutMs);
  try {
    const response = await fetch(createCoworkerUrl(input), {
      method: "POST",
      headers: controlHeaders(input.config),
      body: JSON.stringify(input.body),
      signal: input.signal ? AbortSignal.any([input.signal, controller.signal]) : controller.signal
    });
    if (!response.ok) {
      const payload = await readJson(response);
      throw new CoworkerControlClientError(
        extractErrorMessage(payload) ??
          `暂时无法收到 ${DRAWLESS_COWORKER_DISPLAY_NAME} 的回应（${response.status}）。`,
        response.status
      );
    }

    if (!response.body) return response;
    // 头部超时结束后，整个正文仍有独立上限；下游断开会取消 fetch。
    clearTimeout(timeout);
    const bodyTimer = setTimeout(() => controller.abort(), 120_000);
    const reader = response.body.getReader();
    const cleanup = () => clearTimeout(bodyTimer);
    return new Response(new ReadableStream<Uint8Array>({
      async pull(stream) {
        try {
          const { done, value } = await reader.read();
          if (done) { cleanup(); stream.close(); } else stream.enqueue(value);
        } catch (error) { cleanup(); controller.abort(); stream.error(error); }
      },
      async cancel(reason) { cleanup(); controller.abort(); await reader.cancel(reason).catch(() => undefined); }
    }), { status: response.status, headers: response.headers });
  } catch (error) {
    if (error instanceof CoworkerControlClientError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new CoworkerControlClientError(`等待 ${DRAWLESS_COWORKER_DISPLAY_NAME} 回应超时，请重试。`, 504);
    }

    throw new CoworkerControlClientError(
      error instanceof Error ? error.message : String(error),
      502
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function sendCoworkerRequest(input: {
  /** coworker 控制面配置。 */
  config: DrawlessCoworkerControlConfig;
  /** 要控制的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** coworker custom API 的动作名称。 */
  action: "start" | "status" | "stop";
  /** HTTP 方法。 */
  method: "POST" | "GET" | "DELETE";
  /** POST 请求体；GET/DELETE 不需要。 */
  body?: DrawlessCoworkerStartRequest;
}) {
  if (!input.config.baseUrl) {
    throw new CoworkerControlClientError(`${DRAWLESS_COWORKER_DISPLAY_NAME} 的连接服务尚未配置。`, 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.config.requestTimeoutMs);
  try {
    const requestInit: RequestInit = {
      method: input.method,
      headers: controlHeaders(input.config),
      signal: controller.signal
    };
    if (input.body) {
      requestInit.body = JSON.stringify(input.body);
    }

    const response = await fetch(createCoworkerUrl(input), requestInit);
    const payload = await readJson(response);
    if (!response.ok) {
      throw new CoworkerControlClientError(
        extractErrorMessage(payload) ??
          `暂时无法连接 ${DRAWLESS_COWORKER_DISPLAY_NAME}（${response.status}）。`,
        response.status
      );
    }

    return payload;
  } catch (error) {
    if (error instanceof CoworkerControlClientError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new CoworkerControlClientError(`连接 ${DRAWLESS_COWORKER_DISPLAY_NAME} 超时，请重试。`, 504);
    }

    throw new CoworkerControlClientError(
      error instanceof Error ? error.message : String(error),
      502
    );
  } finally {
    clearTimeout(timeout);
  }
}

function createCoworkerUrl(input: {
  config: DrawlessCoworkerControlConfig;
  roomId: DrawlessRoomId;
  action: string;
}) {
  const url = new URL(input.config.baseUrl ?? "http://127.0.0.1");
  // coworker custom API 不挂在 Mastra 默认 /api 前缀下，而是直接注册在 root path。
  url.pathname = joinUrlPath(
    url.pathname,
    "drawless",
    "rooms",
    encodeURIComponent(input.roomId),
    "coworker",
    input.action
  );

  return url.toString();
}

function createConversationToolApprovalAction(
  request: DrawlessCoworkerConversationToolApprovalRequest,
  decision: "approve" | "decline"
) {
  return joinUrlPath(
    "conversation",
    encodeURIComponent(request.runId),
    "tool-calls",
    encodeURIComponent(request.toolCallId),
    decision
  ).slice(1);
}

async function readJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function extractErrorMessage(payload: unknown) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  return null;
}

function joinUrlPath(...parts: string[]) {
  return `/${parts
    .flatMap((part) => part.split("/"))
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/")}`;
}

function controlHeaders(config: DrawlessCoworkerControlConfig) {
  return { "content-type": "application/json", ...(config.controlToken ? { authorization: `Bearer ${config.controlToken}` } : {}) };
}
