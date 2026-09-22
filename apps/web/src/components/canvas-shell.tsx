"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSync } from "@tldraw/sync";
import {
  inlineBase64AssetStore,
  isShapeId,
  Tldraw,
  type Editor,
  type TLShapeId
} from "tldraw";
import type { DrawlessCanvasViewportContext } from "@drawless/shared";

import {
  CanvasShellFrame,
  WorkspaceMessage,
  type CollaborationStatusView
} from "./canvas-shell-frame";
import {
  createCollaborationState,
  type CollaborationState
} from "./collaboration-state";
import { CoworkerConversationWindow } from "./coworker-conversation-window";
import { useCoworkerControl } from "./coworker-control-state";

const TLDRAW_LICENSE_KEY = process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY;

export function CanvasShell({ roomId }: { roomId: string }) {
  const isClientReady = useClientReady();
  const collaboration = useMemo(
    () => (isClientReady ? createCollaborationState(roomId) : null),
    [isClientReady, roomId]
  );
  if (!collaboration) {
    return (
      <CanvasShellFrame
        statusView={createCollaborationStatusView({
          storeStatus: "loading"
        })}
      >
        <WorkspaceMessage
          title="正在准备协作画布"
          detail="画布即将就绪。"
          debugValue={{ state: "hydrating-client" }}
        />
      </CanvasShellFrame>
    );
  }

  if (!collaboration.ok) {
    const statusView = createCollaborationStatusView({
      storeStatus: "configuration-error",
      errorMessage: collaboration.error.message
    });

    return (
      <CanvasShellFrame statusView={statusView}>
        <WorkspaceMessage
          role="alert"
          title="画布暂时无法打开"
          detail={collaboration.error.message}
          debugValue={collaboration.error}
          onRetry={() => window.location.reload()}
        />
      </CanvasShellFrame>
    );
  }

  // 房间是所有本地协作状态的生命周期边界；切房时整体重建，避免旧请求和 UI 状态串入新房间。
  return (
    <SyncedCanvasShell
      collaboration={collaboration}
      key={collaboration.roomId}
    />
  );
}

function SyncedCanvasShell({
  collaboration
}: {
  collaboration: Extract<CollaborationState, { ok: true }>;
}) {
  const store = useSync({
    uri: collaboration.roomUri,
    assets: inlineBase64AssetStore,
    users: collaboration.users
  });
  const statusView = createCollaborationStatusView({
    storeStatus: store.status,
    connectionStatus:
      store.status === "synced-remote" ? store.connectionStatus : undefined,
    errorMessage: store.status === "error" ? store.error.message : undefined
  });
  const coworker = useCoworkerControl(collaboration.roomId);
  const editorRef = useRef<Editor | null>(null);

  if (statusView.state === "connecting") {
    return (
      <CanvasShellFrame
        statusView={statusView}
        participantLabel={collaboration.participantLabel}
        coworker={coworker}
      >
        <WorkspaceMessage
          title="正在连接协作画布"
          detail="正在进入这个共享房间。"
          debugValue={statusView.debugValue}
        />
      </CanvasShellFrame>
    );
  }

  if (statusView.state === "error") {
    return (
      <CanvasShellFrame
        statusView={statusView}
        participantLabel={collaboration.participantLabel}
        coworker={coworker}
      >
        <WorkspaceMessage
          role="alert"
          title="协作画布暂时不可用"
          detail={statusView.detail}
          debugValue={statusView.debugValue}
          onRetry={() => window.location.reload()}
        />
      </CanvasShellFrame>
    );
  }

  return (
    <CanvasShellFrame
      statusView={statusView}
      participantLabel={collaboration.participantLabel}
      coworker={coworker}
    >
      <div className="canvas-shell__editor" data-testid="tldraw-host">
        <Tldraw
          store={store}
          {...(TLDRAW_LICENSE_KEY ? { licenseKey: TLDRAW_LICENSE_KEY } : {})}
          onMount={(editor) => {
            editorRef.current = editor;
          }}
        />
        <CoworkerConversationWindow
          coworker={coworker}
          hasCanvasContent={() =>
            Boolean(editorRef.current?.getCurrentPageShapes().length)
          }
          roomId={collaboration.roomId}
          syncOnline={statusView.state === "online"}
          getCanvasViewport={() => createCanvasViewportContext(editorRef.current)}
          resolveCanvasTarget={(shapeId) =>
            resolveCanvasTarget(editorRef.current, shapeId)
          }
          onLocateResult={(recordIds) =>
            locateCanvasResult(editorRef.current, recordIds)
          }
        />
      </div>
    </CanvasShellFrame>
  );
}

