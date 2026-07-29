"use client";

import React from "react";
import {
  DRAWLESS_COWORKER_DISPLAY_NAME,
  DRAWLESS_COWORKER_ROLE_LABEL,
  type DrawlessCoworkerApprovalRequest
} from "@drawless/shared";
import { Button, LiquidGlassSurface } from "@drawless/ui";

import type { CoworkerAvatarMode } from "../lib/coworker-avatar-state";
import {
  splitSemanticParagraphs,
  type CoworkerCanvasTargetResolver
} from "../lib/coworker-presence-content";
import type { CoworkerPresencePhase } from "../lib/coworker-presence-state";
import type { CoworkerPromptPresetMode } from "../lib/coworker-prompt-presets";
import type { CoworkerConversationTurn } from "../lib/use-coworker-conversation";
import {
  resolveCoworkerPrimaryArtifact,
  type CoworkerComposerPurpose,
  type CoworkerWorkspaceSurface
} from "../lib/coworker-workspace-view";

import { CoworkerAvatarEntry } from "./coworker-avatar-entry";
import {
  CoworkerApprovalSheet,
  type CoworkerPendingApprovalView
} from "./coworker-approval-sheet";
import { CoworkerComposer } from "./coworker-composer";
import { CoworkerDeliveryPreview } from "./coworker-delivery-preview";
import { CoworkerDialogueNote } from "./coworker-dialogue-note";
import { LiquidGlassBubble } from "./liquid-glass-bubble";
import { CoworkerGlassHandoff } from "./coworker-glass-handoff";
import { CoworkerPromptArrival } from "./coworker-prompt-arrival";
import {
  CoworkerResultNote,
  type CoworkerResultNotePhase
} from "./coworker-result-note";

export type CoworkerPresenceStageProps = {
  /** 人物在当前任务中的业务阶段。 */
  phase: CoworkerPresencePhase;
  /** 给用户看的简短阶段说明。 */
  statusText: string;
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
  /** 只用于表现交接过程的短暂玻璃片，不作为业务事实源。 */
  handoff: { id: number; text: string } | null;
  /** Coworker 当前或最近一次面向用户的正文。 */
  latestText: string;
  /** 当前等待用户处理的审批。 */
  pendingApproval: CoworkerPendingApprovalView | null;
  /** 完成凭证的人类可读摘要。 */
  completionSummary: string | null;
  /** 真实工具结果派生的交付结果。 */
  resultOutcome: "success" | "partial" | "not-applied" | null;
  /** 真实工具结果给出的画布 record ID，仅作为定位引用。 */
  resultRecordIds: string[];
  /** 工具执行期间跳过、降级或失败的说明。 */
  resultWarnings: string[];
  /** 从当前 tldraw document 即时读取被修改对象。 */
  resolveCanvasTarget?: CoworkerCanvasTargetResolver | undefined;
  /** 当前尚未发送的用户草稿。 */
  message: string;
  /** 根据当前 tldraw document 是否为空选择入场起手句。 */
  promptPresetMode: CoworkerPromptPresetMode;
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
  /** 收起协作往来并把键盘焦点还给边缘页签。 */
  onCloseActivity: () => void;
  /** 展开完整工作说明。 */
  onShowDelivery: () => void;
  /** 打开协作往来。 */
  onShowActivity: () => void;
  /** 放下当前计划并进入调整说明。 */
  onRequestApprovalAdjustment: (
    approvalView: CoworkerPendingApprovalView
  ) => Promise<boolean>;
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
  /** 点击入场起手句后直接提交对应要求。 */
  onInvokePrompt: (message: string) => Promise<void>;
  /** 收起 Drew 主动递出的入场起手句。 */
  onDismissPrompts: () => void;
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
  /** 在不收起审批单的前提下定位被修改对象。 */
  onInspectApprovalTargets?: ((recordIds: string[]) => void) | undefined;
};

/**
 * Coworker 的主要交流舞台。这里只消费 controller/selector 派生结果，不保存第二份业务状态。
 */
