import { describe, expect, it } from "vitest";

import {
  createCoworkerApprovalSummary,
  createCoworkerResultSummary
} from "../coworker-presence-content";

describe("coworker presence content", () => {
  it("summarizes a validated canvas edit plan without guessing", () => {
    const summary = createCoworkerApprovalSummary(
      createApproval("canvas.edit", {
        roomId: "room-1",
        currentPageId: "page:1",
        intent: "整理登录流程",
        operations: [
          {
            operationId: "create-1",
            kind: "create_shape",
            shapeKind: "rectangle",
            bounds: { x: 0, y: 0, w: 120, h: 80 }
          },
          {
            operationId: "move-1",
            kind: "move_shape",
            shapeId: "shape:1",
            point: { x: 40, y: 80 }
          },
          {
            operationId: "arrow-1",
            kind: "create_arrow",
            from: { x: 0, y: 0 },
            to: { x: 100, y: 100 }
          }
        ]
      })
    );

    expect(summary).toMatchObject({
      title: "我准备修改当前画布",
      intent: "整理登录流程",
      operationCount: 3,
      operationSummary: "新增 1 项 · 移动 1 项 · 连接 1 项",
      operations: [
        expect.objectContaining({ action: "新增", title: "新增矩形" }),
        expect.objectContaining({ action: "移动", title: "移动一个现有对象" }),
        expect.objectContaining({ action: "连接", title: "新增一条连接线" })
      ],
      scope: "当前页面",
      structured: true,
      canApprove: true,
      validationMessage: null
    });
  });

  it("validates streamed JSON string arguments before presenting them", () => {
    const summary = createCoworkerApprovalSummary(
      createApproval("canvas.edit", JSON.stringify({
        roomId: "room-1",
        currentPageId: "page:1",
        intent: "连接登录流程",
        operations: [
          {
            operationId: "arrow-1",
            kind: "create_arrow",
            from: { x: 20, y: 20 },
            to: { x: 120, y: 20 }
          }
        ]
      }))
    );

    expect(summary).toMatchObject({
      intent: "连接登录流程",
      operationCount: 1,
      operationSummary: "连接 1 项",
      scope: "当前页面",
      structured: true
    });
  });

  it("falls back safely for unknown or invalid tools", () => {
    expect(
      createCoworkerApprovalSummary(
        createApproval("canvas.edit", { intent: "missing contract fields" })
      )
    ).toMatchObject({
      title: "这个画布计划还不能执行",
      structured: false,
      canApprove: false
    });

    expect(
      createCoworkerApprovalSummary(
        createApproval("tool.unknown-tool", { action: "unknown" })
      )
    ).toMatchObject({
      title: "这份计划暂时不能执行",
      structured: false,
      canApprove: false
    });
  });

  it("extracts record ids from a validated canvas edit result", () => {
    expect(
      createCoworkerResultSummary({
        roomId: "room-1",
        applied: true,
        createdRecordIds: ["shape:1", "shape:2"],
        updatedRecordIds: ["shape:2", "shape:3"],
        warnings: [],
        summary: "已经连接关键节点"
      })
    ).toEqual({
      outcome: "success",
      summary: "已经连接关键节点",
      recordIds: ["shape:1", "shape:2", "shape:3"],
      warnings: []
    });
  });

  it("does not present a validated no-op result as a successful delivery", () => {
    expect(
      createCoworkerResultSummary({
        roomId: "room-1",
        applied: false,
        createdRecordIds: [],
        updatedRecordIds: [],
        warnings: ["目标对象已经不存在"],
        summary: "没有修改画布"
      })
    ).toMatchObject({
      outcome: "not-applied",
      warnings: ["目标对象已经不存在"]
    });
  });
});

function createApproval(capability: string, proposal: unknown) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    roomId: "room-1",
    capability,
    risk: "write" as const,
    proposal,
    requestedAt: "2026-07-21T06:00:00.000Z"
  };
}
