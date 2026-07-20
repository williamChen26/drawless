"use client";

import { useEffect, useRef, useState } from "react";
import type { DrawlessCanvasViewportContext } from "@drawless/shared";

import {
  createCoworkerConversationStream,
  createCoworkerConversationToolApprovalStream,
  readCoworkerConversationEventStream,
  type CoworkerConversationStreamError
} from "./coworker-conversation";
import {
  createCoworkerConversationOutput,
  type CoworkerConversationToolApproval
} from "./coworker-conversation-output";
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
  type CoworkerConversationTimelineBlock
} from "./coworker-conversation-timeline";

export type CoworkerConversationTurn = {
  /** 本地渲染用 ID，不作为跨端消息事实源。 */
  id: string;
  /** 用户在这一轮发送的文本。 */
  userText: string;
  /** 当前 Mastra run ID；用于 approval 续流。 */
  runId: string | null;
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

  if (!coordinatorRef.current) {
    coordinatorRef.current =
      createCoworkerConversationOperationCoordinator(input.roomId);
  }
  const coordinator = coordinatorRef.current;
  const busy = isConversationBusy(status);

  useEffect(() => {
    coordinator.enterRoom(input.roomId);
    setMessage("");
    setTurns([]);
    setStatus("idle");

    return () => {
      const activeRequest = activeRequestRef.current;
      if (!activeRequest || activeRequest.token.roomId !== input.roomId) {
        return;
      }

      activeRequest.abortController.abort();
      coordinator.finish(activeRequest.token);
      if (activeRequest.approvalIdentity) {
        coordinator.releaseApproval(activeRequest.approvalIdentity);
      }
      activeRequestRef.current = null;
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

  const setTurnRunId = (
    token: CoworkerConversationOperationToken,
    turnId: string,
    runId: string
  ) => {
    updateTurns(token, (current) =>
      current.map((turn) =>
        turn.id === turnId ? { ...turn, runId } : turn
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
            const approvalRunId =
              block.kind === "tool"
                ? (block.approval?.runId ?? turn.runId)
                : null;
            if (
              block.kind !== "tool" ||
              block.toolCallId !== identity.toolCallId ||
              approvalRunId !== identity.runId
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
      if (output.event.runId) {
        setTurnRunId(token, turnId, output.event.runId);
      }
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
    approval: CoworkerConversationToolApproval,
    decision: "approve" | "decline"
  ) => {
    const runId = approval.runId ?? turn.runId;
    if (!runId) {
      setTurns((current) =>
        current.map((currentTurn) =>
          currentTurn.id === turn.id
            ? {
                ...currentTurn,
                status: "error",
                blocks: appendCoworkerConversationTextChunk(
                  currentTurn.blocks,
                  "\n[缺少 tool approval runId]",
                  createLocalId
                )
              }
            : currentTurn
        )
      );
      setStatus("error");
      return;
    }

    const identity = {
      roomId: input.roomId,
      runId,
      toolCallId: approval.toolCallId
    };
    if (!coordinator.acquireApproval(identity)) {
      return;
    }

    const token = coordinator.start(input.roomId);
    if (!token) {
      coordinator.releaseApproval(identity);
      return;
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
      const result = await createCoworkerConversationToolApprovalStream({
        roomId: identity.roomId,
        runId: identity.runId,
        toolCallId: identity.toolCallId,
        decision,
        serverUrl: getCoworkerServerUrl(),
        signal: abortController.signal
      });

      if (!coordinator.isCurrent(token)) {
        return;
      }
      if (!result.ok) {
        restoreFailedApproval(
          activeRequest,
          identity,
          formatStreamError(result.error)
        );
        return;
      }

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

      restoreFailedApproval(
        activeRequest,
        identity,
        formatUnknownError(error)
      );
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
    runId: null,
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
