import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import type { WebSocketMinimal } from "@tldraw/sync-core";
import type { WebSocket } from "ws";

import type { RoomRegistry, SyncRoom } from "../room-registry.js";
import { attachTldrawSyncSocket } from "../tldraw-sync.js";

describe("tldraw sync socket adapter", () => {
  it("forwards only one terminal event when ws emits error and close", () => {
    const socket = new FakeWebSocket();
    const adaptedSockets: WebSocketMinimal[] = [];
    const registry = createFakeRegistry((socket) => {
      adaptedSockets.push(socket);
    });

    const result = attachTldrawSyncSocket(
      socket as unknown as WebSocket,
      {
        roomId: "alpha",
        sessionId: "tab-00000000-0000-4000-8000-000000000001",
        origin: "http://127.0.0.1:3000"
      },
      registry,
      { allowedOrigins: ["http://127.0.0.1:3000"] }
    );

    expect(result.ok).toBe(true);
    const syncSocket = adaptedSockets[0];
    if (!syncSocket?.addEventListener) {
      throw new Error("Expected sync socket adapter to be captured.");
    }

    const terminalEvents: string[] = [];
    syncSocket.addEventListener("error", () => {
      terminalEvents.push("error");
    });
    syncSocket.addEventListener("close", () => {
      terminalEvents.push("close");
    });

    socket.emit("error", new Error("socket failed"));
    socket.emit("close");

    expect(terminalEvents).toEqual(["error"]);
  });
});

class FakeWebSocket extends EventEmitter {
  readyState = 1;

  send() {
    return;
  }

  close() {
    this.readyState = 3;
  }
}

function createFakeRegistry(
  onSocket: (socket: WebSocketMinimal) => void
): RoomRegistry {
  const room = {
    handleSocketConnect(input: { socket: WebSocketMinimal }) {
      onSocket(input.socket);
    },
    close() {
      return;
    }
  } as unknown as SyncRoom;

  return {
    getOrCreateRoom: () => room,
    registerConnection: () => () => undefined,
    getStats: () => ({ roomCount: 1, roomIds: ["alpha"] }),
    closeAll: () => undefined
  };
}
