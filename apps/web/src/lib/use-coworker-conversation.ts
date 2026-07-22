"use client";

import { useEffect, useRef, useState } from "react";
import type {
  DrawlessCanvasViewportContext,
  DrawlessCoworkerApprovalRequest
} from "@drawless/shared";

import {
  createCoworkerConversationStream,
  createCoworkerApprovalResolutionStream,
  loadCoworkerPendingApprovals,
  readCoworkerConversationEventStream,
  type CoworkerConversationStreamError
} from "./coworker-conversation";
import { createCoworkerConversationOutput } from "./coworker-conversation-output";
import {
  createCoworkerConversationOperationCoordinator,
  isConversationBusy,
  type CoworkerApprovalOperationIdentity,
  type CoworkerConversationOperationToken,
  type CoworkerConversationStatus
} from "./coworker-conversation-state";
import {
  appendCoworkerConversationOutputBlock,
  appendCoworkerConversationTextChunk,
  createRecoveredCoworkerApprovalBlocks,
  type CoworkerConversationTimelineBlock
} from "./coworker-conversation-timeline";

export type CoworkerConversationTurn = {
  /** 本地渲染用 ID，不作为跨端消息事实源。 */
  id: string;
  /** 用户在这一轮发送的文本。 */
  userText: string | null;
  /** 这一轮回复的请求生命周期状态。 */
  status: CoworkerConversationStatus;
  /** coworker 回复按 SSE 到达顺序形成的串行内容块。 */
  blocks: CoworkerConversationTimelineBlock[];
};

type ActiveConversationRequest = {
  /** 当前请求所属的 operation token。 */
  token: CoworkerConversationOperationToken;
  /** 当前请求对应的会话轮次 ID。 */
  turnId: string;
  /** 用于显式取消 fetch 和流读取。 */
  abortController: AbortController;
  /** 当前操作对应的审批 identity；普通消息为 null。 */
  approvalIdentity: CoworkerApprovalOperationIdentity | null;
};

