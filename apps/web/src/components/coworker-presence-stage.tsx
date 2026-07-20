"use client";

import React, { useState } from "react";
import { Button } from "@drawless/ui";

import type { CoworkerAvatarMode } from "../lib/coworker-avatar-state";
import type { CoworkerConversationToolApproval } from "../lib/coworker-conversation-output";
import { createCoworkerApprovalSummary } from "../lib/coworker-presence-content";
import type { CoworkerPresencePhase } from "../lib/coworker-presence-state";
import type { CoworkerConversationTurn } from "../lib/use-coworker-conversation";

import { CoworkerAvatarEntry } from "./coworker-avatar-entry";
import { CoworkerComposer } from "./coworker-composer";
import { CoworkerPaperHandoff } from "./coworker-paper-handoff";
import {
  CoworkerResultNote,
  type CoworkerResultNotePhase
} from "./coworker-result-note";

export type CoworkerPendingApprovalView = {
  /** 审批所属的对话轮次。 */
  turn: CoworkerConversationTurn;
  /** 等待用户决定的工具调用。 */
  approval: CoworkerConversationToolApproval;
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
  /** Composer DOM ID，用于人物入口的 aria-controls。 */
  composerId: string;
  /** Composer 当前是否展开。 */
  composerOpen: boolean;
  /** 工作记录 DOM ID。 */
  activityLogId: string;
  /** 工作记录当前是否展开。 */
  activityLogOpen: boolean;
  /** 最近一次提交给 Coworker 的原始文本。 */
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
  /** 是否展示停止接收当前回复的动作。 */
  canCancel: boolean;
  /** coworker 是否已经加入当前画布。 */
  online: boolean;
  /** coworker 加入动作是否进行中。 */
  joining: boolean;
  /** coworker 无法加入时的说明。 */
  joinError: string | null;
  /** 展开或收起 Composer。 */
  onToggleComposer: () => void;
  /** 展开或收起工作记录。 */
  onToggleActivityLog: () => void;
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
    approval: CoworkerConversationToolApproval,
    decision: "approve" | "decline"
  ) => Promise<void>;
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
  composerId,
  composerOpen,
  activityLogId,
  activityLogOpen,
  latestUserText,
  handoff,
  latestText,
  pendingApproval,
  completionSummary,
  resultRecordIds,
  message,
  sendDisabled,
  canCancel,
  online,
  joining,
  joinError,
  onToggleComposer,
  onToggleActivityLog,
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
  const showHandoff = Boolean(handoff);
  const showThought = !showHandoff && isThoughtPhase(phase);
  const showExpression = Boolean(latestText) && isExpressionPhase(phase);
  const showReceipt = phase === "completed" && completionSummary;
  const showResultNote =
    !composerOpen &&
    isResultNotePhase(phase) &&
    (showExpression || Boolean(showReceipt));

  return (
    <section
      aria-label="Coworker 协作空间"
      className="coworker-presence-stage"
      data-phase={phase}
    >
      <div className="coworker-presence-stage__anchor">
        <CoworkerAvatarEntry
          disabled={Boolean(pendingApproval)}
          expanded={composerOpen}
          frameSrc={frameSrc}
          lifecycleState={lifecycleState}
          mode={avatarMode}
          onFocusChange={onAvatarFocusChange}
          onHoverChange={onAvatarHoverChange}
          onToggle={onToggleComposer}
          panelId={composerId}
        />
      </div>

      <div className="coworker-presence-stage__exchange">
        {showHandoff ? (
          <CoworkerPaperHandoff
            key={handoff?.id}
            text={summarizeHandoff(handoff?.text ?? latestUserText ?? "")}
          />
        ) : null}

        {showThought ? (
          <div
            aria-hidden="true"
            className="coworker-thought-bubble"
            data-phase={phase}
          >
            <span className="coworker-thought-bubble__trail" />
            <p>{statusText}</p>
          </div>
        ) : null}

        {pendingApproval ? (
          <CoworkerApprovalSheet
            approvalView={pendingApproval}
            onResolve={onResolveApproval}
          />
        ) : null}

        {showResultNote ? (
          <CoworkerResultNote
            completionSummary={completionSummary}
            onLocateResult={onLocateResult}
            paragraphs={splitSemanticParagraphs(latestText)}
            phase={phase}
            recordIds={resultRecordIds}
            title={getResultNoteTitle(phase, resultRecordIds.length > 0)}
          />
        ) : null}

        {!online && composerOpen ? (
          <section
            aria-label="允许 Coworker 加入"
            className="coworker-join-note"
            id={composerId}
          >
            <div>
              <strong>让我来到画布里</strong>
              <p>加入后我会以协作者身份读取画布，只在你确认后执行编辑。</p>
            </div>
            {joinError ? <p role="alert">{joinError}</p> : null}
            <Button disabled={joining} onClick={onJoin} type="button">
              {joining ? "正在加入" : "允许加入"}
            </Button>
          </section>
        ) : null}

        {online && composerOpen && !pendingApproval ? (
          <div className="coworker-presence-stage__composer" id={composerId}>
            <CoworkerComposer
              message={message}
              onFocusChange={onComposerFocusChange}
              onMessageChange={onMessageChange}
              onSend={onSend}
              sendDisabled={sendDisabled}
            />
          </div>
        ) : null}

        <div
          aria-label="Coworker 辅助操作"
          className="coworker-presence-actions"
          role="group"
        >
          {canCancel ? (
            <Button onClick={onCancel} size="sm" type="button" variant="ghost">
              停止接收回复
            </Button>
          ) : null}
          <Button
            aria-controls={activityLogId}
            aria-expanded={activityLogOpen}
            id={`${activityLogId}-trigger`}
            onClick={onToggleActivityLog}
            size="sm"
            type="button"
            variant="ghost"
          >
            {activityLogOpen ? "收起工作记录" : "工作记录"}
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
          ? `Coworker 完成：${completionSummary}${latestText ? `。${latestText}` : ""}`
          : statusText}
      </p>
    </section>
  );
}

