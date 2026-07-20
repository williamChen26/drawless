import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CoworkerComposer, shouldSubmitCoworkerComposerOnKeyDown } from "../../components/coworker-composer";
import {
  CoworkerPresenceStage,
  splitSemanticParagraphs
} from "../../components/coworker-presence-stage";
import { CoworkerResultNote } from "../../components/coworker-result-note";

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

  it("renders a completed canvas result as one editorial work note", () => {
    const html = renderToStaticMarkup(
      <CoworkerResultNote
        completionSummary="新建 4 个节点"
        onLocateResult={vi.fn()}
        paragraphs={["流程已经整理完成。"]}
        phase="completed"
        recordIds={["shape:1", "shape:1", "shape:2"]}
      />
    );

    expect(html).toContain("给你的工作说明");
    expect(html).toContain("流程已经整理完成");
    expect(html).toContain("已登记 2 个画布位置");
    expect(html).toContain("在画布中查看");
  });

  it("renders approval as an inline work sheet instead of a dialog", () => {
    const turn = {
      id: "turn-1",
      userText: "整理流程",
      runId: "run-1",
      status: "awaiting_approval" as const,
      blocks: []
    };
    const html = renderToStaticMarkup(
      <CoworkerPresenceStage
        activityLogId="activity-log"
        activityLogOpen={false}
        avatarMode="awaiting-approval"
        canCancel={false}
        completionSummary={null}
        composerId="composer"
        composerOpen={false}
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
        onComposerFocusChange={vi.fn()}
        onJoin={vi.fn()}
        onMessageChange={vi.fn()}
        onResolveApproval={vi.fn()}
        onSend={vi.fn()}
        onToggleActivityLog={vi.fn()}
        onToggleComposer={vi.fn()}
        online
        pendingApproval={{
          turn,
          approval: {
            runId: "run-1",
            toolCallId: "call-1",
            toolName: "edit-canvas",
            args: {
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
            }
          }
        }}
        phase="awaiting-approval"
        resultRecordIds={[]}
        sendDisabled
        statusText="等你确认"
      />
    );

    expect(html).toContain("coworker-approval-sheet");
    expect(html).toContain("允许这次");
    expect(html).toContain("暂不执行");
    expect(html).not.toContain('role="dialog"');
  });
});
