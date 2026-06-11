import { describe, expect, it } from "vitest";

import { buildRoomPath, decideRoomRoute } from "../room-route";

describe("room routes", () => {
  it("creates canonical room paths", () => {
    expect(buildRoomPath("alpha")).toBe("/rooms/alpha");
    expect(
      decideRoomRoute({ generateRoomId: () => "room-00000000-0000-4000-8000-000000000000" })
    ).toEqual({
      kind: "create",
      roomId: "room-00000000-0000-4000-8000-000000000000",
      path: "/rooms/room-00000000-0000-4000-8000-000000000000"
    });
  });

  it("reports invalid room links without throwing", () => {
    expect(decideRoomRoute({ roomId: "bad room" })).toMatchObject({
      kind: "invalid",
      attemptedRoomId: "bad room"
    });
  });
});
