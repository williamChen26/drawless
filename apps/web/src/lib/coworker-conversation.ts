import {
  coworkerApprovalIdSchema,
  coworkerApprovalListResponseSchema,
  coworkerApprovalResolutionRequestSchema,
  coworkerConversationStreamRequestSchema,
  parseDrawlessRoomId,
  type DrawlessCanvasViewportContext,
  type DrawlessCoworkerApprovalSnapshot,
  type DrawlessCoworkerConversationStreamRequest
} from "@drawless/shared";

import { resolveCoworkerControlServerUrl } from "./coworker-control";

export type CoworkerConversationStreamError = {
  /** 错误类型，用于浮窗展示和测试判断。 */
  code:
    | "INVALID_SERVER_URL"
    | "INVALID_ROOM_ID"
    | "INVALID_REQUEST"
    | "INVALID_RESPONSE"
    | "HTTP_ERROR"
    | "MISSING_STREAM";
  /** 给开发阶段直接展示的人类可读错误。 */
  message: string;
  /** 原始错误或响应内容，便于排查链路问题。 */
  raw: unknown;
};

export type CoworkerConversationStreamResult =
  | {
      /** 请求是否成功建立流。 */
      ok: true;
      /** server 返回的文本流，UI 负责逐块读取。 */
      stream: ReadableStream<Uint8Array>;
    }
  | {
      /** 请求是否成功建立流。 */
      ok: false;
      /** 流式请求错误。 */
      error: CoworkerConversationStreamError;
    };

export type CoworkerApprovalRecoveryResult =
  | {
      /** 待恢复审批是否读取成功。 */
      ok: true;
      /** 当前 room 中仍可由用户处理的审批快照。 */
      approvals: DrawlessCoworkerApprovalSnapshot[];
    }
  | {
      /** 待恢复审批是否读取成功。 */
      ok: false;
      /** 读取失败的结构化错误。 */
      error: CoworkerConversationStreamError;
    };

export async function loadCoworkerPendingApprovals(input: {
  /** 当前协同房间 ID。 */
  roomId: string;
  /** drawless server 的 HTTP 或 WebSocket 基础地址。 */
  serverUrl?: string | null | undefined;
  /** 测试时可注入的 fetch 实现。 */
  fetcher?: typeof fetch;
  /** 切换房间或卸载时用于中断恢复请求。 */
  signal?: AbortSignal;
}): Promise<CoworkerApprovalRecoveryResult> {
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
    return {
      ok: false,
      error: {
        code: "INVALID_SERVER_URL",
        message: serverUrl.error.message,
        raw: serverUrl.error.raw
      }
    };
  }

  const requestInit: RequestInit = { method: "GET" };
  if (input.signal) {
    requestInit.signal = input.signal;
  }
  const response = await resolveFetcher(input.fetcher)(
    createCoworkerApprovalListUrl({
      baseUrl: serverUrl.value,
      roomId: roomId.value,
      status: "pending"
    }),
    requestInit
  );
  const raw = await readResponseBody(response);
  if (!response.ok) {
    return {
      ok: false,
      error: {
        code: "HTTP_ERROR",
        message:
          extractErrorMessage(raw) ??
          `Coworker approval recovery returned ${response.status}.`,
        raw
      }
    };
  }

  const result = coworkerApprovalListResponseSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      error: {
        code: "INVALID_RESPONSE",
        message: "Coworker approval recovery returned an invalid response.",
        raw
      }
    };
  }

  return { ok: true, approvals: result.data.approvals };
}

export async function createCoworkerConversationStream(input: {
  /** 当前协同房间 ID。 */
  roomId: string;
  /** 用户在 conversation chat 中输入的消息。 */
  message: string;
  /** conversation 发起时用户当前可视区上下文。 */
  viewport?: DrawlessCanvasViewportContext | null | undefined;
  /** drawless server 的 HTTP 或 WebSocket 基础地址。 */
  serverUrl?: string | null | undefined;
  /** 测试时可注入的 fetch 实现。 */
  fetcher?: typeof fetch;
  /** 关闭浮窗或重新发送时用于中断当前流。 */
  signal?: AbortSignal;
}): Promise<CoworkerConversationStreamResult> {
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

  const request = coworkerConversationStreamRequestSchema.safeParse({
    roomId: roomId.value,
    message: input.message,
    viewport: input.viewport ?? undefined
  });
  if (!request.success) {
    return {
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message:
          request.error.issues[0]?.message ??
          "Invalid coworker conversation request.",
        raw: request.error
      }
    };
  }

  const serverUrl = resolveCoworkerControlServerUrl(input.serverUrl);
  if (!serverUrl.ok) {
    return {
      ok: false,
      error: {
        code: "INVALID_SERVER_URL",
        message: serverUrl.error.message,
        raw: serverUrl.error.raw
      }
    };
  }

  const fetcher = resolveFetcher(input.fetcher);

  const requestInit: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: request.data.message,
      viewport: request.data.viewport ?? null
    })
  };
  if (input.signal) {
    requestInit.signal = input.signal;
  }

  const response = await fetcher(createCoworkerConversationStreamUrl({
    baseUrl: serverUrl.value,
    request: request.data
  }), requestInit);
  if (!response.ok) {
    const raw = await readResponseBody(response);
    return {
      ok: false,
      error: {
        code: "HTTP_ERROR",
        message: extractErrorMessage(raw) ?? `Coworker conversation returned ${response.status}.`,
        raw
      }
    };
  }

  if (!response.body) {
    return {
      ok: false,
      error: {
        code: "MISSING_STREAM",
        message: "Coworker conversation stream is empty.",
        raw: response
      }
    };
  }

  return { ok: true, stream: response.body };
}

