"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSync } from "@tldraw/sync";
import {
  computed,
  createUserId,
  inlineBase64AssetStore,
  Tldraw,
  UserRecordType,
  type TLUserStore
} from "tldraw";

import {
  createCollaboratorIdentity,
  createSessionLabel
} from "@/lib/collaborator-identity";
import {
  createTabSessionId,
  getOrCreateDeviceIdentity
} from "@/lib/device-identity";
import { buildRoomPath } from "@/lib/room-route";
import {
  resolveSyncConfig,
  type SyncConfigError
} from "@/lib/sync-config";

type CollaborationState =
  | {
      /** 当前分支是否已经成功生成协同连接配置。 */
      ok: true;
      /** 当前画布房间 ID，用于生成房间链接。 */
      roomId: string;
      /** `useSync` 连接后端 WebSocket 房间时使用的完整地址。 */
      roomUri: string;
      /** 顶部逻辑壳层显示的当前参与者标签，由设备名和标签页名组成。 */
      participantLabel: string;
      /** tldraw 使用的用户信息 store，用于协同在线状态和用户元数据。 */
      users: TLUserStore;
    }
  | {
      /** 当前分支是否已经成功生成协同连接配置。 */
      ok: false;
      /** 协同配置失败原因，直接渲染为调试信息。 */
      error: SyncConfigError;
    };

type CollaborationStatusView = {
  /** 顶部栏展示的协同状态名称。 */
  label: string;
  /** 页面分支使用的状态类型。 */
  state: "connecting" | "online" | "error";
  /** 鼠标悬停和错误页展示的状态说明。 */
  detail: string;
  /** 错误或等待状态下直接展示的原始调试数据。 */
  raw: unknown;
};

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

  if (statusView.state === "connecting") {
    return (
      <CanvasShellFrame
        statusView={statusView}
        participantLabel={collaboration.participantLabel}
        share={share}
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
    >
      <div className="canvas-shell__editor" data-testid="tldraw-host">
        <Tldraw store={store} />
      </div>
    </CanvasShellFrame>
  );
}

function CanvasShellFrame({
  children,
  statusView,
  participantLabel,
  share
}: {
  /** 页面主体内容，通常是 tldraw 或连接错误信息。 */
  children: ReactNode;
  /** 从 tldraw sync store 状态转换出的展示状态。 */
  statusView: CollaborationStatusView;
  /** 当前浏览器参与者的调试标签。 */
  participantLabel?: string;
  /** 当前房间的浏览器访问链接。 */
  share?: RoomShareState;
}) {
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
        </div>
      </header>
      <section className="canvas-shell__workspace" aria-label="Infinite canvas">
        {children}
      </section>
    </main>
  );
}

function WorkspaceMessage({
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

function createCollaborationState(roomId: string): CollaborationState {
  const deviceId = getOrCreateDeviceIdentity();
  const tabId = createTabSessionId();
  const syncConfig = resolveSyncConfig({
    serverUrl: process.env.NEXT_PUBLIC_DRAWLESS_SYNC_SERVER_URL,
    roomId,
    deviceId,
    tabId
  });

  if (!syncConfig.ok) {
    return {
      ok: false,
      error: syncConfig.error
    };
  }

  const collaborator = createCollaboratorIdentity(deviceId);

  return {
    ok: true,
    roomId: syncConfig.value.roomId,
    roomUri: syncConfig.value.roomUri,
    participantLabel: `${collaborator.userName} / ${createSessionLabel(tabId)}`,
    users: createDeviceUserStore(deviceId)
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

function createDeviceUserStore(deviceId: string): TLUserStore {
  const collaborator = createCollaboratorIdentity(deviceId);
  const currentUser = computed(`drawless-current-user:${deviceId}`, () =>
    UserRecordType.create({
      id: createUserId(deviceId),
      name: collaborator.userName,
      color: collaborator.color,
      imageUrl: "",
      meta: { deviceId, shortDeviceId: collaborator.shortDeviceId }
    })
  );

  return {
    currentUser,
    resolve(userId) {
      return computed(`drawless-user:${userId}`, () =>
        userId === createUserId(deviceId) ? currentUser.get() : null
      );
    }
  };
}

type RoomShareState = {
  /** 当前房间可复制或直接打开的完整 URL；生成失败时为 null。 */
  url: string | null;
};

function useRoomShare(roomId: string): RoomShareState {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      setUrl(new URL(buildRoomPath(roomId), window.location.origin).toString());
    } catch {
      setUrl(null);
    }
  }, [roomId]);

  return { url };
}

function useClientReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  return ready;
}
