import { InMemorySyncStorage, TLSocketRoom } from "@tldraw/sync-core";
import {
  parseDrawlessRoomId,
  type DrawlessRoomRegistryStats
} from "@drawless/shared";

/**
 * `@tldraw/sync-core` 拥有的运行时房间对象。
 */
export type SyncRoom = TLSocketRoom;

/**
 * 创建和观测进程本地 tldraw 协同房间的最小注册表。
 */
export type RoomRegistry = {
  getOrCreateRoom: (roomId: string) => SyncRoom;
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
  const rooms = new Map<string, SyncRoom>();

  return {
    getOrCreateRoom(roomId: string) {
      const parsed = parseDrawlessRoomId(roomId);
      if (!parsed.ok) {
        throw new Error(`Invalid room id: ${parsed.reason}`);
      }

      const existing = rooms.get(parsed.value);
      if (existing) {
        return existing;
      }

      const room = new TLSocketRoom({
        storage: new InMemorySyncStorage(),
        log: {
          warn: console.warn,
          error: console.error
        }
      });
      rooms.set(parsed.value, room);
      return room;
    },

    getStats() {
      const roomIds = [...rooms.keys()].sort();
      return {
        roomCount: roomIds.length,
        roomIds
      };
    },

    closeAll() {
      for (const room of rooms.values()) {
        room.close();
      }
      rooms.clear();
    }
  };
}
