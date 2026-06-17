import { describe, expect, it } from "vitest";

import {
  canvasContextRequestSchema,
  canvasContextSnapshotSchema,
  canvasSemanticGraphSchema,
  canvasSummarySchema,
  coworkerConversationStreamRequestSchema,
  coworkerControlConfigSchema,
  coworkerIdentitySchema,
  coworkerRoomStatusResponseSchema,
  coworkerStartRequestSchema,
  coworkerStopResponseSchema,
  createDrawlessCoworkerSessionId,
  parseDrawlessRoomId,
  parseDrawlessCoworkerSessionId,
  parseDrawlessSessionId,
  serverCoworkerStartRequestSchema
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

  it("validates coworker room control contracts", () => {
    const startRequest = coworkerStartRequestSchema.parse({
      serverUrl: "http://127.0.0.1:3001"
    });

    expect(startRequest).toMatchObject({
      serverUrl: "http://127.0.0.1:3001",
      waitUntilLoaded: true,
      timeoutMs: 8000
    });
    expect(
      coworkerStartRequestSchema.safeParse({
        serverUrl: "file:///tmp/drawless"
      }).success
    ).toBe(false);

    const sessionId = createDrawlessCoworkerSessionId({
      roomId: "alpha",
      instanceId: "instance-1"
    });
    const status = coworkerRoomStatusResponseSchema.parse({
      roomId: "alpha",
      active: true,
      status: "online",
      identity: {
        roomId: "alpha",
        sessionId,
        displayName: "Drawless Coworker",
        color: "#2563eb",
        instanceId: "instance-1"
      },
      snapshot: {
        roomId: "alpha",
        sessionId,
        recordCount: 6,
        documentRecordCount: 2,
        shapeCount: 0,
        presenceCount: 0,
        capturedAt: "2026-06-11T00:00:00.000Z"
      },
      lastError: null,
      startedAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-11T00:00:01.000Z"
    });

    expect(status.snapshot?.recordCount).toBe(6);
    expect(
      coworkerRoomStatusResponseSchema.safeParse({
        ...status,
        status: "connected"
      }).success
    ).toBe(false);

    expect(
      coworkerStopResponseSchema.parse({
        roomId: "alpha",
        stopped: true,
        status: "stopped"
      })
    ).toMatchObject({ stopped: true });

    expect(
      coworkerControlConfigSchema.parse({
        enabled: true,
        baseUrl: "http://127.0.0.1:4111",
        serverUrl: "http://127.0.0.1:3001",
        requestTimeoutMs: 10000
      })
    ).toMatchObject({ enabled: true });
    expect(
      coworkerControlConfigSchema.safeParse({
        enabled: true,
        baseUrl: "file:///tmp/coworker",
        serverUrl: "http://127.0.0.1:3001",
        requestTimeoutMs: 10000
      }).success
    ).toBe(false);

    expect(
      serverCoworkerStartRequestSchema.parse({
        displayName: "Drawless Coworker",
        waitUntilLoaded: false
      })
    ).toMatchObject({ waitUntilLoaded: false });

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

  it("validates canvas semantic graphs", () => {
    const graph = canvasSemanticGraphSchema.parse({
      roomId: "alpha",
      generatedAt: "2026-06-11T00:00:00.000Z",
      currentPageId: "page:page",
      nodes: [
        {
          id: "shape:goal",
          kind: "text",
          shapeType: "text",
          text: "项目目标",
          bounds: { x: 10, y: 20, w: 120, h: 40 },
          parentId: "page:page",
          pageId: "page:page"
        }
      ],
      edges: [
        {
          id: "shape:arrow",
          fromId: "shape:goal",
          toId: "shape:task",
          label: "拆解为",
          direction: "forward",
          recordId: "shape:arrow"
        }
      ],
      regions: [
        {
          id: "shape:frame",
          kind: "frame",
          title: "项目区域",
          bounds: { x: 0, y: 0, w: 400, h: 300 },
          shapeIds: ["shape:goal"]
        }
      ]
    });

    expect(graph.edges[0]?.fromId).toBe("shape:goal");
    expect(
      canvasSemanticGraphSchema.safeParse({
        ...graph,
        nodes: [{ ...graph.nodes[0], kind: "mindmap" }]
      }).success
    ).toBe(false);
    expect(
      canvasSemanticGraphSchema.safeParse({
        ...graph,
        edges: [{ ...graph.edges[0], direction: "sideways" }]
      }).success
    ).toBe(false);
  });

  it("validates canvas context collection contracts", () => {
    const request = canvasContextRequestSchema.parse({
      roomId: "alpha",
      currentPageId: "page:page",
      focusedRecordIds: ["shape:goal"],
      cursor: { x: 120, y: 240 },
      maxNodes: 60
    });

    expect(request.focusedRecordIds).toEqual(["shape:goal"]);
    expect(
      canvasContextRequestSchema.safeParse({
        roomId: "alpha",
        maxNodes: 1
      }).success
    ).toBe(false);

    const context = canvasContextSnapshotSchema.parse({
      roomId: "alpha",
      available: true,
      capturedAt: "2026-06-11T00:00:00.000Z",
      currentPageId: "page:page",
      summary: {
        roomId: "alpha",
        capturedAt: "2026-06-11T00:00:00.000Z",
        currentPageId: "page:page",
        summary: "画布包含 1 个 shape。",
        focus: {
          selectedRecordIds: ["shape:goal"],
          recentlyChangedRecordIds: ["shape:goal"],
          viewportRecordIds: ["shape:goal"]
        },
        recentEvents: []
      },
      semanticGraph: {
        roomId: "alpha",
        generatedAt: "2026-06-11T00:00:00.000Z",
        currentPageId: "page:page",
        nodes: [
          {
            id: "shape:goal",
            kind: "text",
            shapeType: "text",
            text: "项目目标",
            bounds: { x: 10, y: 20, w: 120, h: 40 },
            parentId: "page:page",
            pageId: "page:page"
          }
        ],
        edges: [],
        regions: []
      },
      focus: {
        selectedRecordIds: ["shape:goal"],
        focusedRecordIds: ["shape:goal"],
        nearbyRecordIds: ["shape:goal"],
        recentlyChangedRecordIds: ["shape:goal"]
      },
      warnings: []
    });

    expect(context.available).toBe(true);
    expect(context.semanticGraph?.nodes[0]?.text).toBe("项目目标");
  });

  it("validates coworker conversation stream requests", () => {
    const request = coworkerConversationStreamRequestSchema.parse({
      roomId: "alpha",
      message: "帮我看看这个画布现在缺什么？"
    });

    expect(request.roomId).toBe("alpha");
    expect(
      coworkerConversationStreamRequestSchema.safeParse({
        roomId: "alpha",
        message: ""
      }).success
    ).toBe(false);
  });

});
