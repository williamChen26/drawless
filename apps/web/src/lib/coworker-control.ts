import {
  DRAWLESS_COWORKER_DISPLAY_NAME,
  coworkerRoomStatusResponseSchema,
  coworkerStopResponseSchema,
  parseDrawlessRoomId,
  serverCoworkerStartRequestSchema,
  type DrawlessCoworkerRoomStatusResponse,
  type DrawlessCoworkerStopResponse,
  type DrawlessServerCoworkerStartRequest
} from "@drawless/shared";

const DEFAULT_DRAWLESS_SERVER_URL = "http://127.0.0.1:3001";

export type CoworkerControlError = {
  /** 错误类型，用于 UI 和测试判断。 */
  code:
    | "INVALID_SERVER_URL"
    | "INVALID_ROOM_ID"
    | "INVALID_START_REQUEST"
    | "HTTP_ERROR"
    | "INVALID_RESPONSE";
  /** 给调试壳层展示的人类可读错误。 */
  message: string;
  /** 原始错误或响应，便于开发阶段排查。 */
  raw: unknown;
};

export type CoworkerControlResult<T> =
  | {
      /** 请求是否成功。 */
      ok: true;
      /** 已通过 shared schema 校验的响应。 */
      value: T;
    }
  | {
      /** 请求是否成功。 */
      ok: false;
      /** 控制面请求错误。 */
      error: CoworkerControlError;
    };

export type CoworkerControlClient = {
  /** 查询 coworker 在当前 room 的状态。 */
  status(): Promise<CoworkerControlResult<DrawlessCoworkerRoomStatusResponse>>;
  /** 显式请求 coworker 进入当前 room。 */
  start(
    request?: DrawlessServerCoworkerStartRequest
  ): Promise<CoworkerControlResult<DrawlessCoworkerRoomStatusResponse>>;
  /** 显式请求 coworker 离开当前 room。 */
  stop(): Promise<CoworkerControlResult<DrawlessCoworkerStopResponse>>;
};

export function createCoworkerControlClient(input: {
  /** 当前协同房间 ID。 */
  roomId: string;
  /** drawless server 的 HTTP 或 WebSocket 基础地址。 */
  serverUrl?: string | null | undefined;
  /** 测试时可注入的 fetch 实现。 */
  fetcher?: typeof fetch;
}): CoworkerControlClient {
  const fetcher: typeof fetch =
    input.fetcher ??
    ((resource, init) => {
      // 浏览器里的 window.fetch 不能当作普通函数脱离 window 调用，否则部分运行时会抛 Illegal invocation。
      return globalThis.fetch(resource, init);
    });

  return {
    status: () =>
      sendCoworkerControlRequest({
        roomId: input.roomId,
        serverUrl: input.serverUrl,
        action: "status",
        method: "GET",
        fetcher,
        parseResponse: (payload) => coworkerRoomStatusResponseSchema.safeParse(payload)
      }),
    start: (request = {}) => {
      const parsedRequest = serverCoworkerStartRequestSchema.safeParse(request);
      if (!parsedRequest.success) {
        return Promise.resolve({
          ok: false,
          error: {
            code: "INVALID_START_REQUEST",
            message:
              parsedRequest.error.issues[0]?.message ??
              "Invalid coworker start request.",
            raw: parsedRequest.error
          }
        });
      }

      return sendCoworkerControlRequest({
        roomId: input.roomId,
        serverUrl: input.serverUrl,
        action: "start",
        method: "POST",
        body: parsedRequest.data,
        fetcher,
        parseResponse: (payload) => coworkerRoomStatusResponseSchema.safeParse(payload)
      });
    },
    stop: () =>
      sendCoworkerControlRequest({
        roomId: input.roomId,
        serverUrl: input.serverUrl,
        action: "stop",
        method: "DELETE",
        fetcher,
        parseResponse: (payload) => coworkerStopResponseSchema.safeParse(payload)
      })
  };
}

