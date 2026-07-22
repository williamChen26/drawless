"use client";

import React, { useState } from "react";
import {
  DRAWLESS_COWORKER_DISPLAY_NAME,
  DRAWLESS_COWORKER_ROLE_LABEL,
  type DrawlessCoworkerApprovalRequest
} from "@drawless/shared";
import { Button } from "@drawless/ui";

import type { CoworkerAvatarMode } from "../lib/coworker-avatar-state";
import {
  createCoworkerApprovalSummary,
  splitSemanticParagraphs
} from "../lib/coworker-presence-content";
import type { CoworkerPresencePhase } from "../lib/coworker-presence-state";
import type { CoworkerConversationTurn } from "../lib/use-coworker-conversation";
import {
  resolveCoworkerPrimaryArtifact,
  type CoworkerComposerPurpose,
  type CoworkerWorkspaceSurface
} from "../lib/coworker-workspace-view";

import { CoworkerAvatarEntry } from "./coworker-avatar-entry";
import { CoworkerComposer } from "./coworker-composer";
import { CoworkerDeliveryPreview } from "./coworker-delivery-preview";
import { CoworkerDialogueNote } from "./coworker-dialogue-note";
import { CoworkerPaperHandoff } from "./coworker-paper-handoff";
import {
  CoworkerResultNote,
  type CoworkerResultNotePhase
} from "./coworker-result-note";

export type CoworkerPendingApprovalView = {
  /** 审批所属的对话轮次。 */
  turn: CoworkerConversationTurn;
  /** 等待用户决定的工具调用。 */
  approval: DrawlessCoworkerApprovalRequest;
};

export type CoworkerPresenceStageProps = {
  /** 人物在当前任务中的业务阶段。 */
  phase: CoworkerPresencePhase;
  /** 给用户看的简短阶段说明。 */
  statusText: string;
  /** 当前人物静态帧地址。 */
  frameSrc: string;
  /** 当前人物表现模式。 */
  avatarMode: CoworkerAvatarMode;
  /** coworker room 生命周期状态。 */
  lifecycleState: string;
  /** 人物入口 DOM ID，用于收起后恢复键盘焦点。 */
  entryId: string;
  /** 协作空间收起后仍需展示的注意力提示。 */
  attentionLabel: string | null;
  /** Coworker 协作空间 DOM ID，用于人物入口的 aria-controls。 */
  workspaceId: string;
  /** 当前唯一的辅助表面。 */
  surface: CoworkerWorkspaceSurface;
  /** 工作记录 DOM ID。 */
  activityLogId: string;
  /** 最近一次提交给 Drew 的原始文本。 */
  latestUserText: string | null;
  /** 只用于表现交接过程的短暂纸带，不作为业务事实源。 */
  handoff: { id: number; text: string } | null;
  /** Coworker 当前或最近一次面向用户的正文。 */
  latestText: string;
  /** 当前等待用户处理的审批。 */
  pendingApproval: CoworkerPendingApprovalView | null;
  /** 完成凭证的人类可读摘要。 */
  completionSummary: string | null;
  /** 真实工具结果给出的画布 record ID，仅作为定位引用。 */
  resultRecordIds: string[];
  /** 当前尚未发送的用户草稿。 */
  message: string;
  /** 当前任务是否阻止再次发送。 */
  sendDisabled: boolean;
  /** tldraw 是否与当前协作房间保持在线同步。 */
  syncOnline?: boolean;
  /** 是否展示停止接收当前回复的动作。 */
  canCancel: boolean;
  /** coworker 是否已经加入当前画布。 */
  online: boolean;
  /** coworker 加入动作是否进行中。 */
  joining: boolean;
  /** coworker 无法加入时的说明。 */
  joinError: string | null;
  /** 打开并聚焦沟通入口。 */
  onOpenComposer: () => void;
  /** 打开或收起当前 Coworker 协作空间。 */
  onToggleWorkspace: () => void;
  /** 收起当前辅助表面。 */
  onCloseSurface: () => void;
  /** 展开完整工作说明。 */
  onShowDelivery: () => void;
  /** 打开协作往来。 */
  onShowActivity: () => void;
  /** 放下当前计划并进入调整说明。 */
  onRequestApprovalAdjustment: (
    approvalView: CoworkerPendingApprovalView
  ) => Promise<void>;
  /** 回到沟通入口反馈当前交付。 */
  onRequestDeliveryFeedback: () => void;
  /** 更新人物入口 hover 状态。 */
  onAvatarHoverChange: (hovered: boolean) => void;
  /** 更新人物入口 focus 状态。 */
  onAvatarFocusChange: (focused: boolean) => void;
  /** 更新 Composer focus 状态。 */
  onComposerFocusChange: (focused: boolean) => void;
  /** 更新用户草稿。 */
  onMessageChange: (message: string) => void;
  /** 提交当前草稿。 */
  onSend: () => Promise<void>;
  /** 显式停止接收当前回复。 */
  onCancel: () => void;
  /** 请求 coworker 加入当前画布。 */
  onJoin: () => void;
  /** 处理当前工具审批。 */
  onResolveApproval: (
    turn: CoworkerConversationTurn,
    approval: DrawlessCoworkerApprovalRequest,
    decision: "approve" | "decline"
  ) => Promise<boolean>;
  /** 在画布中定位真实工具结果引用的 records。 */
  onLocateResult?: ((recordIds: string[]) => void) | undefined;
};

