"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { DrawlessCanvasViewportContext } from "@drawless/shared";

import {
  createCoworkerConversationStream,
  createCoworkerConversationToolApprovalStream,
  readCoworkerConversationEventStream,
  type CoworkerConversationStreamError
} from "@/lib/coworker-conversation";
import {
  createCoworkerConversationOutput,
  type CoworkerConversationEventSummary,
  type CoworkerConversationToolApproval
} from "@/lib/coworker-conversation-output";
import {
  appendCoworkerConversationEventBlock,
  appendCoworkerConversationTextBlock,
  getCoworkerConversationPendingApproval,
  hasCoworkerConversationApproval,
  type CoworkerConversationTimelineBlock
} from "@/lib/coworker-conversation-timeline";

type ConversationTurn = {
  /** 本地渲染用 ID，不作为跨端消息事实源。 */
  id: string;
  /** 用户在这一轮发送的文本。 */
  userText: string;
  /** 当前 Mastra run ID；用于 approval 续流。 */
  runId: string | null;
  /** 这一轮回复的流式状态。 */
  status: ConversationStatus;
  /** coworker 回复按 SSE 到达顺序形成的串行内容块。 */
  blocks: CoworkerConversationTimelineBlock[];
};

type ConversationStatus = "idle" | "streaming" | "awaiting_approval" | "done" | "error";

