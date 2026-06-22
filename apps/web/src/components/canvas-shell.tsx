"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSync } from "@tldraw/sync";
import { inlineBase64AssetStore, Tldraw, type Editor } from "tldraw";
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
import { CoworkerEntryDialog } from "./coworker-entry-dialog";
import { useCoworkerControl } from "./coworker-control-state";
import { useRoomShare } from "./room-share-state";

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
          title="Preparing collaborative canvas"
          value={{ state: "hydrating-client" }}
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
          title={collaboration.error.message}
          value={collaboration.error}
        />
      </CanvasShellFrame>
    );
  }

  return <SyncedCanvasShell collaboration={collaboration} />;
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
  const share = useRoomShare(collaboration.roomId);
  const coworker = useCoworkerControl(collaboration.roomId);
  const editorRef = useRef<Editor | null>(null);

  if (statusView.state === "connecting") {
    return (
      <CanvasShellFrame
        statusView={statusView}
        participantLabel={collaboration.participantLabel}
        share={share}
        coworker={coworker}
      >
        <WorkspaceMessage
          title="Connecting collaborative canvas"
          value={statusView.raw}
        />
      </CanvasShellFrame>
    );
  }

  if (statusView.state === "error") {
    return (
      <CanvasShellFrame
        statusView={statusView}
        participantLabel={collaboration.participantLabel}
        share={share}
        coworker={coworker}
      >
        <WorkspaceMessage
          role="alert"
          title={statusView.detail}
          value={statusView.raw}
        />
      </CanvasShellFrame>
    );
  }

  return (
    <CanvasShellFrame
      statusView={statusView}
      participantLabel={collaboration.participantLabel}
      share={share}
      coworker={coworker}
    >
      <div className="canvas-shell__editor" data-testid="tldraw-host">
        <Tldraw
          store={store}
          licenseKey={'tldraw-2026-09-30/WyJUSG9jenplMSIsWyIqIl0sMTYsIjIwMjYtMDktMzAiXQ.uxnHwI7nKxk3KwhNGpIcRZCphK02Kyhc4BDMbbZZ1FtJcYfIz0LgVY34aH50SH7RqyL7pFnbGgzuyydfbguWVg'}
          onMount={(editor) => {
            editorRef.current = editor;
          }}
        />
        <CoworkerConversationWindow
          roomId={collaboration.roomId}
          getCanvasViewport={() => createCanvasViewportContext(editorRef.current)}
        />
        {/* 入场弹窗放在 tldraw host 内，确保遮罩、焦点管理和画布工具栏处在同一客户端边界。 */}
        <CoworkerEntryDialog coworker={coworker} roomId={collaboration.roomId} />
      </div>
    </CanvasShellFrame>
  );
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
    | "synced-local"
    | "not-synced"
    | "error"
    | "configuration-error";
  connectionStatus?: "online" | "offline" | undefined;
  errorMessage?: string | undefined;
}): CollaborationStatusView {
  if (input.storeStatus === "loading") {
    return {
      label: "Connecting sync",
      state: "connecting",
      detail: "Opening the collaborative tldraw room.",
      raw: {
        storeStatus: input.storeStatus,
        connectionStatus: input.connectionStatus ?? null
      }
    };
  }

  if (input.storeStatus === "synced-remote" && input.connectionStatus === "online") {
    return {
      label: "Backend sync",
      state: "online",
      detail: "Connected to the dedicated tldraw sync backend.",
      raw: {
        storeStatus: input.storeStatus,
        connectionStatus: input.connectionStatus
      }
    };
  }

  return {
    label: "Sync raw error",
    state: "error",
    detail:
      input.errorMessage ??
      "Collaborative canvas is unavailable because sync state is invalid.",
    raw: {
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