/**
 * Coworker 的主要交流舞台。这里只消费 controller/selector 派生结果，不保存第二份业务状态。
 */
export function CoworkerPresenceStage({
  phase,
  statusText,
  frameSrc,
  avatarMode,
  lifecycleState,
  entryId,
  attentionLabel,
  workspaceId,
  surface,
  activityLogId,
  latestUserText,
  handoff,
  latestText,
  pendingApproval,
  completionSummary,
  resultRecordIds,
  message,
  sendDisabled,
  syncOnline = true,
  canCancel,
  online,
  joining,
  joinError,
  onOpenComposer,
  onToggleWorkspace,
  onCloseSurface,
  onShowDelivery,
  onShowActivity,
  onRequestApprovalAdjustment,
  onRequestDeliveryFeedback,
  onAvatarHoverChange,
  onAvatarFocusChange,
  onComposerFocusChange,
  onMessageChange,
  onSend,
  onCancel,
  onJoin,
  onResolveApproval,
  onLocateResult
}: CoworkerPresenceStageProps) {
  const showReceipt = phase === "completed" && completionSummary;
  const artifact = resolveCoworkerPrimaryArtifact({
    phase,
    hasHandoff: Boolean(handoff),
    hasPendingApproval: Boolean(pendingApproval),
    hasText: Boolean(latestText),
    hasCanvasResult: Boolean(completionSummary),
    surface
  });
  const composerOpen = surface.kind === "composer";
  const activityOpen = surface.kind === "activity";
  const composerCopy = getComposerCopy(
    composerOpen ? surface.purpose : "open"
  );

  return (
    <section
      aria-label={`与 ${DRAWLESS_COWORKER_DISPLAY_NAME} 的协作空间`}
      className="coworker-presence-stage"
      data-handoff={Boolean(handoff)}
      data-phase={phase}
    >
      <div className="coworker-presence-stage__anchor">
        <CoworkerAvatarEntry
          attentionLabel={attentionLabel}
          entryId={entryId}
          expanded={surface.kind !== "closed"}
          frameSrc={frameSrc}
          lifecycleState={lifecycleState}
          mode={avatarMode}
          onFocusChange={onAvatarFocusChange}
          onHoverChange={onAvatarHoverChange}
          onToggle={onToggleWorkspace}
          panelId={workspaceId}
          receivingHandoff={Boolean(handoff)}
        />
      </div>

      <div className="coworker-presence-stage__exchange" id={workspaceId}>
        {artifact.kind === "handoff" ? (
          <CoworkerPaperHandoff
            key={handoff?.id}
            text={summarizeHandoff(handoff?.text ?? latestUserText ?? "")}
          />
        ) : null}

        {artifact.kind === "thought" ? (
          <div
            aria-hidden="true"
            className="coworker-thought-bubble"
            data-phase={phase}
          >
            <span className="coworker-thought-bubble__trail" />
            <p>{statusText}</p>
          </div>
        ) : null}

        {artifact.kind === "approval" && pendingApproval ? (
          <CoworkerApprovalSheet
            approvalView={pendingApproval}
            disabled={!syncOnline}
            onRequestAdjustment={onRequestApprovalAdjustment}
            onResolve={onResolveApproval}
          />
        ) : null}

        {artifact.kind === "dialogue" && isExpressionPhase(phase) ? (
          <CoworkerDialogueNote phase={phase} text={latestText} />
        ) : null}

        {artifact.kind === "issue" && isExpressionPhase(phase) ? (
          <CoworkerDialogueNote phase={phase} text={latestText} />
        ) : null}

        {artifact.kind === "delivery-preview" && completionSummary ? (
          <CoworkerDeliveryPreview
            onExpand={onShowDelivery}
            onLocateResult={onLocateResult}
            onRequestChanges={onRequestDeliveryFeedback}
            recordIds={resultRecordIds}
            summary={completionSummary}
          />
        ) : null}

        {artifact.kind === "delivery" && isResultNotePhase(phase) ? (
          <CoworkerResultNote
            completionSummary={completionSummary}
            onLocateResult={onLocateResult}
            onRequestChanges={onRequestDeliveryFeedback}
            paragraphs={splitSemanticParagraphs(latestText)}
            phase={phase}
            recordIds={resultRecordIds}
            title={getResultNoteTitle(phase, resultRecordIds.length > 0)}
          />
        ) : null}

        {!online && composerOpen ? (
          <section
            aria-label={`允许 ${DRAWLESS_COWORKER_DISPLAY_NAME} 加入`}
            className="coworker-join-note"
          >
            <div>
              <strong>{DRAWLESS_COWORKER_DISPLAY_NAME} · {DRAWLESS_COWORKER_ROLE_LABEL}</strong>
              <p>允许后，我会作为协作者读取当前画布；需要编辑时，会先请你确认。</p>
            </div>
            {joinError ? <p role="alert">{joinError}</p> : null}
            <Button
              disabled={joining || !syncOnline}
              onClick={onJoin}
              type="button"
            >
              {!syncOnline ? "等待画布同步" : joining ? "正在加入" : "允许加入"}
            </Button>
          </section>
        ) : null}

        {online && composerOpen ? (
          <section
            aria-label={`与 ${DRAWLESS_COWORKER_DISPLAY_NAME} 沟通`}
            className="coworker-presence-stage__composer"
          >
            <header className="coworker-presence-stage__composer-header">
              <div>
                <span>{composerCopy.title}</span>
                <strong>{statusText}</strong>
              </div>
              <Button
                aria-label={`收起与 ${DRAWLESS_COWORKER_DISPLAY_NAME} 的沟通入口`}
                onClick={onCloseSurface}
                size="sm"
                type="button"
                variant="ghost"
              >
                收好
              </Button>
            </header>
            <CoworkerComposer
              busyHint={
                syncOnline
                  ? getComposerBusyHint(phase)
                  : "画布正在重新连接，恢复同步后再继续。"
              }
              label={composerCopy.label}
              message={message}
              onFocusChange={onComposerFocusChange}
              onMessageChange={onMessageChange}
              onSend={onSend}
              placeholder={composerCopy.placeholder}
              sendLabel={composerCopy.sendLabel}
              sendDisabled={sendDisabled}
            />
          </section>
        ) : null}

        <div
          aria-label={`${DRAWLESS_COWORKER_DISPLAY_NAME} 的辅助操作`}
          className="coworker-presence-actions"
          role="group"
        >
          {artifact.kind === "dialogue" || artifact.kind === "issue" ? (
            <Button
              onClick={onOpenComposer}
              size="sm"
              type="button"
              variant="ghost"
            >
              继续聊
            </Button>
          ) : null}
          {canCancel ? (
            <Button onClick={onCancel} size="sm" type="button" variant="ghost">
              先停一下
            </Button>
          ) : null}
          {surface.kind === "current" || surface.kind === "delivery" ? (
            <Button
              onClick={onCloseSurface}
              size="sm"
              type="button"
              variant="ghost"
            >
              收好
            </Button>
          ) : null}
          <Button
            aria-controls={activityLogId}
            aria-expanded={activityOpen}
            id={`${activityLogId}-trigger`}
            onClick={activityOpen ? onCloseSurface : onShowActivity}
            size="sm"
            type="button"
            variant="ghost"
          >
            {activityOpen ? "收起协作往来" : "协作往来"}
          </Button>
        </div>
      </div>

      <p
        aria-atomic="true"
        aria-live="polite"
        className="coworker-presence-stage__live-region"
        role="status"
      >
        {showReceipt
          ? `${DRAWLESS_COWORKER_DISPLAY_NAME} 已完成：${completionSummary}`
          : statusText}
      </p>
    </section>
  );
}

