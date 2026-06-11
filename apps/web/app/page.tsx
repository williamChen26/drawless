import { redirect } from "next/navigation";

import { decideRoomRoute } from "@/lib/room-route";

export default function HomePage() {
  const decision = decideRoomRoute({});
  if (decision.kind !== "create") {
    throw new Error("Root room entry must create a room route.");
  }

  redirect(decision.path);
}
