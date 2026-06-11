import { describe, expect, it } from "vitest";
import type { TLRecord, TLStoreSnapshot } from "tldraw";

import {
  createCanvasSemanticGraph,
  createCanvasSemanticGraphFromSnapshot,
  createCanvasSummary,
  createCanvasSummaryFromSnapshot
} from "../canvas-observation";

describe("canvas observation", () => {
  it("creates a canvas summary from tldraw records", () => {
    const records = [
      pageRecord("page:page"),
      textShapeRecord("shape:goal", "项目目标"),
      geoShapeRecord("shape:box"),
      presenceRecord("instance_presence:user", ["shape:goal"])
    ];

    const summary = createCanvasSummary({
      roomId: "alpha",
      actorSessionId: "device:tab-1",
      records,
      capturedAt: "2026-06-11T00:00:00.000Z",
      recentlyChangedRecordIds: ["shape:goal"]
    });

    expect(summary).toMatchObject({
      roomId: "alpha",
      currentPageId: "page:page",
      focus: {
        selectedRecordIds: ["shape:goal"],
        recentlyChangedRecordIds: ["shape:goal"],
        viewportRecordIds: ["shape:goal", "shape:box"]
      }
    });
    expect(summary.summary).toContain("text 1 个");
    expect(summary.summary).toContain("geo 1 个");
    expect(summary.summary).toContain("项目目标");
    expect(summary.recentEvents[0]).toMatchObject({
      kind: "shape_updated",
      recordIds: ["shape:goal"]
    });
  });

  it("prefers explicit focus ids over presence-derived selection", () => {
    const summary = createCanvasSummary({
      roomId: "alpha",
      actorSessionId: "device:tab-1",
      records: [pageRecord("page:page"), presenceRecord("instance_presence:user", ["shape:old"])],
      capturedAt: "2026-06-11T00:00:00.000Z",
      selectedRecordIds: ["shape:explicit"],
      viewportRecordIds: ["shape:explicit"]
    });

    expect(summary.focus.selectedRecordIds).toEqual(["shape:explicit"]);
    expect(summary.focus.viewportRecordIds).toEqual(["shape:explicit"]);
  });

  it("creates a canvas summary from a store snapshot", () => {
    const snapshot = {
      store: {
        "page:page": pageRecord("page:page"),
        "shape:goal": textShapeRecord("shape:goal", "关键问题")
      },
      schema: {}
    } as unknown as TLStoreSnapshot;

    const summary = createCanvasSummaryFromSnapshot({
      roomId: "alpha",
      actorSessionId: "device:tab-1",
      snapshot,
      capturedAt: "2026-06-11T00:00:00.000Z"
    });

    expect(summary.summary).toContain("关键问题");
    expect(summary.focus.viewportRecordIds).toEqual(["shape:goal"]);
  });

  it("creates a semantic graph with nodes, arrow edges, and regions", () => {
    const records = [
      pageRecord("page:page"),
      frameShapeRecord("shape:frame", "项目区域"),
      textShapeRecord("shape:goal", "项目目标", "shape:frame"),
      geoShapeRecord("shape:task", "shape:frame"),
      arrowShapeRecord("shape:arrow", "拆解为"),
      arrowBindingRecord("binding:start", "shape:arrow", "shape:goal", "start"),
      arrowBindingRecord("binding:end", "shape:arrow", "shape:task", "end")
    ];

    const graph = createCanvasSemanticGraph({
      roomId: "alpha",
      actorSessionId: "device:tab-1",
      records,
      capturedAt: "2026-06-11T00:00:00.000Z"
    });

    expect(graph).toMatchObject({
      roomId: "alpha",
      currentPageId: "page:page",
      nodes: expect.arrayContaining([
        expect.objectContaining({
          id: "shape:goal",
          kind: "text",
          text: "项目目标",
          pageId: "page:page"
        }),
        expect.objectContaining({
          id: "shape:frame",
          kind: "frame",
          text: "项目区域"
        })
      ]),
      edges: [
        expect.objectContaining({
          id: "shape:arrow",
          fromId: "shape:goal",
          toId: "shape:task",
          label: "拆解为",
          direction: "forward"
        })
      ],
      regions: [
        expect.objectContaining({
          id: "shape:frame",
          kind: "frame",
          title: "项目区域",
          shapeIds: expect.arrayContaining(["shape:goal", "shape:task"])
        })
      ]
    });
  });

  it("creates a semantic graph from a store snapshot", () => {
    const snapshot = {
      store: {
        "page:page": pageRecord("page:page"),
        "shape:goal": textShapeRecord("shape:goal", "关键问题")
      },
      schema: {}
    } as unknown as TLStoreSnapshot;

    const graph = createCanvasSemanticGraphFromSnapshot({
      roomId: "alpha",
      actorSessionId: "device:tab-1",
      snapshot,
      capturedAt: "2026-06-11T00:00:00.000Z"
    });

    expect(graph.nodes[0]).toMatchObject({
      id: "shape:goal",
      kind: "text",
      text: "关键问题"
    });
  });
});

function pageRecord(id: string): TLRecord {
  return {
    id,
    typeName: "page",
    name: "Page",
    index: "a1",
    meta: {}
  } as unknown as TLRecord;
}

function textShapeRecord(
  id: string,
  text: string,
  parentId = "page:page"
): TLRecord {
  return {
    id,
    typeName: "shape",
    type: "text",
    x: 10,
    y: 20,
    rotation: 0,
    index: "a1",
    parentId,
    isLocked: false,
    opacity: 1,
    props: {
      text,
      w: 120,
      h: 40
    },
    meta: {}
  } as unknown as TLRecord;
}

function geoShapeRecord(id: string, parentId = "page:page"): TLRecord {
  return {
    id,
    typeName: "shape",
    type: "geo",
    x: 100,
    y: 200,
    rotation: 0,
    index: "a2",
    parentId,
    isLocked: false,
    opacity: 1,
    props: {
      w: 160,
      h: 80
    },
    meta: {}
  } as unknown as TLRecord;
}

function frameShapeRecord(id: string, name: string): TLRecord {
  return {
    id,
    typeName: "shape",
    type: "frame",
    x: 0,
    y: 0,
    rotation: 0,
    index: "a0",
    parentId: "page:page",
    isLocked: false,
    opacity: 1,
    props: {
      name,
      text: name,
      w: 400,
      h: 300
    },
    meta: {}
  } as unknown as TLRecord;
}

function arrowShapeRecord(id: string, text: string): TLRecord {
  return {
    id,
    typeName: "shape",
    type: "arrow",
    x: 40,
    y: 40,
    rotation: 0,
    index: "a3",
    parentId: "page:page",
    isLocked: false,
    opacity: 1,
    props: {
      text,
      w: 80,
      h: 40
    },
    meta: {}
  } as unknown as TLRecord;
}

function arrowBindingRecord(
  id: string,
  arrowId: string,
  targetId: string,
  terminal: "start" | "end"
): TLRecord {
  return {
    id,
    typeName: "binding",
    type: "arrow",
    fromId: arrowId,
    toId: targetId,
    props: {
      terminal
    },
    meta: {}
  } as unknown as TLRecord;
}

function presenceRecord(id: string, selectedShapeIds: string[]): TLRecord {
  return {
    id,
    typeName: "instance_presence",
    userId: "user",
    userName: "User",
    lastActivityTimestamp: 0,
    color: "#2563eb",
    camera: null,
    selectedShapeIds
  } as unknown as TLRecord;
}