function resolveCanvasTarget(editor: Editor | null, shapeId: string) {
  if (!editor || !isShapeId(shapeId)) {
    return null;
  }
  const shape = editor.getShape(shapeId);
  if (!shape) {
    return null;
  }

  // 审批打开时从 tldraw 即时读取名称和类型；不缓存 shape，也不形成第二份画布事实源。
  const text = editor.getShapeUtil(shape).getText(shape)?.trim() || null;
  return {
    label: text,
    shapeKind: shape.type
  };
}

function locateCanvasResult(editor: Editor | null, recordIds: string[]) {
  if (!editor) {
    return;
  }

  // 工具结果只提供 record ID；点击时重新查询 tldraw store，避免缓存第二份 shape 数据。
  const shapeIds = recordIds.filter(
    (recordId): recordId is TLShapeId =>
      isShapeId(recordId) && Boolean(editor.getShape(recordId))
  );
  if (shapeIds.length === 0) {
    return;
  }

  editor.setSelectedShapes(shapeIds);
  const selectionBounds = editor.getSelectionPageBounds();
  if (selectionBounds) {
    // 成果定位最多回到 100%，避免单个小 shape 被放大到占满画布。
    editor.zoomToBounds(selectionBounds, {
      targetZoom: 1,
      animation: { duration: editor.options.animationMediumMs }
    });
  }
  editor.timers.setTimeout(() => editor.getContainer().focus(), 100);
}

function createCanvasViewportContext(
  editor: Editor | null
): DrawlessCanvasViewportContext | null {
  if (!editor) {
    return null;
  }

  // conversation tool 只需要用户当前可视区，不复制完整 tldraw document，避免产生第二套画布事实源。
  const bounds = editor.getViewportPageBounds();
  const camera = editor.getCamera();
  return {
    currentPageId: editor.getCurrentPageId(),
    viewportBounds: {
      x: bounds.x,
      y: bounds.y,
      w: bounds.w,
      h: bounds.h
    },
    viewportCenter: {
      x: bounds.x + bounds.w / 2,
      y: bounds.y + bounds.h / 2
    },
    zoom: camera.z
  };
}

function createCollaborationStatusView(input: {
  storeStatus:
    | "loading"
    | "synced-remote"
    | "error"
    | "configuration-error";
  connectionStatus?: "online" | "offline" | undefined;
  errorMessage?: string | undefined;
}): CollaborationStatusView {
  if (input.storeStatus === "loading") {
    return {
      label: "正在连接",
      state: "connecting",
      detail: "正在连接 tldraw 协作房间。",
      debugValue: {
        storeStatus: input.storeStatus,
        connectionStatus: input.connectionStatus ?? null
      }
    };
  }

  if (input.storeStatus === "synced-remote") {
    const isOnline = input.connectionStatus === "online";
    return {
      label: isOnline ? "协作已连接" : "离线重连中",
      state: isOnline ? "online" : "offline",
      detail: isOnline
        ? "已连接 tldraw 协作服务。"
        : "网络连接已中断，画布仍可查看，恢复网络后会自动重连。",
      debugValue: {
        storeStatus: input.storeStatus,
        connectionStatus: input.connectionStatus
      }
    };
  }

  return {
    label: "协作连接错误",
    state: "error",
    detail: "请检查网络连接，稍后重试；如果问题持续，请联系管理员。",
    debugValue: {
      storeStatus: input.storeStatus,
      connectionStatus: input.connectionStatus ?? null,
      errorMessage: input.errorMessage ?? null
    }
  };
}

function useClientReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  return ready;
}
