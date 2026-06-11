import type { WebSocketMinimal } from "@tldraw/sync-core";
import {
  TLSyncErrorCloseEventCode,
  TLSyncErrorCloseEventReason
} from "@tldraw/sync-core";
import {
  parseDrawlessRoomId,
  parseDrawlessSessionId,
  type DrawlessServerConfig
} from "@drawless/shared";
import type { WebSocket } from "ws";

import { isOriginAllowed } from "../config.js";
import type { RoomRegistry } from "./room-registry.js";

/**
 * 协同路由收到的原始 WebSocket 连接元数据。
 */
export type SyncConnectionRequest = {
  roomId: unknown;
  sessionId: unknown;
  origin: string | undefined;
};

/**
 * WebSocket 接受/拒绝逻辑的结构化结果，方便测试。
 */
export type SyncConnectionResult =
  | { ok: true; roomId: string; sessionId: string }
  | { ok: false; reason: string };

/**
 * 校验来源、房间 ID 和会话 ID，然后把原始 WebSocket 接到房间的
 * tldraw `TLSocketRoom` 上。
 */
export function attachTldrawSyncSocket(
  socket: WebSocket,
  request: SyncConnectionRequest,
  registry: RoomRegistry,
  config: Pick<DrawlessServerConfig, "allowedOrigins">
): SyncConnectionResult {
  if (!isOriginAllowed(request.origin, config.allowedOrigins)) {
    closeSocket(socket, TLSyncErrorCloseEventReason.FORBIDDEN);
    return { ok: false, reason: "Origin is not allowed." };
  }

  const roomId = parseDrawlessRoomId(request.roomId);
  if (!roomId.ok) {
    closeSocket(socket, TLSyncErrorCloseEventReason.NOT_FOUND);
    return { ok: false, reason: roomId.reason };
  }

  const sessionId = parseDrawlessSessionId(request.sessionId);
  if (!sessionId.ok) {
    closeSocket(socket, TLSyncErrorCloseEventReason.NOT_AUTHENTICATED);
    return { ok: false, reason: sessionId.reason };
  }

  const room = registry.getOrCreateRoom(roomId.value);
  room.handleSocketConnect({
    sessionId: sessionId.value,
    socket: toMinimalWebSocket(socket)
  });

  return { ok: true, roomId: roomId.value, sessionId: sessionId.value };
}

/**
 * 使用 tldraw 期望的错误关闭码关闭被拒绝的协同套接字。
 */
function closeSocket(socket: WebSocket, reason: string): void {
  socket.close(TLSyncErrorCloseEventCode, reason);
}

/**
 * 把 `ws` WebSocket 事件适配为 `@tldraw/sync-core` 期望的最小浏览器式
 * 套接字接口。
 */
function toMinimalWebSocket(socket: WebSocket): WebSocketMinimal {
  const listeners = new Map<
    (event: unknown) => void,
    { type: "message" | "close" | "error"; wrapped: (...args: unknown[]) => void }
  >();

  return {
    get readyState() {
      return socket.readyState;
    },
    send(data: string) {
      socket.send(data);
    },
    close(code?: number, reason?: string) {
      socket.close(code, reason);
    },
    addEventListener(type, listener) {
      const wrapped = (...args: unknown[]) => {
        if (type === "message") {
          listener({ data: normalizeMessageData(args[0]) });
          return;
        }
        listener(args[0] ?? {});
      };

      listeners.set(listener, { type, wrapped });
      socket.on(type, wrapped);
    },
    removeEventListener(type, listener) {
      const registered = listeners.get(listener);
      if (registered && registered.type === type) {
        socket.off(type, registered.wrapped);
        listeners.delete(listener);
      }
    }
  };
}

/**
 * 将 Node `ws` 的多种消息载荷标准化成 tldraw 协同核心监听器
 * 可接受的数据形态。
 */
function normalizeMessageData(data: unknown): string | ArrayBufferLike | ArrayBufferView {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return data;
  }
  if (ArrayBuffer.isView(data)) {
    return data;
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data as Buffer[]);
  }

  return Buffer.from(String(data));
}
