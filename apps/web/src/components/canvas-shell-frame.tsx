import type { ReactNode } from "react";
import { DRAWLESS_COWORKER_DISPLAY_NAME } from "@drawless/shared";

import type { CoworkerControlState } from "./coworker-control-state";

export type CollaborationStatusView = {
  /** debug 模式顶部栏展示的协同状态名称。 */
  label: string;
  /** 页面分支使用的状态类型。 */
  state: "connecting" | "online" | "offline" | "error";
  /** 鼠标悬停和错误页展示的状态说明。 */
  detail: string;
  /** 仅供 debug 模式查看的协同诊断数据。 */
  debugValue: unknown;
};

export function CanvasShellFrame({
  children,
  statusView,
  participantLabel,
  coworker
}: {
  /** 页面主体内容，通常是 tldraw 或连接错误信息。 */
  children: ReactNode;
  /** 从 tldraw sync store 状态转换出的展示状态。 */
  statusView: CollaborationStatusView;
  /** 当前浏览器参与者的 debug 标签。 */
  participantLabel?: string;
  /** coworker 生命周期控制状态和显式动作。 */
  coworker?: CoworkerControlState;
}) {
  const showDebugUi = process.env.NEXT_PUBLIC_DRAWLESS_DEBUG_UI === "true";

  return (
    <main className="canvas-shell" data-testid="canvas-shell">
      <header className="canvas-shell__bar" aria-label="Canvas workspace">
        <div className="canvas-shell__brand">
          <strong>drawless</strong>
        </div>
        {showDebugUi ? (
          <div className="canvas-shell__toolbar" aria-label="画布诊断控制">
            <span
              className="canvas-shell__pill"
              data-testid="sync-status"
              data-state={statusView.state}
              title={statusView.detail}
            >
              {statusView.label}
            </span>
            {participantLabel ? (
              <span
                className="canvas-shell__identity"
                data-testid="collab-identity"
              >
                {participantLabel}
              </span>
            ) : null}
            {coworker ? <CoworkerControlBar coworker={coworker} /> : null}
          </div>
        ) : null}
      </header>
      <section className="canvas-shell__workspace" aria-label="Infinite canvas">
        {children}
      </section>
    </main>
  );
}

export function WorkspaceMessage({
  title,
  detail,
  debugValue,
  onRetry,
  role
}: {
  title: string;
  detail?: string;
  debugValue?: unknown;
  onRetry?: () => void;
  role?: "alert";
}) {
  const showDebugUi = process.env.NEXT_PUBLIC_DRAWLESS_DEBUG_UI === "true";

  return (
    <div className="canvas-shell__workspace--message" aria-label={title}>
      <div className="canvas-shell__message" role={role}>
        <strong>{title}</strong>
        {detail ? <p>{detail}</p> : null}
        {onRetry ? (
          <button
            className="canvas-shell__message-action"
            onClick={onRetry}
            type="button"
          >
            重新连接
          </button>
        ) : null}
        {showDebugUi && debugValue !== undefined ? (
          <details>
            <summary>诊断信息</summary>
            <pre>{JSON.stringify(debugValue, null, 2)}</pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function CoworkerControlBar({ coworker }: { coworker: CoworkerControlState }) {
  return (
    <div
      className="canvas-shell__coworker"
      aria-label={`${DRAWLESS_COWORKER_DISPLAY_NAME} 调试控制`}
    >
      <span
        className="canvas-shell__coworker-status"
        data-state={coworker.view.state}
        title={coworker.view.detail}
      >
        {coworker.view.label}
      </span>
      <button
        className="canvas-shell__coworker-action"
        type="button"
        disabled={coworker.view.busy}
        onClick={() => {
          void coworker.refresh();
        }}
      >
        状态
      </button>
      <button
        className="canvas-shell__coworker-action"
        type="button"
        disabled={coworker.view.busy}
        onClick={() => {
          void coworker.start();
        }}
      >
        进入
      </button>
      <button
        className="canvas-shell__coworker-action"
        type="button"
        disabled={coworker.view.busy}
        onClick={() => {
          void coworker.stop();
        }}
      >
        离开
      </button>
    </div>
  );
}
