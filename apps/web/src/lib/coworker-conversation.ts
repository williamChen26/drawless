import {
  coworkerConversationStreamRequestSchema,
  parseDrawlessRoomId,
  type DrawlessCoworkerConversationStreamRequest
} from "@drawless/shared";

import { resolveCoworkerControlServerUrl } from "./coworker-control";

export type CoworkerConversationStreamError = {
  /** 错误类型，用于浮窗展示和测试判断。 */
  code:
    | "INVALID_SERVER_URL"
    | "INVALID_ROOM_ID"
    | "INVALID_REQUEST"
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

export async function createCoworkerConversationStream(input: {
  /** 当前协同房间 ID。 */
  roomId: string;
  /** 用户在 conversation chat 中输入的消息。 */
  message: string;
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
    message: input.message
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

  const fetcher: typeof fetch =
    input.fetcher ??
    ((resource, init) => {
      // 浏览器里的 window.fetch 不能当作普通函数脱离 window 调用。
      return globalThis.fetch(resource, init);
    });

  const requestInit: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: request.data.message })
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
