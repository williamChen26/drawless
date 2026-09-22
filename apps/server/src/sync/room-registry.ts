import { InMemorySyncStorage, TLSocketRoom } from "@tldraw/sync-core";
import {
  parseDrawlessRoomId,
  type DrawlessRoomRegistryStats
} from "@drawless/shared";

/**
 * `@tldraw/sync-core` 拥有的运行时房间对象。
 */
export type SyncRoom = TLSocketRoom;

type RoomEntry = {
  /** 当前 room 的 tldraw sync room 实例。 */
  room: SyncRoom;
  /** 当前 room 内仍然打开的 WebSocket 连接数。 */
  connectionCount: number;
  /** 当前 room 最近一次连接状态变化时间。 */
  updatedAt: number;
  /** 当前 room 空闲后的延迟回收 timer。 */
  idleTimer: ReturnType<typeof setTimeout> | null;
};

/**
 * 创建和观测进程本地 tldraw 协同房间的最小注册表。
 */
export type RoomRegistry = {
  getOrCreateRoom: (roomId: string) => SyncRoom;
  registerConnection: (roomId: string) => () => void;
  getStats: () => DrawlessRoomRegistryStats;
  closeAll: () => void;
};

/**
 * 创建进程本地 tldraw 房间注册表。
 *
 * 当前版本使用 `InMemorySyncStorage` 保持项目轻量；生产持久化可以在这里替换成
 * `SQLiteSyncStorage` 或 Cloudflare Durable Object 版本。
 */
export function createRoomRegistry(): RoomRegistry {
  const rooms = new Map<string, RoomEntry>();
  const getOrCreateEntry = (roomId: string) => {
    const parsed = parseDrawlessRoomId(roomId);
    if (!parsed.ok) {
      throw new Error(`Invalid room id: ${parsed.reason}`);
    }

    const existing = rooms.get(parsed.value);
    if (existing) {
      return { roomId: parsed.value, entry: existing };
    }

    if (rooms.size >= 100) throw new Error("房间数量已达上限。");
    const room = createSyncRoom();
    const entry: RoomEntry = {
      room,
      connectionCount: 0,
      updatedAt: Date.now(),
      idleTimer: null
    };
    rooms.set(parsed.value, entry);

    return { roomId: parsed.value, entry };
  };

  return {
    getOrCreateRoom(roomId: string) {
      return getOrCreateEntry(roomId).entry.room;
    },

    registerConnection(roomId: string) {
      const roomEntry = getOrCreateEntry(roomId);
      const entry = roomEntry.entry;
      const normalizedRoomId = roomEntry.roomId;

      if (entry.connectionCount >= 32) throw new Error("房间连接数量已达上限。");
      if (entry.idleTimer) {
        clearTimeout(entry.idleTimer);
        entry.idleTimer = null;
      }
      entry.connectionCount += 1;
      entry.updatedAt = Date.now();

      let released = false;
      return () => {
        if (released) {
          return;
        }
        released = true;
        const current = rooms.get(normalizedRoomId);
        if (!current) {
          return;
        }

        current.connectionCount = Math.max(0, current.connectionCount - 1);
        current.updatedAt = Date.now();
        if (current.connectionCount === 0) {
          scheduleIdleClose(rooms, normalizedRoomId, current);
        }
      };
    },

    getStats() {
      const roomIds = [...rooms.keys()].sort();
      return {
        roomCount: roomIds.length,
        roomIds
      };
    },

    closeAll() {
      for (const entry of rooms.values()) {
        if (entry.idleTimer) {
          clearTimeout(entry.idleTimer);
        }
        entry.room.close();
      }
      rooms.clear();
    }
  };
}

const ROOM_IDLE_TTL_MS = 30 * 60 * 1000;

function createSyncRoom() {
  return new TLSocketRoom({
    storage: new InMemorySyncStorage(),
    log: {
      warn: console.warn,
      error: console.error
    }
  });
}

function scheduleIdleClose(
  rooms: Map<string, RoomEntry>,
  roomId: string,
  entry: RoomEntry
) {
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer);
  }

  entry.idleTimer = setTimeout(() => {
    const current = rooms.get(roomId);
    if (!current || current !== entry || current.connectionCount > 0) {
      return;
    }

    current.room.close();
    rooms.delete(roomId);
  }, ROOM_IDLE_TTL_MS);
  entry.idleTimer.unref?.();
}
