"use client";

import { useEffect, useMemo, useState } from "react";
import { useSync } from "@tldraw/sync";
import { inlineBase64AssetStore, Tldraw } from "tldraw";

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
        <Tldraw store={store} />
        <CoworkerConversationWindow roomId={collaboration.roomId} />
      </div>
    </CanvasShellFrame>
  );
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