export function resolveCoworkerControlServerUrl(
  serverUrl?: string | null | undefined
): CoworkerControlResult<string> {
  const rawUrl = serverUrl?.trim() || DEFAULT_DRAWLESS_SERVER_URL;
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "ws:") {
      url.protocol = "http:";
    } else if (url.protocol === "wss:") {
      url.protocol = "https:";
    } else if (url.protocol !== "http:" && url.protocol !== "https:") {
      return {
        ok: false,
        error: {
          code: "INVALID_SERVER_URL",
          message: `${DRAWLESS_COWORKER_DISPLAY_NAME} 的连接地址格式不受支持。`,
          raw: rawUrl
        }
      };
    }

    url.pathname = url.pathname.replace(/\/+$/u, "");
    url.search = "";
    url.hash = "";
    return { ok: true, value: url.toString().replace(/\/$/u, "") };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "INVALID_SERVER_URL",
        message: `${DRAWLESS_COWORKER_DISPLAY_NAME} 的连接地址配置不完整。`,
        raw: error
      }
    };
  }
}

async function sendCoworkerControlRequest<T>(input: {
  /** 当前协同房间 ID。 */
  roomId: string;
  /** drawless server 的 HTTP 或 WebSocket 基础地址。 */
  serverUrl?: string | null | undefined;
  /** server coworker route 动作。 */
  action: "start" | "status" | "stop";
  /** HTTP 方法。 */
  method: "POST" | "GET" | "DELETE";
  /** 请求体，仅 start 需要。 */
  body?: DrawlessServerCoworkerStartRequest | undefined;
  /** fetch 实现。 */
  fetcher: typeof fetch;
  /** shared schema safeParse。 */
  parseResponse: (payload: unknown) => {
    success: boolean;
    data?: T;
    error?: unknown;
  };
}): Promise<CoworkerControlResult<T>> {
  const roomId = parseDrawlessRoomId(input.roomId);
  if (!roomId.ok) {
    return {
      ok: false,
      error: {
        code: "INVALID_ROOM_ID",
        message: roomId.reason,
        raw: input.roomId
      }
    };
  }

  const serverUrl = resolveCoworkerControlServerUrl(input.serverUrl);
  if (!serverUrl.ok) {
    return serverUrl;
  }

  const response = await input.fetcher(createCoworkerControlUrl({
    baseUrl: serverUrl.value,
    roomId: roomId.value,
    action: input.action
  }), createRequestInit(input));
  const payload = await readJson(response);
  if (!response.ok) {
    return {
      ok: false,
      error: {
        code: "HTTP_ERROR",
        message:
          extractErrorMessage(payload) ??
          `暂时无法连接 ${DRAWLESS_COWORKER_DISPLAY_NAME}（${response.status}）。`,
        raw: payload
      }
    };
  }

  const parsed = input.parseResponse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "INVALID_RESPONSE",
        message: `${DRAWLESS_COWORKER_DISPLAY_NAME} 的连接服务返回了无法识别的数据。`,
        raw: parsed.error
      }
    };
  }

  return { ok: true, value: parsed.data as T };
}

function createRequestInit(input: {
  method: "POST" | "GET" | "DELETE";
  body?: DrawlessServerCoworkerStartRequest | undefined;
}): RequestInit {
  const request: RequestInit = { method: input.method };
  if (input.body) {
    request.headers = { "content-type": "application/json" };
    request.body = JSON.stringify(input.body);
  }

  return request;
}

function createCoworkerControlUrl(input: {
  /** drawless server 的 HTTP 基础地址。 */
  baseUrl: string;
  /** 当前协同房间 ID。 */
  roomId: string;
  /** server coworker route 动作。 */
  action: "start" | "status" | "stop";
}) {
  const url = new URL(input.baseUrl);
  url.pathname = joinUrlPath(
    url.pathname,
    "rooms",
    encodeURIComponent(input.roomId),
    "coworker",
    input.action
  );
  return url.toString();
}

async function readJson(response: Response) {
  try {
    return await response.json();
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