export async function createCoworkerApprovalResolutionStream(input: {
  /** 当前协同房间 ID。 */
  roomId: string;
  /** Server 生成的公开审批 ID。 */
  approvalId: string;
  /** 用户对 tool call 的决定。 */
  decision: "approve" | "decline";
  /** drawless server 的 HTTP 或 WebSocket 基础地址。 */
  serverUrl?: string | null | undefined;
  /** 测试时可注入的 fetch 实现。 */
  fetcher?: typeof fetch;
  /** 关闭浮窗或重新发送时用于中断当前流。 */
  signal?: AbortSignal;
}): Promise<CoworkerConversationStreamResult> {
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

  const approvalId = coworkerApprovalIdSchema.safeParse(input.approvalId);
  if (!approvalId.success) {
    return createInvalidApprovalStreamResult(approvalId.error);
  }
  const resolution = coworkerApprovalResolutionRequestSchema.safeParse({
    decision: input.decision
  });
  if (!resolution.success) {
    return createInvalidApprovalStreamResult(resolution.error);
  }

  const serverUrl = resolveCoworkerControlServerUrl(input.serverUrl);
  if (!serverUrl.ok) {
    return {
      ok: false,
      error: {
        code: "INVALID_SERVER_URL",
        message: serverUrl.error.message,
        raw: serverUrl.error.raw
      }
    };
  }

  const fetcher = resolveFetcher(input.fetcher);
  const requestInit: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(resolution.data)
  };
  if (input.signal) {
    requestInit.signal = input.signal;
  }

  const response = await fetcher(createCoworkerApprovalResolutionStreamUrl({
    baseUrl: serverUrl.value,
    roomId: roomId.value,
    approvalId: approvalId.data
  }), requestInit);
  if (!response.ok) {
    const raw = await readResponseBody(response);
    return {
      ok: false,
      error: {
        code: "HTTP_ERROR",
        message: extractErrorMessage(raw) ?? `Coworker conversation returned ${response.status}.`,
        raw
      }
    };
  }

  if (!response.body) {
    return {
      ok: false,
      error: {
        code: "MISSING_STREAM",
        message: "Coworker conversation stream is empty.",
        raw: response
      }
    };
  }

  return { ok: true, stream: response.body };
}

function createInvalidApprovalStreamResult(
  error: { issues: readonly { message?: string | undefined }[] }
): CoworkerConversationStreamResult {
  return {
    ok: false,
    error: {
      code: "INVALID_REQUEST",
      message:
        error.issues[0]?.message ??
        "Invalid coworker conversation approval request.",
      raw: error
    }
  };
}

export async function readCoworkerConversationEventStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: unknown) => void
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      buffer += decoder.decode(value, { stream: true });
      buffer = readCompletedSseEvents(buffer, onEvent);
    }
  }

  buffer += decoder.decode();
  readCompletedSseEvents(`${buffer}\n\n`, onEvent);
}

function createCoworkerConversationStreamUrl(input: {
  /** drawless server 的 HTTP 基础地址。 */
  baseUrl: string;
  /** 已通过 shared schema 校验的 conversation 请求。 */
  request: DrawlessCoworkerConversationStreamRequest;
}) {
  const url = new URL(input.baseUrl);
  url.pathname = joinUrlPath(
    url.pathname,
    "rooms",
    encodeURIComponent(input.request.roomId),
    "coworker",
    "conversation",
    "stream"
  );
  return url.toString();
}

function createCoworkerApprovalListUrl(input: {
  /** drawless server 的 HTTP 基础地址。 */
  baseUrl: string;
  /** 当前协同房间 ID。 */
  roomId: string;
  /** 要恢复的审批生命周期状态。 */
  status: "pending";
}) {
  const url = new URL(input.baseUrl);
  url.pathname = joinUrlPath(
    url.pathname,
    "rooms",
    encodeURIComponent(input.roomId),
    "coworker",
    "approvals"
  );
  url.searchParams.set("status", input.status);
  return url.toString();
}

function createCoworkerApprovalResolutionStreamUrl(input: {
  /** drawless server 的 HTTP 基础地址。 */
  baseUrl: string;
  /** 当前协同房间 ID。 */
  roomId: string;
  /** 已通过 shared schema 校验的公开审批 ID。 */
  approvalId: string;
}) {
  const url = new URL(input.baseUrl);
  url.pathname = joinUrlPath(
    url.pathname,
    "rooms",
    encodeURIComponent(input.roomId),
    "coworker",
    "approvals",
    encodeURIComponent(input.approvalId),
    "resolve"
  );
  return url.toString();
}

function resolveFetcher(fetcher: typeof fetch | undefined) {
  return (
    fetcher ??
    ((resource, init) => {
      // 浏览器里的 window.fetch 不能当作普通函数脱离 window 调用。
      return globalThis.fetch(resource, init);
    })
  );
}

async function readResponseBody(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
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

function readCompletedSseEvents(
  buffer: string,
  onEvent: (event: unknown) => void
) {
  const parts = buffer.split(/\r?\n\r?\n/u);
  const pending = parts.pop() ?? "";
  for (const part of parts) {
    const event = parseSseEvent(part);
    if (event) {
      onEvent(event);
    }
  }

  return pending;
}

function parseSseEvent(rawEvent: string) {
  const dataLines = rawEvent
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart());
  if (dataLines.length === 0) {
    return null;
  }

  try {
    return JSON.parse(dataLines.join("\n")) as unknown;
  } catch {
    return null;
  }
}

function joinUrlPath(...parts: string[]) {
  return `/${parts
    .flatMap((part) => part.split("/"))
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/")}`;
}