function CoworkerApprovalSheet({
  approvalView,
  onResolve
}: {
  approvalView: CoworkerPendingApprovalView;
  onResolve: CoworkerPresenceStageProps["onResolveApproval"];
}) {
  const { turn, approval } = approvalView;
  const plan = createCoworkerApprovalSummary(approval);
  const [decisionPending, setDecisionPending] = useState(false);

  const resolve = async (decision: "approve" | "decline") => {
    if (decisionPending) {
      return;
    }
    setDecisionPending(true);
    try {
      await onResolve(turn, approval, decision);
    } finally {
      setDecisionPending(false);
    }
  };

  return (
    <section
      aria-label="Coworker 等待你的确认"
      className="coworker-approval-sheet"
      data-pending={decisionPending}
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
          disabled={decisionPending || !plan.canApprove}
          onClick={() => void resolve("approve")}
          type="button"
        >
          {decisionPending
            ? "正在继续"
            : plan.canApprove
              ? "允许这次"
              : "计划不可执行"}
        </Button>
        <Button
          disabled={decisionPending}
          onClick={() => void resolve("decline")}
          type="button"
          variant="secondary"
        >
          暂不执行
        </Button>
      </div>
    </section>
  );
}

function isThoughtPhase(phase: CoworkerPresencePhase) {
  return phase === "thinking" || phase === "executing";
}

function isExpressionPhase(phase: CoworkerPresencePhase) {
  return (
    phase === "speaking" ||
    phase === "completed" ||
    phase === "interrupted" ||
    phase === "error"
  );
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
    return "这是我的完整答复";
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

export function splitSemanticParagraphs(text: string) {
  return normalizeExpressionText(text)
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function normalizeExpressionText(text: string) {
  return text
    .replace(/^[\t ]*[-_]{3,}[\t ]*$/gmu, "")
    .replace(/^[\t ]*```[^\n]*$/gmu, "")
    .replace(/^[\t ]*\|?[\t ]*:?-{3,}:?[\t ]*(?:\|[\t ]*:?-{3,}:?[\t ]*)+\|?[\t ]*$/gmu, "")
    .replace(/^[\t ]*\|(.+)\|[\t ]*$/gmu, (_line, cells: string) =>
      cells
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean)
        .join(" · ")
    )
    .replace(/^#{1,6}\s+/gmu, "")
    .replace(/\*\*([^*]+)\*\*/gu, "$1")
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/\n{3,}/gu, "\n\n");
}
