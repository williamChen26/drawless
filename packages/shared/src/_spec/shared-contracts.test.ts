import { describe, expect, it } from "vitest";

import {
  canvasSummarySchema,
  coworkerIdentitySchema,
  coworkerInterventionDraftSchema,
  createDrawlessCoworkerSessionId,
  parseDrawlessRoomId,
  parseDrawlessCoworkerSessionId,
  parseDrawlessSessionId
} from "../index.js";

describe("drawless shared contracts", () => {
  it("validates room and session ids at the shared boundary", () => {
    expect(parseDrawlessRoomId("room.alpha-1")).toEqual({
      ok: true,
      value: "room.alpha-1"
    });
    expect(parseDrawlessRoomId("bad room").ok).toBe(false);

    expect(parseDrawlessSessionId("device:tab-1")).toEqual({
      ok: true,
      value: "device:tab-1"
    });
    expect(parseDrawlessSessionId("bad session").ok).toBe(false);
  });

  it("validates coworker identity and session ids", () => {
    const sessionId = createDrawlessCoworkerSessionId({
      roomId: "alpha",
      instanceId: "instance-1"
    });

    expect(sessionId).toBe("coworker:alpha:instance-1");
    expect(parseDrawlessCoworkerSessionId(sessionId)).toEqual({
      ok: true,
      value: sessionId
    });
    expect(parseDrawlessCoworkerSessionId("device:tab-1").ok).toBe(false);

    expect(
      coworkerIdentitySchema.parse({
        roomId: "alpha",
        sessionId,
        displayName: "Drawless Coworker",
        color: "#2563eb",
        instanceId: "instance-1"
      })
    ).toMatchObject({
      roomId: "alpha",
      sessionId
    });
  });

  it("validates canvas summaries and observation events", () => {
    const summary = canvasSummarySchema.parse({
      roomId: "alpha",
      capturedAt: "2026-06-11T00:00:00.000Z",
      currentPageId: "page:page",
      summary: "画布里有一个项目目标区和一个任务拆解区。",
      focus: {
        selectedRecordIds: ["shape:goal"],
        recentlyChangedRecordIds: ["shape:task"],
        viewportRecordIds: ["shape:goal", "shape:task"]
      },
      recentEvents: [
        {
          roomId: "alpha",
          eventId: "event-1",
          occurredAt: "2026-06-11T00:00:01.000Z",
          actorSessionId: "device:tab-1",
          kind: "shape_updated",
          recordIds: ["shape:task"],
          summary: "用户更新了任务节点。"
        }
      ]
    });

    expect(summary.focus.selectedRecordIds).toEqual(["shape:goal"]);
    expect(
      canvasSummarySchema.safeParse({
        ...summary,
        recentEvents: [{ ...summary.recentEvents[0], kind: "bad_kind" }]
      }).success
    ).toBe(false);
  });

  it("validates coworker intervention drafts", () => {
    const draft = coworkerInterventionDraftSchema.parse({
      draftId: "draft-1",
      roomId: "alpha",
      createdAt: "2026-06-11T00:00:02.000Z",
      level: "propose_action",
      kind: "operation_draft",
      message: "我建议补一个问题列表，帮助下一步讨论。",
      operationDrafts: [
        {
          operationType: "create_note",
          intent: "补充讨论入口",
          targetDescription: "任务拆解区域右侧",
          rationale: "当前区域缺少开放问题，容易影响后续推进。",
          requiresUserConfirmation: true
        }
      ]
    });

    expect(draft.operationDrafts[0]?.requiresUserConfirmation).toBe(true);
    expect(
      coworkerInterventionDraftSchema.safeParse({
        ...draft,
        level: "auto_execute"
      }).success
    ).toBe(false);
  });
});
