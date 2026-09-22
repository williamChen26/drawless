import { createRoomAccessToken } from "@drawless/shared";
import { redirect } from "next/navigation";

import { decideRoomRoute } from "@/lib/room-route";

// 每次访问都创建新房间，不能把构建时生成的随机地址缓存给所有访客。
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const decision = decideRoomRoute({});
  if (decision.kind !== "create") {
    throw new Error("Root room entry must create a room route.");
  }

  const secret = process.env.DRAWLESS_ROOM_ACCESS_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("生产部署必须配置 DRAWLESS_ROOM_ACCESS_SECRET。");
  }
  const token = secret ? await createRoomAccessToken(decision.roomId, secret) : null;
  redirect(token ? `${decision.path}#access=${token}` : decision.path);
}