function CoworkerApprovalSheet({
  approvalView,
  disabled,
  onResolve,
  onRequestAdjustment
}: {
  approvalView: CoworkerPendingApprovalView;
  disabled: boolean;
  onResolve: CoworkerPresenceStageProps["onResolveApproval"];
  onRequestAdjustment: CoworkerPresenceStageProps["onRequestApprovalAdjustment"];
}) {
  const { turn, approval } = approvalView;
  const plan = createCoworkerApprovalSummary(approval);
  const [pendingAction, setPendingAction] = useState<
    "approve" | "decline" | "adjust" | null
  >(null);

  const resolve = async (decision: "approve" | "decline") => {
    if (pendingAction) {
      return;
    }
    setPendingAction(decision);
    try {
      await onResolve(turn, approval, decision);
    } finally {
      setPendingAction(null);
    }
  };

  const requestAdjustment = async () => {
    if (pendingAction) {
      return;
    }
    setPendingAction("adjust");
    try {
      await onRequestAdjustment(approvalView);
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <section
      aria-label={`${DRAWLESS_COWORKER_DISPLAY_NAME} 等待你的确认`}
      className="coworker-approval-sheet"
      data-pending={Boolean(pendingAction)}
    >
      <header>
        <span>等你决定</span>
        <strong>{plan.title}</strong>
      </header>
      <p>{plan.intent}</p>
      {plan.validationMessage ? (
        <p className="coworker-approval-sheet__validation" role="alert">
          {plan.validationMessage}
        </p>
      ) : null}
      {plan.structured ? (
        <details open>
          <summary>查看工作计划</summary>
          <dl>
            <div>
              <dt>影响范围</dt>
              <dd>{plan.scope}</dd>
            </div>
            <div>
              <dt>操作数量</dt>
              <dd>{plan.operationCount} 项</dd>
            </div>
            {plan.operationSummary ? (
              <div>
                <dt>计划内容</dt>
                <dd>{plan.operationSummary}</dd>
              </div>
            ) : null}
          </dl>
        </details>
      ) : null}
      <div className="coworker-approval-sheet__actions">
        <Button
          disabled={disabled || Boolean(pendingAction) || !plan.canApprove}
          onClick={() => void resolve("approve")}
          type="button"
        >
          {pendingAction === "approve"
            ? "正在继续"
            : plan.canApprove
              ? "允许执行"
              : "计划不可执行"}
        </Button>
        <Button
          disabled={disabled || Boolean(pendingAction)}
          onClick={() => void requestAdjustment()}
          type="button"
          variant="secondary"
        >
          {pendingAction === "adjust" ? "正在收回计划" : "调整一下"}
        </Button>
        <Button
          disabled={disabled || Boolean(pendingAction)}
          onClick={() => void resolve("decline")}
          type="button"
          variant="ghost"
        >
          {pendingAction === "decline" ? "正在暂缓" : "暂不执行"}
        </Button>
      </div>
    </section>
  );
}

function isExpressionPhase(phase: CoworkerPresencePhase) {
  return (
    phase === "speaking" ||
    phase === "completed" ||
    phase === "interrupted" ||
    phase === "error"
  );
}

function getComposerBusyHint(phase: CoworkerPresencePhase) {
  if (phase === "awaiting-approval") {
    return `${DRAWLESS_COWORKER_DISPLAY_NAME} 正等你确认。可以先写下疑问或调整，处理计划后再递给他。`;
  }
  return `${DRAWLESS_COWORKER_DISPLAY_NAME} 还在处理。可以先写下来，当前步骤结束后再递给他。`;
}

function getComposerCopy(purpose: CoworkerComposerPurpose) {
  if (purpose === "plan-adjustment") {
    return {
      title: "调整工作计划",
      label: `告诉 ${DRAWLESS_COWORKER_DISPLAY_NAME} 怎么调整`,
      placeholder: "说说要改的地方，我会重新整理计划",
      sendLabel: "请他重整"
    };
  }
  if (purpose === "delivery-feedback") {
    return {
      title: "反馈这次交付",
      label: `给 ${DRAWLESS_COWORKER_DISPLAY_NAME} 反馈`,
      placeholder: "哪里需要保留、修改或继续补充？",
      sendLabel: "递给他"
    };
  }
  return {
    title: `与 ${DRAWLESS_COWORKER_DISPLAY_NAME} 沟通`,
    label: `写给 ${DRAWLESS_COWORKER_DISPLAY_NAME}`,
    placeholder: "聊聊你的想法，或者把要做的事交代给我",
    sendLabel: "递给他"
  };
}

function isResultNotePhase(
  phase: CoworkerPresencePhase
): phase is CoworkerResultNotePhase {
  return isExpressionPhase(phase);
}

function getResultNoteTitle(
  phase: CoworkerResultNotePhase,
  hasCanvasResult: boolean
) {
  if (phase === "completed" && hasCanvasResult) {
    return "我完成了这次画布修改";
  }
  if (phase === "completed") {
    return "画布修改已经完成";
  }
  if (phase === "interrupted") {
    return "我停在了这里";
  }
  if (phase === "error") {
    return "这次工作需要重新整理";
  }
  return "我正在把结果讲给你";
}

function summarizeHandoff(text: string) {
  const normalized = text.replace(/\s+/gu, " ").trim();
  return normalized.length > 72 ? `${normalized.slice(0, 69)}…` : normalized;
}
