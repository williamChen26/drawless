import { useEffect, useState } from "react";

import { buildRoomPath } from "@/lib/room-route";

export type RoomShareState = {
  /** 当前房间可复制或直接打开的完整 URL；生成失败时为 null。 */
  url: string | null;
};

export function useRoomShare(roomId: string): RoomShareState {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      setUrl(new URL(buildRoomPath(roomId), window.location.origin).toString());
    } catch {
      setUrl(null);
    }
  }, [roomId]);

  return { url };
}
