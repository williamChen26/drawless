import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CoworkerComposer, shouldSubmitCoworkerComposerOnKeyDown } from "../../components/coworker-composer";
import { CoworkerDialogueNote } from "../../components/coworker-dialogue-note";
import {
  CoworkerPresenceStage
} from "../../components/coworker-presence-stage";
import { CoworkerResultNote } from "../../components/coworker-result-note";
import { splitSemanticParagraphs } from "../coworker-presence-content";

describe("coworker presence components", () => {
  it("submits Enter while preserving Shift+Enter and IME composition", () => {
    const base = {
      key: "Enter",
      shiftKey: false,
      compositionActive: false,
      nativeIsComposing: false,
      nativeKeyCode: 13
    };

    expect(shouldSubmitCoworkerComposerOnKeyDown(base)).toBe(true);
    expect(
      shouldSubmitCoworkerComposerOnKeyDown({ ...base, shiftKey: true })
    ).toBe(false);
    expect(
      shouldSubmitCoworkerComposerOnKeyDown({
        ...base,
        compositionActive: true
      })
    ).toBe(false);
    expect(
      shouldSubmitCoworkerComposerOnKeyDown({
        ...base,
        nativeIsComposing: true
      })
    ).toBe(false);
    expect(
      shouldSubmitCoworkerComposerOnKeyDown({ ...base, nativeKeyCode: 229 })
    ).toBe(false);
  });

  it("keeps the composer editable while the current task blocks sending", () => {
    const html = renderToStaticMarkup(
      <CoworkerComposer
        message="下一个想法"
        onFocusChange={vi.fn()}
        onMessageChange={vi.fn()}
        onSend={vi.fn()}
        sendDisabled
      />
    );

    expect(html).toContain("下一个想法");
    expect(html).not.toContain("textarea disabled");
    expect(html).toContain("button");
    expect(html).toContain("disabled");
  });

  it("adapts the same composer to delivery feedback without adding a mode switch", () => {
    const html = renderToStaticMarkup(
      <CoworkerComposer
        label="给 Coworker 反馈"
        message=""
        onFocusChange={vi.fn()}
        onMessageChange={vi.fn()}
        onSend={vi.fn()}
        placeholder="哪里需要继续修改？"
        sendDisabled={false}
        sendLabel="递给他"
      />
    );

    expect(html).toContain("给 Coworker 反馈");
    expect(html).toContain("哪里需要继续修改？");
    expect(html).not.toContain("切换模式");
  });

  it("splits complete output into readable semantic paragraphs", () => {
    expect(splitSemanticParagraphs("第一段。\n\n第二段。\n继续。\n\n第三段。"))
      .toEqual(["第一段。", "第二段。\n继续。", "第三段。"]);
  });

  it("removes markdown control syntax from the human-facing expression", () => {
    expect(
      splitSemanticParagraphs(
        "**执行计划**\n\n| 步骤 | 内容 |\n| --- | --- |\n| 1 | `身份校验` |"
      )
    ).toEqual(["执行计划", "步骤 · 内容", "1 · 身份校验"]);

    expect(splitSemanticParagraphs("```text\n用户 → 校验\n```")).toEqual([
      "用户 → 校验"
    ]);
  });

  it("previews a long dialogue from the beginning and keeps the full response", () => {
    const response = `先说结论：这个方向可以继续。${"补充说明。".repeat(60)}`;
    const html = renderToStaticMarkup(
      <CoworkerDialogueNote phase="completed" text={response} />
    );

    expect(html).toContain("先说结论：这个方向可以继续");
    expect(html).toContain("阅读全文");
    expect(html).toContain("收起全文");
    expect(html).toContain(response);
  });

  it("renders a completed canvas result as one editorial work note", () => {
    const html = renderToStaticMarkup(
      <CoworkerResultNote
        completionSummary="新建 4 个节点"
        onLocateResult={vi.fn()}
        onRequestChanges={vi.fn()}
        paragraphs={["流程已经整理完成。"]}
        phase="completed"
        recordIds={["shape:1", "shape:1", "shape:2"]}
      />
    );

    expect(html).toContain("给你的工作说明");
    expect(html).toContain("流程已经整理完成");
    expect(html).toContain("画布成果已就位");
    expect(html).toContain("看画布成果");
    expect(html).toContain("继续调整");
  });

  it("renders approval as an inline work sheet instead of a dialog", () => {
    const turn = {
      id: "turn-1",
      userText: "整理流程",
      status: "awaiting_approval" as const,
      blocks: []
    };
    const html = renderToStaticMarkup(
      <CoworkerPresenceStage
        activityLogId="activity-log"
        attentionLabel="等你确认"
        avatarMode="awaiting-approval"
        canCancel={false}
        completionSummary={null}
        entryId="coworker-entry"
        frameSrc="/coworker/avatar/frame-08.webp"
        handoff={null}
        joinError={null}
        joining={false}
        latestText=""
        latestUserText="整理流程"
        lifecycleState="online"
        message=""
        onAvatarFocusChange={vi.fn()}
        onAvatarHoverChange={vi.fn()}
        onCancel={vi.fn()}
        onCloseSurface={vi.fn()}
        onComposerFocusChange={vi.fn()}
        onJoin={vi.fn()}
        onMessageChange={vi.fn()}
        onOpenComposer={vi.fn()}
        onRequestApprovalAdjustment={vi.fn()}
        onRequestDeliveryFeedback={vi.fn()}
        onResolveApproval={vi.fn().mockResolvedValue(true)}
        onSend={vi.fn()}
        onShowActivity={vi.fn()}
        onShowDelivery={vi.fn()}
        onToggleWorkspace={vi.fn()}
        online
        pendingApproval={{
          turn,
          approval: {
            id: "11111111-1111-4111-8111-111111111111",
            roomId: "alpha",
            capability: "canvas.edit",
            risk: "write",
            proposal: {
              roomId: "alpha",
              intent: "整理流程",
              operations: [
                {
                  kind: "move_shape",
                  operationId: "move-1",
                  shapeId: "shape:1",
                  point: { x: 20, y: 40 }
                }
              ]
            },
            requestedAt: "2026-07-21T06:00:00.000Z"
          }
        }}
        phase="awaiting-approval"
        resultRecordIds={[]}
        sendDisabled
        statusText="等你确认"
        surface={{ kind: "current" }}
        workspaceId="workspace"
      />
    );

    expect(html).toContain("coworker-approval-sheet");
    expect(html).toContain("允许执行");
    expect(html).toContain("调整一下");
    expect(html).toContain("暂不执行");
    expect(html).not.toContain('role="dialog"');
  });
});
