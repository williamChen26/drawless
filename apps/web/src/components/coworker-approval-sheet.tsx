"use client";

import React, { useState } from "react";
import {
  DRAWLESS_COWORKER_DISPLAY_NAME,
  type DrawlessCoworkerApprovalRequest
} from "@drawless/shared";
import { Button, LiquidGlassSurface } from "@drawless/ui";

import {
  createCoworkerApprovalSummary,
  type CoworkerCanvasTargetResolver
} from "../lib/coworker-presence-content";
import type { CoworkerConversationTurn } from "../lib/use-coworker-conversation";

export type CoworkerPendingApprovalView = {
  /** 审批所属的对话轮次。 */
  turn: CoworkerConversationTurn;
  /** 等待用户决定的工具调用。 */
  approval: DrawlessCoworkerApprovalRequest;
};

export type CoworkerApprovalSheetProps = {
  /** 当前等待用户处理的审批和所属轮次。 */
  approvalView: CoworkerPendingApprovalView;
  /** 当前同步状态是否阻止提交审批。 */
  disabled: boolean;
  /** 从当前 tldraw document 即时读取被修改对象。 */
  resolveCanvasTarget?: CoworkerCanvasTargetResolver | undefined;
  /** 在真实画布中定位审批所引用的现有对象。 */
  onInspectCanvasTargets?: ((recordIds: string[]) => void) | undefined;
  /** 提交批准或拒绝决定。 */
  onResolve: (
    turn: CoworkerConversationTurn,
    approval: DrawlessCoworkerApprovalRequest,
    decision: "approve" | "decline"
  ) => Promise<boolean>;
  /** 退回当前计划并进入调整说明。 */
  onRequestAdjustment: (
    approvalView: CoworkerPendingApprovalView
  ) => Promise<boolean>;
};

/**
 * 从结构化能力提案派生的审批工作单。
 *
 * 明细只读取 shared 契约和当前 tldraw document，不保存第二份画布事实。
 */
export function CoworkerApprovalSheet({
  approvalView,
  disabled,
  resolveCanvasTarget,
  onInspectCanvasTargets,
  onResolve,
  onRequestAdjustment
}: CoworkerApprovalSheetProps) {
  const { turn, approval } = approvalView;
  const plan = createCoworkerApprovalSummary(approval, resolveCanvasTarget);
  const [pendingAction, setPendingAction] = useState<
    "approve" | "decline" | "adjust" | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const resolve = async (decision: "approve" | "decline") => {
    if (pendingAction) {
      return;
    }
    setActionError(null);
    setPendingAction(decision);
    try {
      const resolved = await onResolve(turn, approval, decision);
      if (!resolved) {
        setActionError("决定没有提交成功。审批状态已重新核对，请再试一次。");
      }
    } catch {
      setActionError("现在无法提交决定。请检查连接后再试一次。");
    } finally {
      setPendingAction(null);
    }
  };

  const requestAdjustment = async () => {
    if (pendingAction) {
      return;
    }
    setActionError(null);
    setPendingAction("adjust");
    try {
      const adjusted = await onRequestAdjustment(approvalView);
      if (!adjusted) {
        setActionError("计划还没有退回。审批状态已重新核对，请再试一次。");
      }
    } catch {
      setActionError("暂时无法退回计划。请检查连接后再试一次。");
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <LiquidGlassSurface asChild tone="warning" variant="document">
      <section
        aria-label={`${DRAWLESS_COWORKER_DISPLAY_NAME} 等待你的确认`}
        aria-labelledby={`approval-title-${approval.id}`}
        className="coworker-approval-sheet"
        data-pending={Boolean(pendingAction)}
      >
        <header>
          <div>
            <span>画布编辑审批</span>
            <strong id={`approval-title-${approval.id}`}>{plan.title}</strong>
          </div>
          <p
            aria-label={
              plan.operationCount === null
                ? "修改数量未知"
                : `${plan.operationCount} 项修改`
            }
          >
            <b>{plan.operationCount ?? "—"}</b>
            <small>项修改</small>
          </p>
        </header>

        <p className="coworker-approval-sheet__intent">{plan.intent}</p>

        {plan.structured ? (
          <div className="coworker-approval-sheet__scope" role="note">
            <span>仅这一次</span>
            <span>{plan.scope}</span>
            <span>批准后才会写入</span>
          </div>
        ) : null}

        {plan.validationMessage ? (
          <p className="coworker-approval-sheet__validation" role="alert">
            {plan.validationMessage}
          </p>
        ) : null}

        {plan.operations.length > 0 ? (
          <details className="coworker-approval-sheet__details" open>
            <summary>
              <span>逐项核对</span>
              <small>{plan.operationSummary}</small>
            </summary>
            <ol className="coworker-approval-sheet__operations">
              {plan.operations.map((operation, index) => (
                <li key={operation.id}>
                  <span
                    aria-hidden="true"
                    className="coworker-approval-sheet__index"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <span className="coworker-approval-sheet__action">
                      {operation.action}
                    </span>
                    <strong>{operation.title}</strong>
                    {operation.detail ? <p>{operation.detail}</p> : null}
                    {operation.targetRecordIds.length > 0 &&
                    onInspectCanvasTargets ? (
                      <button
                        className="coworker-approval-sheet__locate"
                        onClick={() =>
                          onInspectCanvasTargets(operation.targetRecordIds)
                        }
                        type="button"
                      >
                        在画布中查看
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </details>
        ) : null}

        {actionError ? (
          <p className="coworker-approval-sheet__action-error" role="alert">
            {actionError}
          </p>
        ) : null}

        <footer>
          <p>请确认内容和顺序。执行后，Drew 会递回结果。</p>
          <div className="coworker-approval-sheet__actions">
            <Button
              disabled={disabled || Boolean(pendingAction) || !plan.canApprove}
              onClick={() => void resolve("approve")}
              type="button"
            >
              {pendingAction === "approve"
                ? "正在提交…"
                : plan.canApprove
                  ? "批准并执行"
                  : "计划不可执行"}
            </Button>
            <Button
              disabled={disabled || Boolean(pendingAction)}
              onClick={() => void requestAdjustment()}
              type="button"
              variant="secondary"
            >
              {pendingAction === "adjust" ? "正在退回…" : "退回调整"}
            </Button>
            <Button
              disabled={disabled || Boolean(pendingAction)}
              onClick={() => void resolve("decline")}
              type="button"
              variant="ghost"
            >
              {pendingAction === "decline" ? "正在提交…" : "暂不执行"}
            </Button>
          </div>
        </footer>
      </section>
    </LiquidGlassSurface>
  );
}