export function useCoworkerConversation(input: {
  /** 当前协同房间 ID。 */
  roomId: string;
  /** 发送消息时读取用户当前画布可视区。 */
  getCanvasViewport?:
    | (() => DrawlessCanvasViewportContext | null)
    | undefined;
}) {
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<CoworkerConversationTurn[]>([]);
  const [status, setStatus] = useState<CoworkerConversationStatus>("idle");
  const coordinatorRef = useRef<ReturnType<
    typeof createCoworkerConversationOperationCoordinator
  > | null>(null);
  const activeRequestRef = useRef<ActiveConversationRequest | null>(null);
  const activityEpochRef = useRef(0);

  if (!coordinatorRef.current) {
    coordinatorRef.current =
      createCoworkerConversationOperationCoordinator(input.roomId);
  }
  const coordinator = coordinatorRef.current;
  const busy = isConversationBusy(status);

  useEffect(() => {
    const recoveryController = new AbortController();
    const recoveryEpoch = activityEpochRef.current + 1;
    activityEpochRef.current = recoveryEpoch;
    coordinator.enterRoom(input.roomId);
    setMessage("");
    setTurns([]);
    setStatus("idle");

    void loadCoworkerPendingApprovals({
      roomId: input.roomId,
      serverUrl: getCoworkerServerUrl(),
      signal: recoveryController.signal
    })
      .then((result) => {
        if (
          recoveryController.signal.aborted ||
          activityEpochRef.current !== recoveryEpoch ||
          !result.ok ||
          result.approvals.length === 0
        ) {
          return;
        }

        const blocks = createRecoveredCoworkerApprovalBlocks(
          result.approvals
        );
        if (blocks.length === 0) {
          return;
        }
        setTurns([
          {
            id: `recovered-approvals:${input.roomId}`,
            userText: null,
            status: "awaiting_approval",
            blocks
          }
        ]);
        setStatus("awaiting_approval");
      })
      .catch(() => {
        // 恢复失败不阻断正常沟通；后续显式请求仍会返回可见错误。
      });

    return () => {
      recoveryController.abort();
      activityEpochRef.current += 1;
      const activeRequest = activeRequestRef.current;
      if (activeRequest && activeRequest.token.roomId === input.roomId) {
        activeRequest.abortController.abort();
        coordinator.finish(activeRequest.token);
        if (activeRequest.approvalIdentity) {
          coordinator.releaseApproval(activeRequest.approvalIdentity);
        }
        activeRequestRef.current = null;
      }
    };
  }, [coordinator, input.roomId]);

  const updateTurns = (
    token: CoworkerConversationOperationToken,
    update: (current: CoworkerConversationTurn[]) => CoworkerConversationTurn[]
  ) => {
    if (coordinator.isCurrent(token)) {
      setTurns(update);
    }
  };

  const updateStatus = (
    token: CoworkerConversationOperationToken,
    nextStatus: CoworkerConversationStatus
  ) => {
    if (coordinator.isCurrent(token)) {
      setStatus(nextStatus);
    }
  };

  const setTurnStatus = (
    token: CoworkerConversationOperationToken,
    turnId: string,
    nextStatus: CoworkerConversationStatus
  ) => {
    updateTurns(token, (current) =>
      current.map((turn) =>
        turn.id === turnId ? { ...turn, status: nextStatus } : turn
      )
    );
  };

  const appendTextToTurn = (
    token: CoworkerConversationOperationToken,
    turnId: string,
    chunk: string
  ) => {
    updateTurns(token, (current) =>
      current.map((turn) =>
        turn.id === turnId
          ? {
              ...turn,
              blocks: appendCoworkerConversationTextChunk(
                turn.blocks,
                chunk,
                createLocalId
              )
            }
          : turn
      )
    );
  };

  const appendOutputToTurn = (
    token: CoworkerConversationOperationToken,
    turnId: string,
    output: ReturnType<typeof createCoworkerConversationOutput>
  ) => {
    updateTurns(token, (current) =>
      current.map((turn) =>
        turn.id === turnId
          ? {
              ...turn,
              blocks: appendCoworkerConversationOutputBlock(
                turn.blocks,
                output,
                createLocalId
              )
            }
          : turn
      )
    );
  };

  const setToolDecisionStatus = (
    token: CoworkerConversationOperationToken,
    turnId: string,
    identity: CoworkerApprovalOperationIdentity,
    nextStatus: "running" | "declined" | "awaiting-approval"
  ) => {
    updateTurns(token, (current) =>
      current.map((turn) => {
        if (turn.id !== turnId) {
          return turn;
        }

        return {
          ...turn,
          blocks: turn.blocks.map((block) => {
            if (
              block.kind !== "tool" ||
              block.approval?.id !== identity.approvalId
            ) {
              return block;
            }

            return { ...block, status: nextStatus };
          })
        };
      })
    );
  };

  const readStreamIntoTurn = async (
    token: CoworkerConversationOperationToken,
    turnId: string,
    stream: ReadableStream<Uint8Array>
  ): Promise<CoworkerConversationStatus | null> => {
    let streamFailed = false;
    let awaitingApproval = false;

    await readCoworkerConversationEventStream(stream, (event) => {
      if (!coordinator.isCurrent(token)) {
        return;
      }

      const output = createCoworkerConversationOutput(event);
      appendOutputToTurn(token, turnId, output);
      if (output.event.type === "error") {
        streamFailed = true;
      }
      if (output.event.approval) {
        awaitingApproval = true;
      }
    });

    if (!coordinator.isCurrent(token)) {
      return null;
    }
    if (streamFailed) {
      return "error";
    }
    if (awaitingApproval) {
      return "awaiting_approval";
    }
    return "done";
  };

  const sendMessage = async () => {
    const nextMessage = message.trim();
    if (!nextMessage || busy) {
      return;
    }

    const token = coordinator.start(input.roomId);
    if (!token) {
      return;
    }
    activityEpochRef.current += 1;

    const turn = createConversationTurn(nextMessage);
    const abortController = new AbortController();
    const activeRequest: ActiveConversationRequest = {
      token,
      turnId: turn.id,
      abortController,
      approvalIdentity: null
    };
    activeRequestRef.current = activeRequest;
    setTurns((current) => [...current, turn]);
    setMessage("");
    setStatus("receiving");

    try {
      const result = await createCoworkerConversationStream({
        roomId: token.roomId,
        message: nextMessage,
        viewport: input.getCanvasViewport?.() ?? null,
        serverUrl: getCoworkerServerUrl(),
        signal: abortController.signal
      });

      if (!coordinator.isCurrent(token)) {
        return;
      }
      if (!result.ok) {
        appendTextToTurn(token, turn.id, formatStreamError(result.error));
        setTurnStatus(token, turn.id, "error");
        updateStatus(token, "error");
        return;
      }

      setTurnStatus(token, turn.id, "streaming");
      updateStatus(token, "streaming");
      const nextStatus = await readStreamIntoTurn(
        token,
        turn.id,
        result.stream
      );
      if (!nextStatus) {
        return;
      }
      setTurnStatus(token, turn.id, nextStatus);
      updateStatus(token, nextStatus);
    } catch (error) {
      if (!coordinator.isCurrent(token)) {
        return;
      }
      if (abortController.signal.aborted) {
        cancelActiveRequest(activeRequest);
        return;
      }

      appendTextToTurn(token, turn.id, formatUnknownError(error));
      setTurnStatus(token, turn.id, "error");
      updateStatus(token, "error");
    } finally {
      finishActiveRequest(activeRequest);
    }
  };

  const resolveToolApproval = async (
    turn: CoworkerConversationTurn,
    approval: DrawlessCoworkerApprovalRequest,
    decision: "approve" | "decline"
  ): Promise<boolean> => {
    const identity = {
      roomId: input.roomId,
      approvalId: approval.id
    };
    if (!coordinator.acquireApproval(identity)) {
      return false;
    }

    const token = coordinator.start(input.roomId);
    if (!token) {
      coordinator.releaseApproval(identity);
      return false;
    }

    const abortController = new AbortController();
    const activeRequest: ActiveConversationRequest = {
      token,
      turnId: turn.id,
      abortController,
      approvalIdentity: identity
    };
    activeRequestRef.current = activeRequest;
    setToolDecisionStatus(
      token,
      turn.id,
      identity,
      decision === "approve" ? "running" : "declined"
    );
    setTurnStatus(token, turn.id, "streaming");
    updateStatus(token, "streaming");

    try {
      const result = await createCoworkerApprovalResolutionStream({
        roomId: identity.roomId,
        approvalId: identity.approvalId,
        decision,
        serverUrl: getCoworkerServerUrl(),
        signal: abortController.signal
      });

      if (!coordinator.isCurrent(token)) {
        return false;
      }
      if (!result.ok) {
        restoreFailedApproval(
          activeRequest,
          identity,
          formatStreamError(result.error)
        );
        return false;
      }

      const nextStatus = await readStreamIntoTurn(
        token,
        turn.id,
        result.stream
      );
      if (!nextStatus) {
        return false;
      }
      setTurnStatus(token, turn.id, nextStatus);
      updateStatus(token, nextStatus);
      return nextStatus !== "awaiting_approval" && nextStatus !== "error";
    } catch (error) {
      if (!coordinator.isCurrent(token)) {
        return false;
      }
      if (abortController.signal.aborted) {
        cancelActiveRequest(activeRequest);
        return false;
      }

      restoreFailedApproval(
        activeRequest,
        identity,
        formatUnknownError(error)
      );
      return false;
    } finally {
      finishActiveRequest(activeRequest);
    }
  };

  const restoreFailedApproval = (
    activeRequest: ActiveConversationRequest,
    identity: CoworkerApprovalOperationIdentity,
    errorMessage: string
  ) => {
    const { token, turnId } = activeRequest;
    appendTextToTurn(
      token,
      turnId,
      `\n[审批请求失败，请重试]\n${errorMessage}`
    );
    setToolDecisionStatus(
      token,
      turnId,
      identity,
      "awaiting-approval"
    );
    setTurnStatus(token, turnId, "awaiting_approval");
    updateStatus(token, "awaiting_approval");
  };

  const finishActiveRequest = (activeRequest: ActiveConversationRequest) => {
    coordinator.finish(activeRequest.token);
    if (activeRequest.approvalIdentity) {
      coordinator.releaseApproval(activeRequest.approvalIdentity);
    }
    if (activeRequestRef.current === activeRequest) {
      activeRequestRef.current = null;
    }
  };

  const cancelActiveRequest = (activeRequest: ActiveConversationRequest) => {
    const wasCurrent = coordinator.isCurrent(activeRequest.token);
    activeRequest.abortController.abort();
    coordinator.finish(activeRequest.token);
    if (activeRequest.approvalIdentity) {
      coordinator.releaseApproval(activeRequest.approvalIdentity);
    }
    if (activeRequestRef.current === activeRequest) {
      activeRequestRef.current = null;
    }
    if (!wasCurrent) {
      return;
    }

    setTurns((current) =>
      current.map((turn) =>
        turn.id === activeRequest.turnId
          ? {
              ...turn,
              status: "cancelled",
              blocks: appendCoworkerConversationTextChunk(
                turn.blocks,
                "\n[已停止等待 Coworker 输出]",
                createLocalId
              )
            }
          : turn
      )
    );
    setStatus("cancelled");
  };

  const cancel = () => {
    const activeRequest = activeRequestRef.current;
    if (activeRequest) {
      cancelActiveRequest(activeRequest);
    }
  };

  return {
    /** 当前输入框内容。 */
    message,
    /** 当前串行会话轮次。 */
    turns,
    /** 当前会话运行状态。 */
    status,
    /** 当前是否不能再次发送消息。 */
    busy,
    /** 更新输入框内容。 */
    setMessage,
    /** 发送当前输入框内容。 */
    sendMessage,
    /** 处理待确认 tool call。 */
    resolveToolApproval,
    /** 显式停止当前输出，但不改变面板展开状态。 */
    cancel
  };
}

function createConversationTurn(userText: string): CoworkerConversationTurn {
  return {
    id: createLocalId(),
    userText,
    status: "receiving",
    blocks: []
  };
}

function createLocalId() {
  return Date.now() + "-" + Math.random().toString(36).slice(2);
}

function formatStreamError(error: CoworkerConversationStreamError) {
  return JSON.stringify(
    {
      code: error.code,
      message: error.message,
      raw: error.raw
    },
    null,
    2
  );
}

function formatUnknownError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getCoworkerServerUrl() {
  return (
    process.env.NEXT_PUBLIC_DRAWLESS_SERVER_URL ??
    process.env.NEXT_PUBLIC_DRAWLESS_SYNC_SERVER_URL
  );
}
