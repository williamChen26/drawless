import {
  coworkerRoomStatusResponseSchema,
  coworkerStopResponseSchema,
  type DrawlessCoworkerControlConfig,
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
    throw new CoworkerControlClientError("Coworker control base url is not configured.", 503);
  }

  return {
    start: async (roomId, request) => {
      const coworkerRequest: DrawlessCoworkerStartRequest = {
        serverUrl: config.serverUrl,
        instanceId: request.instanceId,
        displayName: request.displayName,
        color: request.color,
        waitUntilLoaded: request.waitUntilLoaded ?? true,
        timeoutMs: request.timeoutMs ?? 8_000
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
    }
  };
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
    throw new CoworkerControlClientError("Coworker control base url is not configured.", 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.config.requestTimeoutMs);
  try {
    const requestInit: RequestInit = {
      method: input.method,
      signal: controller.signal
    };
    if (input.body) {
      requestInit.headers = { "content-type": "application/json" };
      requestInit.body = JSON.stringify(input.body);
    }

    const response = await fetch(createCoworkerUrl(input), requestInit);
    const payload = await readJson(response);
    if (!response.ok) {
      throw new CoworkerControlClientError(
        extractErrorMessage(payload) ?? `Coworker control request failed with ${response.status}.`,
        response.status
      );
    }

    return payload;
  } catch (error) {
    if (error instanceof CoworkerControlClientError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new CoworkerControlClientError("Coworker control request timed out.", 504);
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
  action: "start" | "status" | "stop";
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