export function CoworkerPresenceStage({
  phase,
  statusText,
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
  resultOutcome,
  resultRecordIds,
  resultWarnings,
  resolveCanvasTarget,
  message,
  promptPresetMode,
  sendDisabled,
  syncOnline = true,
  canCancel,
  online,
  joining,
  joinError,
  onOpenComposer,
  onToggleWorkspace,
  onCloseSurface,
  onCloseActivity,
  onShowDelivery,
  onShowActivity,
  onRequestApprovalAdjustment,
  onRequestDeliveryFeedback,
  onAvatarHoverChange,
  onAvatarFocusChange,
  onComposerFocusChange,
  onMessageChange,
  onSend,
  onInvokePrompt,
  onDismissPrompts,
  onCancel,
  onJoin,
  onResolveApproval,
  onLocateResult,
  onInspectApprovalTargets
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
        <LiquidGlassSurface asChild tone="quiet" variant="control">
          <Button
            aria-controls={activityLogId}
            aria-expanded={activityOpen}
            aria-label={activityOpen ? "收起协作往来" : "查看协作往来"}
            className="coworker-activity-trigger"
            id={`${activityLogId}-trigger`}
            onClick={activityOpen ? onCloseActivity : onShowActivity}
            size="sm"
            tabIndex={activityOpen ? -1 : undefined}
            type="button"
            variant="ghost"
          >
            <svg
              aria-hidden="true"
              className="coworker-activity-trigger__icon"
              fill="none"
              viewBox="0 0 18 18"
            >
              <path d="M5 3.5h9.5v11H5z" />
              <path d="M7.5 6.5H12M7.5 9H12M7.5 11.5h3.25" />
              <path d="M3.5 5.25h1.5M3.5 8.25h1.5M3.5 11.25h1.5" />
            </svg>
            <span>往来</span>
          </Button>
        </LiquidGlassSurface>
        <CoworkerAvatarEntry
          attentionLabel={attentionLabel}
          entryId={entryId}
          expanded={surface.kind !== "closed"}
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
        {online && surface.kind === "prompts" ? (
          <CoworkerPromptArrival
            disabled={sendDisabled}
            mode={promptPresetMode}
            onDismiss={onDismissPrompts}
            onInvoke={onInvokePrompt}
          />
        ) : null}

        {artifact.kind === "handoff" ? (
          <CoworkerGlassHandoff
            key={handoff?.id}
            text={summarizeHandoff(handoff?.text ?? latestUserText ?? "")}
          />
        ) : null}

        {artifact.kind === "thought" ? (
          <LiquidGlassBubble
            className="coworker-thought-bubble"
            shape="thought"
            tail="start"
            tone={phase === "executing" ? "accent" : "neutral"}
          >
            <div
              aria-hidden="true"
              className="coworker-thought-bubble__content"
              data-phase={phase}
            >
              <p>{statusText}</p>
            </div>
          </LiquidGlassBubble>
        ) : null}

        {artifact.kind === "approval" && pendingApproval ? (
          <CoworkerApprovalSheet
            approvalView={pendingApproval}
            disabled={!syncOnline}
            onInspectCanvasTargets={onInspectApprovalTargets}
            onRequestAdjustment={onRequestApprovalAdjustment}
            onResolve={onResolveApproval}
            resolveCanvasTarget={resolveCanvasTarget}
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
            outcome={resultOutcome ?? "not-applied"}
            summary={completionSummary}
            warnings={resultWarnings}
          />
        ) : null}

        {artifact.kind === "delivery" && isResultNotePhase(phase) ? (
          <CoworkerResultNote
            completionSummary={completionSummary}
            onLocateResult={onLocateResult}
            onRequestChanges={onRequestDeliveryFeedback}
            outcome={resultOutcome ?? "not-applied"}
            paragraphs={splitSemanticParagraphs(latestText)}
            phase={phase}
            recordIds={resultRecordIds}
            title={getResultNoteTitle(phase, resultOutcome)}
            warnings={resultWarnings}
          />
        ) : null}

        {!online && composerOpen ? (
          <LiquidGlassBubble
            className="coworker-join-bubble"
            tail="start"
            tone="neutral"
          >
            <section
              aria-label={`确认 ${DRAWLESS_COWORKER_DISPLAY_NAME} 加入画布`}
              className="coworker-join-note"
            >
              <header>
                <span>
                  {DRAWLESS_COWORKER_DISPLAY_NAME} ·{" "}
                  {DRAWLESS_COWORKER_ROLE_LABEL}
                </span>
                <strong>确认加入画布</strong>
              </header>
              <p>
                加入后，我会作为协作者读取当前画布；需要编辑时，会先请你确认。
              </p>
              {joinError ? <p role="alert">{joinError}</p> : null}
              <Button
                disabled={joining || !syncOnline}
                onClick={onJoin}
                type="button"
              >
                {!syncOnline
                  ? "等待画布同步"
                  : joining
                    ? "正在加入…"
                    : "确认加入"}
              </Button>
            </section>
          </LiquidGlassBubble>
        ) : null}

        {online && composerOpen ? (
          <LiquidGlassSurface asChild tone="neutral" variant="document">
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
          </LiquidGlassSurface>
        ) : null}

        <div
          aria-label={`${DRAWLESS_COWORKER_DISPLAY_NAME} 的辅助操作`}
          className="coworker-presence-actions"
          role="group"
        >
          {artifact.kind === "dialogue" || artifact.kind === "issue" ? (
            <LiquidGlassSurface asChild tone="quiet" variant="control">
              <Button
                onClick={onOpenComposer}
                size="sm"
                type="button"
                variant="ghost"
              >
                继续聊
              </Button>
            </LiquidGlassSurface>
          ) : null}
          {canCancel ? (
            <LiquidGlassSurface asChild tone="quiet" variant="control">
              <Button onClick={onCancel} size="sm" type="button" variant="ghost">
                先停一下
              </Button>
            </LiquidGlassSurface>
          ) : null}
          {surface.kind === "current" || surface.kind === "delivery" ? (
            <LiquidGlassSurface asChild tone="quiet" variant="control">
              <Button
                onClick={onCloseSurface}
                size="sm"
                type="button"
                variant="ghost"
              >
                收好
              </Button>
            </LiquidGlassSurface>
          ) : null}
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
  outcome: CoworkerPresenceStageProps["resultOutcome"]
) {
  if (phase === "completed" && outcome === "success") {
    return "我完成了这次画布修改";
  }
  if (phase === "completed" && outcome === "partial") {
    return "我完成了部分画布修改";
  }
  if (phase === "completed" && outcome === "not-applied") {
    return "这次没有修改画布";
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
