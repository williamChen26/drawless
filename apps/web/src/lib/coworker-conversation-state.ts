export type CoworkerConversationStatus =
  | "idle"
  | "receiving"
  | "streaming"
  | "awaiting_approval"
  | "done"
  | "cancelled"
  | "error";

export function isConversationBusy(status: CoworkerConversationStatus) {
  return (
    status === "receiving" ||
    status === "streaming" ||
    status === "awaiting_approval"
  );
}

export type CoworkerApprovalOperationIdentity = {
  /** 发起审批操作时所在的协同房间 ID。 */
  roomId: string;
  /** 当前 agent stream 的 run ID。 */
  runId: string;
  /** 等待审批的 tool call ID。 */
  toolCallId: string;
};

export type CoworkerConversationOperationToken = {
  /** 操作开始时所在的协同房间 ID。 */
  roomId: string;
  /** 操作开始时捕获的房间世代。 */
  roomEpoch: number;
  /** 当前 hook 实例内单调递增的操作 ID。 */
  operationId: number;
};

export type CoworkerConversationOperationCoordinator = {
  /** 同步进入房间，并立即使前一个房间的 token 失效。 */
  enterRoom: (roomId: string) => void;
  /** 当前无进行中操作时创建唯一 token。 */
  start: (roomId: string) => CoworkerConversationOperationToken | null;
  /** 判断异步回调是否仍属于当前房间和当前操作。 */
  isCurrent: (token: CoworkerConversationOperationToken) => boolean;
  /** 结束指定操作；旧 token 不会影响新操作。 */
  finish: (token: CoworkerConversationOperationToken) => void;
  /** 同步占用审批 identity，防止双击产生重复请求。 */
  acquireApproval: (identity: CoworkerApprovalOperationIdentity) => boolean;
  /** 释放指定审批 identity。 */
  releaseApproval: (identity: CoworkerApprovalOperationIdentity) => void;
};

/**
 * 创建只负责并发约束的同步协调器。
 *
 * React 状态更新可能被批处理，因此“是否已经发起请求”不能只依赖 state。
 * coordinator 使用 room epoch 隔离 A → B → A 场景中的旧异步回写，并用
 * approval identity 保证同一审批在一次事件循环内也只能占用一次。
 */
export function createCoworkerConversationOperationCoordinator(
  initialRoomId: string
): CoworkerConversationOperationCoordinator {
  let currentRoomId = initialRoomId;
  let roomEpoch = 0;
  let nextOperationId = 1;
  let activeOperation: CoworkerConversationOperationToken | null = null;
  const activeApprovals = new Set<string>();

  const enterRoom = (roomId: string) => {
    if (roomId === currentRoomId) {
      return;
    }

    currentRoomId = roomId;
    roomEpoch += 1;
    activeOperation = null;
    activeApprovals.clear();
  };

  return {
    enterRoom,
    start(roomId) {
      if (roomId !== currentRoomId || activeOperation) {
        return null;
      }

      const token = {
        roomId,
        roomEpoch,
        operationId: nextOperationId
      };
      nextOperationId += 1;
      activeOperation = token;
      return token;
    },
    isCurrent(token) {
      return (
        activeOperation === token &&
        token.roomId === currentRoomId &&
        token.roomEpoch === roomEpoch
      );
    },
    finish(token) {
      if (activeOperation === token) {
        activeOperation = null;
      }
    },
    acquireApproval(identity) {
      if (identity.roomId !== currentRoomId) {
        return false;
      }

      const key = createCoworkerApprovalOperationKey(identity);
      if (activeApprovals.has(key)) {
        return false;
      }

      activeApprovals.add(key);
      return true;
    },
    releaseApproval(identity) {
      activeApprovals.delete(createCoworkerApprovalOperationKey(identity));
    }
  };
}

export function createCoworkerApprovalOperationKey(
  identity: CoworkerApprovalOperationIdentity
) {
  return JSON.stringify([
    identity.roomId,
    identity.runId,
    identity.toolCallId
  ]);
}
