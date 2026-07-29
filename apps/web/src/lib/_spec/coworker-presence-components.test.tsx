import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CoworkerComposer, shouldSubmitCoworkerComposerOnKeyDown } from "../../components/coworker-composer";
import { CoworkerDeliveryPreview } from "../../components/coworker-delivery-preview";
import { CoworkerDialogueNote } from "../../components/coworker-dialogue-note";
import { CoworkerGlassHandoff } from "../../components/coworker-glass-handoff";
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
    expect(html).toContain("drawless-liquid-glass--control");
    expect(html).toContain("drawless-liquid-glass--quiet");
  });

  it("adapts the same composer to delivery feedback without adding a mode switch", () => {
    const html = renderToStaticMarkup(
      <CoworkerComposer
        label="给 Drew 反馈"
        message=""
        onFocusChange={vi.fn()}
        onMessageChange={vi.fn()}
        onSend={vi.fn()}
        placeholder="哪里需要继续修改？"
        sendDisabled={false}
        sendLabel="递给他"
      />
    );

    expect(html).toContain("给 Drew 反馈");
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
    expect(html).toContain('data-shape="speech"');
    expect(html).toContain("drawless-liquid-glass--neutral");
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
    expect(html).toContain("drawless-liquid-glass--document");
    expect(html).toContain("drawless-liquid-glass--success");
  });

  it("maps delivery outcomes onto semantic liquid-glass tones", () => {
    const html = renderToStaticMarkup(
      <CoworkerDeliveryPreview
        onExpand={vi.fn()}
        onRequestChanges={vi.fn()}
        outcome="partial"
        recordIds={[]}
        summary="完成了可安全写入的部分。"
        warnings={["一个对象已经不存在。"]}
      />
    );

    expect(html).toContain("drawless-liquid-glass--card");
    expect(html).toContain("drawless-liquid-glass--warning");
    expect(html).toContain("一个对象已经不存在");
  });

  it("turns the handoff transition into shared liquid-glass fragments", () => {
    const html = renderToStaticMarkup(
      <CoworkerGlassHandoff text="把登录流程整理一下" />
    );

    expect(html).toContain("把登录流程整理一下");
    expect(html.match(/drawless-liquid-glass--accent/g)).toHaveLength(3);
    expect(html).not.toContain("foldMark");
  });

  it("renders the offline entry as a reusable liquid-glass confirmation bubble", () => {
    const html = renderToStaticMarkup(
      <CoworkerPresenceStage
        activityLogId="activity-log"
        attentionLabel={null}
        avatarMode="idle"
        canCancel={false}
        completionSummary={null}
        entryId="coworker-entry"
        handoff={null}
        joinError={null}
        joining={false}
        latestText=""
        latestUserText={null}
        lifecycleState="idle"
        message=""
        onAvatarFocusChange={vi.fn()}
        onAvatarHoverChange={vi.fn()}
        onCancel={vi.fn()}
        onCloseActivity={vi.fn()}
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
        online={false}
        pendingApproval={null}
        phase="ready"
        resultOutcome={null}
        resultRecordIds={[]}
        resultWarnings={[]}
        sendDisabled={false}
        statusText="可以开始"
        surface={{ kind: "composer", purpose: "open" }}
        syncOnline
        workspaceId="workspace"
      />
    );

    expect(html).toContain("确认加入画布");
    expect(html).toContain("确认加入");
    expect(html).toContain("liquid-glass-bubble__surface");
    expect(html).toContain("liquid-glass-bubble__tail");
    expect(html).toContain("drawless-liquid-glass--card");
    expect(html).toContain("drawless-liquid-glass--neutral");
    expect(html).not.toContain('role="dialog"');
  });

  it("reuses the customizable liquid-glass bubble for Drew thinking", () => {
    const html = renderToStaticMarkup(
      <CoworkerPresenceStage
        activityLogId="activity-log"
        attentionLabel={null}
        avatarMode="working"
        canCancel={false}
        completionSummary={null}
        entryId="coworker-entry"
        handoff={null}
        joinError={null}
        joining={false}
        latestText=""
        latestUserText="整理当前流程"
        lifecycleState="online"
        message=""
        onAvatarFocusChange={vi.fn()}
        onAvatarHoverChange={vi.fn()}
        onCancel={vi.fn()}
        onCloseActivity={vi.fn()}
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
        pendingApproval={null}
        phase="thinking"
        resultOutcome={null}
        resultRecordIds={[]}
        resultWarnings={[]}
        sendDisabled
        statusText="正在理解画布"
        surface={{ kind: "current" }}
        syncOnline
        workspaceId="workspace"
      />
    );

    expect(html).toContain("正在理解画布");
    expect(html).toContain('data-shape="thought"');
    expect(html).toContain("coworker-thought-bubble__content");
    expect(html).toContain("drawless-liquid-glass--card");
    expect(html).not.toContain("coworker-thought-bubble__trail");
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
        onCloseActivity={vi.fn()}
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
        resultOutcome={null}
        resultRecordIds={[]}
        resultWarnings={[]}
        sendDisabled
        statusText="等你确认"
        surface={{ kind: "current" }}
        workspaceId="workspace"
      />
    );

    expect(html).toContain("coworker-approval-sheet");
    expect(html).toContain("逐项核对");
    expect(html).toContain("移动一个现有对象");
    expect(html).toContain("批准并执行");
    expect(html).toContain("退回调整");
    expect(html).toContain("暂不执行");
    expect(html).toContain('aria-label="查看协作往来"');
    expect(html).toContain("coworker-activity-trigger__icon");
    expect(html).toContain("drawless-liquid-glass--control");
    expect(html).toContain("drawless-liquid-glass--quiet");
    expect(html).toContain("drawless-liquid-glass--document");
    expect(html).toContain("drawless-liquid-glass--warning");
    expect(html).not.toContain('role="dialog"');
  });
});