export function CoworkerConversationWindow({
  roomId,
  getCanvasViewport
}: {
  roomId: string;
  getCanvasViewport?: () => DrawlessCanvasViewportContext | null;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [status, setStatus] = useState<ConversationStatus>("idle");
  const abortControllerRef = useRef<AbortController | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const body = bodyRef.current;
    if (body) {
      body.scrollTop = body.scrollHeight;
    }
  }, [turns]);

  const close = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setStatus((current) => (isConversationBusy(current) ? "idle" : current));
    setOpen(false);
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextMessage = message.trim();
    if (!nextMessage || isConversationBusy(status)) {
      return;
    }

    const turn = createConversationTurn(nextMessage);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setTurns((current) => [...current, turn]);
    setMessage("");
    setStatus("streaming");

    try {
      const result = await createCoworkerConversationStream({
        roomId,
        message: nextMessage,
        viewport: getCanvasViewport?.() ?? null,
        serverUrl: getCoworkerServerUrl(),
        signal: abortController.signal
      });

      if (!result.ok) {
        appendTextToTurn(turn.id, formatStreamError(result.error));
        setTurnStatus(turn.id, "error");
        setStatus("error");
        return;
      }

      const nextStatus = await readStreamIntoTurn(turn.id, result.stream);
      setTurnStatus(turn.id, nextStatus);
      setStatus(nextStatus);
    } catch (error) {
      if (abortController.signal.aborted) {
        appendTextToTurn(turn.id, "\n[stream aborted]");
        setTurnStatus(turn.id, "idle");
        setStatus("idle");
        return;
      }

      appendTextToTurn(
        turn.id,
        error instanceof Error ? error.message : String(error)
      );
      setTurnStatus(turn.id, "error");
      setStatus("error");
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    }
  };

  const resolveToolApproval = async (
    turn: ConversationTurn,
    approval: CoworkerConversationToolApproval,
    decision: "approve" | "decline"
  ) => {
    const runId = approval.runId ?? turn.runId;
    if (!runId) {
      appendTextToTurn(turn.id, "\n[missing runId for tool approval]");
      setTurnStatus(turn.id, "error");
      setStatus("error");
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setTurnStatus(turn.id, "streaming");
    setStatus("streaming");

    try {
      const result = await createCoworkerConversationToolApprovalStream({
        roomId,
        runId,
        toolCallId: approval.toolCallId,
        decision,
        serverUrl: getCoworkerServerUrl(),
        signal: abortController.signal
      });

      if (!result.ok) {
        appendTextToTurn(turn.id, formatStreamError(result.error));
        setTurnStatus(turn.id, "error");
        setStatus("error");
        return;
      }

      const nextStatus = await readStreamIntoTurn(turn.id, result.stream);
      setTurnStatus(turn.id, nextStatus);
      setStatus(nextStatus);
    } catch (error) {
      if (abortController.signal.aborted) {
        appendTextToTurn(turn.id, "\n[stream aborted]");
        setTurnStatus(turn.id, "idle");
        setStatus("idle");
        return;
      }

      appendTextToTurn(
        turn.id,
        error instanceof Error ? error.message : String(error)
      );
      setTurnStatus(turn.id, "error");
      setStatus("error");
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    }
  };

  const readStreamIntoTurn = async (
    turnId: string,
    stream: ReadableStream<Uint8Array>
  ): Promise<ConversationStatus> => {
    let streamFailed = false;
    let awaitingApproval = false;

    await readCoworkerConversationEventStream(stream, (event) => {
      const output = createCoworkerConversationOutput(event);
      if (output.event.runId) {
        setTurnRunId(turnId, output.event.runId);
      }
      if (output.kind === "text-delta" && output.text) {
        appendTextToTurn(turnId, output.text);
      } else {
        appendEventToTurn(turnId, output.event);
        if (output.event.type === "error") {
          streamFailed = true;
        }
        if (output.event.approval) {
          awaitingApproval = true;
        }
      }
    });

    if (streamFailed) {
      return "error";
    }
    if (awaitingApproval) {
      return "awaiting_approval";
    }
    return "done";
  };

  const appendTextToTurn = (turnId: string, chunk: string) => {
    setTurns((current) =>
      current.map((turn) =>
        turn.id === turnId
          ? {
              ...turn,
              blocks: appendCoworkerConversationTextBlock(
                turn.blocks,
                chunk,
                createLocalId
              )
            }
          : turn
      )
    );
  };

  const appendEventToTurn = (
    turnId: string,
    summary: CoworkerConversationEventSummary
  ) => {
    setTurns((current) =>
      current.map((turn) =>
        turn.id === turnId
          ? {
              ...turn,
              blocks: appendCoworkerConversationEventBlock(
                turn.blocks,
                summary,
                createLocalId
              )
            }
          : turn
      )
    );
  };

  const setTurnStatus = (turnId: string, nextStatus: ConversationStatus) => {
    setTurns((current) =>
      current.map((turn) =>
        turn.id === turnId ? { ...turn, status: nextStatus } : turn
      )
    );
  };

  const setTurnRunId = (turnId: string, runId: string) => {
    setTurns((current) =>
      current.map((turn) =>
        turn.id === turnId ? { ...turn, runId } : turn
      )
    );
  };

  if (!open) {
    return (
      <button
        className="coworker-conversation__toggle"
        type="button"
        onClick={() => setOpen(true)}
      >
        对话
      </button>
    );
  }

  return (
    <aside className="coworker-conversation" aria-label="Coworker conversation">
      <header className="coworker-conversation__header">
        <strong>conversation</strong>
        <span className="coworker-conversation__status">{status}</span>
        <button type="button" onClick={close}>
          关闭
        </button>
      </header>
      <div className="coworker-conversation__body" aria-live="polite" ref={bodyRef}>
        {turns.length === 0 ? (
          <pre className="coworker-conversation__empty">
            {JSON.stringify({ roomId, status: "ready" }, null, 2)}
          </pre>
        ) : (
          turns.map((turn) => {
            const pendingApproval = getPendingApproval(turn);
            return (
              <section
                className="coworker-conversation__turn"
                data-status={turn.status}
                key={turn.id}
              >
                <article className="coworker-conversation__message" data-role="user">
                  <strong>user</strong>
                  <pre>{turn.userText}</pre>
                </article>
                <div className="coworker-conversation__timeline">
                  {turn.blocks.length === 0 ? (
                    <article
                      className="coworker-conversation__message"
                      data-role="coworker"
                    >
                      <strong>coworker</strong>
                      <pre>{getCoworkerPlaceholder(turn.status)}</pre>
                    </article>
                  ) : (
                    turn.blocks.map((block) =>
                      block.kind === "text" ? (
                        <article
                          className="coworker-conversation__message"
                          data-role="coworker"
                          key={block.id}
                        >
                          <strong>coworker</strong>
                          <pre>{block.text}</pre>
                        </article>
                      ) : (
                        <section
                          className="coworker-conversation__event-block"
                          key={block.id}
                        >
                          <details className="coworker-conversation__events">
                            <summary>events {block.events.length}</summary>
                            <ol>
                              {block.events.map((event) => (
                                <li key={event.id}>
                                  <span>{event.summary.label}</span>
                                  <code>{event.summary.type}</code>
                                  {event.summary.detail ? (
                                    <small>{event.summary.detail}</small>
                                  ) : null}
                                  <pre>{formatRawStreamEvent(event.summary.raw)}</pre>
                                </li>
                              ))}
                            </ol>
                          </details>
                          {turn.status === "awaiting_approval" &&
                          pendingApproval &&
                          hasCoworkerConversationApproval(
                            block,
                            pendingApproval
                          ) ? (
                            <div className="coworker-conversation__approval-panel">
                              <strong>等待确认</strong>
                              <small>{pendingApproval.toolName ?? "tool call"}</small>
                              <div className="coworker-conversation__approval">
                                <button
                                  type="button"
                                  disabled={status === "streaming"}
                                  onClick={() =>
                                    resolveToolApproval(
                                      turn,
                                      pendingApproval,
                                      "approve"
                                    )
                                  }
                                >
                                  确认执行
                                </button>
                                <button
                                  type="button"
                                  disabled={status === "streaming"}
                                  onClick={() =>
                                    resolveToolApproval(
                                      turn,
                                      pendingApproval,
                                      "decline"
                                    )
                                  }
                                >
                                  拒绝
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </section>
                      )
                    )
                  )}
                </div>
              </section>
            );
          })
        )}
      </div>
      <form className="coworker-conversation__form" onSubmit={sendMessage}>
        <textarea
          aria-label="Conversation message"
          disabled={isConversationBusy(status)}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="输入要让 coworker 长回复的问题"
          rows={3}
          value={message}
        />
        <button type="submit" disabled={!message.trim() || isConversationBusy(status)}>
          {status === "streaming" ? "输出中" : "发送"}
        </button>
      </form>
    </aside>
  );
}

function createConversationTurn(userText: string): ConversationTurn {
  return {
    id: createLocalId(),
    userText,
    runId: null,
    status: "streaming",
    blocks: []
  };
}

function createLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

function formatRawStreamEvent(event: unknown) {
  return JSON.stringify(event, null, 2);
}

function getPendingApproval(
  turn: ConversationTurn
): CoworkerConversationToolApproval | null {
  return getCoworkerConversationPendingApproval(turn.blocks);
}

function getCoworkerPlaceholder(status: ConversationStatus) {
  if (status === "streaming") {
    return "[waiting for stream]";
  }
  if (status === "awaiting_approval") {
    return "[waiting for approval]";
  }
  if (status === "error") {
    return "[stream error]";
  }
  return "";
}

function getCoworkerServerUrl() {
  return (
    process.env.NEXT_PUBLIC_DRAWLESS_SERVER_URL ??
    process.env.NEXT_PUBLIC_DRAWLESS_SYNC_SERVER_URL
  );
}

function isConversationBusy(status: ConversationStatus) {
  return status === "streaming" || status === "awaiting_approval";
}
