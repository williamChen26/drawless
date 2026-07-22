import type { ReactNode } from "react";

import type { CoworkerControlState } from "./coworker-control-state";

export type CollaborationStatusView = {
  /** 顶部栏展示的协同状态名称。 */
  label: string;
  /** 页面分支使用的状态类型。 */
  state: "connecting" | "online" | "error";
  /** 鼠标悬停和错误页展示的状态说明。 */
  detail: string;
  /** 错误或等待状态下直接展示的原始调试数据。 */
  raw: unknown;
};

export type RoomShareState = {
  /** 当前房间可复制或直接打开的完整 URL；生成失败时为 null。 */
  url: string | null;
};

export function CanvasShellFrame({
  children,
  statusView,
  participantLabel,
  share,
  coworker
}: {
  /** 页面主体内容，通常是 tldraw 或连接错误信息。 */
  children: ReactNode;
  /** 从 tldraw sync store 状态转换出的展示状态。 */
  statusView: CollaborationStatusView;
  /** 当前浏览器参与者的调试标签。 */
  participantLabel?: string;
  /** 当前房间的浏览器访问链接。 */
  share?: RoomShareState;
  /** coworker 生命周期控制状态和显式动作。 */
  coworker?: CoworkerControlState;
}) {
  const showDebugControls =
    process.env.NEXT_PUBLIC_DRAWLESS_DEBUG_UI === "true";

  return (
    <main className="canvas-shell" data-testid="canvas-shell">
      <header className="canvas-shell__bar" aria-label="Canvas workspace">
        <div className="canvas-shell__brand">
          <strong>drawless</strong>
        </div>
        <div className="canvas-shell__toolbar" aria-label="Canvas status">
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
          {share?.url ? (
            <a
              className="canvas-shell__share"
              data-testid="share-room-button"
              href={share.url}
            >
              房间链接
            </a>
          ) : null}
          {coworker && showDebugControls ? (
            <CoworkerControlBar coworker={coworker} />
          ) : null}
        </div>
      </header>
      <section className="canvas-shell__workspace" aria-label="Infinite canvas">
        {children}
      </section>
    </main>
  );
}

export function WorkspaceMessage({
  title,
  value,
  role
}: {
  title: string;
  value: unknown;
  role?: "alert";
}) {
  return (
    <div className="canvas-shell__workspace--message" aria-label={title}>
      <div className="canvas-shell__message" role={role}>
        <strong>{title}</strong>
        <pre>{JSON.stringify(value, null, 2)}</pre>
      </div>
    </div>
  );
}

function CoworkerControlBar({ coworker }: { coworker: CoworkerControlState }) {
  return (
    <div className="canvas-shell__coworker" aria-label="Coworker control">
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
