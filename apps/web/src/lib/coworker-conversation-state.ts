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
  /** Server 为本次能力调用生成的公开审批 ID。 */
  approvalId: string;
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
};

/**
 * 创建只负责并发约束的同步协调器。
 *
 * React 状态更新可能被批处理，因此“是否已经发起请求”不能只依赖 state。
 * coordinator 使用 room epoch 隔离 A → B → A 场景中的旧异步回写。
 * activeOperation 已同步阻止重复请求；审批的最终原子占用由 server 负责。
 */
export function createCoworkerConversationOperationCoordinator(
  initialRoomId: string
): CoworkerConversationOperationCoordinator {
  let currentRoomId = initialRoomId;
  let roomEpoch = 0;
  let nextOperationId = 1;
  let activeOperation: CoworkerConversationOperationToken | null = null;

  const enterRoom = (roomId: string) => {
    if (roomId === currentRoomId) {
      return;
    }

    currentRoomId = roomId;
    roomEpoch += 1;
    activeOperation = null;
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
    }
  };
}
