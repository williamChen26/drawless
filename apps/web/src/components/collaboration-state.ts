import { computed, createUserId, UserRecordType, type TLUserStore } from "tldraw";

import {
  createCollaboratorIdentity,
  createSessionLabel
} from "@/lib/collaborator-identity";
import {
  createTabSessionId,
  getOrCreateDeviceIdentity
} from "@/lib/device-identity";
import { resolveSyncConfig, type SyncConfigError } from "@/lib/sync-config";

export type CollaborationState =
  | {
      /** 当前分支是否已经成功生成协同连接配置。 */
      ok: true;
      /** 当前画布房间 ID，用于 coworker 与协作会话。 */
      roomId: string;
      /** `useSync` 连接后端 WebSocket 房间时使用的完整地址。 */
      roomUri: string;
      /** debug 模式显示的当前参与者标签，由设备名和标签页名组成。 */
      participantLabel: string;
      /** tldraw 使用的用户信息 store，用于协同在线状态和用户元数据。 */
      users: TLUserStore;
    }
  | {
      /** 当前分支是否已经成功生成协同连接配置。 */
      ok: false;
      /** 协同配置失败原因，用于生成用户提示和 debug 诊断信息。 */
      error: SyncConfigError;
    };

export function createCollaborationState(roomId: string): CollaborationState {
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
