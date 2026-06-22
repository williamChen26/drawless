"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { DrawlessCanvasViewportContext } from "@drawless/shared";
import { Button, Textarea } from "@drawless/ui";

import {
  createCoworkerConversationStream,
  createCoworkerConversationToolApprovalStream,
  readCoworkerConversationEventStream,
  type CoworkerConversationStreamError
} from "@/lib/coworker-conversation";
import {
  createCoworkerConversationOutput,
  type CoworkerConversationToolApproval
} from "@/lib/coworker-conversation-output";
import {
  appendCoworkerConversationOutputBlock,
  appendCoworkerConversationTextChunk,
  getCoworkerConversationPendingApproval,
  hasCoworkerConversationApproval,
  setCoworkerConversationToolStatus,
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
  const busy = isConversationBusy(status);

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
    if (!nextMessage || busy) {
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
    setToolDecisionStatus(turn.id, approval, decision);
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
      appendOutputToTurn(turnId, output);
      if (output.event.type === "error") {
        streamFailed = true;
      }
      if (output.event.approval) {
        awaitingApproval = true;
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
              blocks: appendCoworkerConversationTextChunk(turn.blocks, chunk, createLocalId)
            }
          : turn
      )
    );
  };

  const appendOutputToTurn = (
    turnId: string,
    output: ReturnType<typeof createCoworkerConversationOutput>
  ) => {
    setTurns((current) =>
      current.map((turn) =>
        turn.id === turnId
          ? {
              ...turn,
              blocks: appendCoworkerConversationOutputBlock(turn.blocks, output, createLocalId)
            }
          : turn
      )
    );
  };

  const setToolDecisionStatus = (
    turnId: string,
    approval: CoworkerConversationToolApproval,
    decision: "approve" | "decline"
  ) => {
    setTurns((current) =>
      current.map((turn) =>
        turn.id === turnId
          ? {
              ...turn,
              blocks: setCoworkerConversationToolStatus(
                turn.blocks,
                approval,
                decision === "approve" ? "running" : "declined"
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
      <Button
        className="coworker-conversation__toggle"
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
      >
        对话
      </Button>
    );
  }

  return (
    <aside className="coworker-conversation" aria-label="Coworker conversation">
      <header className="coworker-conversation__header">
        <strong>对话</strong>
        <span className="coworker-conversation__status">
          {formatConversationStatus(status)}
        </span>
        <Button size="sm" type="button" variant="ghost" onClick={close}>
          关闭
        </Button>
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
                    turn.blocks.map((block) => (
                      <ConversationTimelineBlockView
                        block={block}
                        conversationStatus={status}
                        key={block.id}
                        onResolveApproval={(approval, decision) =>
                          resolveToolApproval(turn, approval, decision)
                        }
                        pendingApproval={pendingApproval}
                        turnStatus={turn.status}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })
        )}
      </div>
      <form className="coworker-conversation__form" onSubmit={sendMessage}>
        <Textarea
          aria-label="Conversation message"
          className="coworker-conversation__input"
          disabled={busy}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="描述要让 coworker 完成的任务"
          rows={3}
          value={message}
        />
        <Button
          className="coworker-conversation__submit"
          type="submit"
          disabled={!message.trim() || busy}
        >
          {status === "streaming" ? "输出中" : "发送"}
        </Button>
      </form>
    </aside>
  );
}

function ConversationTimelineBlockView({
  block,
  conversationStatus,
  onResolveApproval,
  pendingApproval,
  turnStatus
}: {
  block: CoworkerConversationTimelineBlock;
  conversationStatus: ConversationStatus;
  onResolveApproval: (
    approval: CoworkerConversationToolApproval,
    decision: "approve" | "decline"
  ) => void;
  pendingApproval: CoworkerConversationToolApproval | null;
  turnStatus: ConversationStatus;
}) {
  if (block.kind === "text") {
    return (
      <article className="coworker-conversation__message" data-role="coworker">
        <strong>coworker</strong>
        <pre>{block.text}</pre>
      </article>
    );
  }

  if (block.kind === "tool") {
    return (
      <ConversationToolBlockView
        block={block}
        conversationStatus={conversationStatus}
        onResolveApproval={onResolveApproval}
        pendingApproval={pendingApproval}
        turnStatus={turnStatus}
      />
    );
  }

  return <ConversationDebugBlockView block={block} />;
}

function ConversationToolBlockView({
  block,
  conversationStatus,
  onResolveApproval,
  pendingApproval,
  turnStatus
}: {
  block: Extract<CoworkerConversationTimelineBlock, { kind: "tool" }>;
  conversationStatus: ConversationStatus;
  onResolveApproval: (
    approval: CoworkerConversationToolApproval,
    decision: "approve" | "decline"
  ) => void;
  pendingApproval: CoworkerConversationToolApproval | null;
  turnStatus: ConversationStatus;
}) {
  const toolArgs = formatToolArgs(block.argsText, block.args);
  const shouldShowApproval =
    turnStatus === "awaiting_approval" &&
    pendingApproval &&
    hasCoworkerConversationApproval(block, pendingApproval);

  return (
    <section
      className="coworker-conversation__tool-block"
      data-status={block.status}
    >
      <header className="coworker-conversation__tool-header">
        <strong>{block.toolName ?? "tool call"}</strong>
        <code>{formatToolStatus(block.status)}</code>
      </header>
      <small>{block.toolCallId}</small>
      {toolArgs ? (
        <pre className="coworker-conversation__tool-payload">{toolArgs}</pre>
      ) : null}
      {block.result !== null ? (
        <details className="coworker-conversation__events">
          <summary>result</summary>
          <pre>{formatRawStreamEvent(block.result)}</pre>
        </details>
      ) : null}
      {shouldShowApproval && pendingApproval ? (
        <div className="coworker-conversation__approval-panel">
          <strong>等待确认</strong>
          <small>{pendingApproval.toolName ?? "tool call"}</small>
          <div className="coworker-conversation__approval">
            <Button
              type="button"
              disabled={conversationStatus === "streaming"}
              onClick={() => onResolveApproval(pendingApproval, "approve")}
            >
              确认执行
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={conversationStatus === "streaming"}
              onClick={() => onResolveApproval(pendingApproval, "decline")}
            >
              拒绝
            </Button>
          </div>
        </div>
      ) : null}
      <details className="coworker-conversation__events">
        <summary>raw events {block.events.length}</summary>
        <ConversationEventList events={block.events} />
      </details>
    </section>
  );
}

function ConversationDebugBlockView({
  block
}: {
  block: Extract<CoworkerConversationTimelineBlock, { kind: "debug" }>;
}) {
  return (
    <section className="coworker-conversation__event-block">
      <details className="coworker-conversation__events">
        <summary>debug events {block.events.length}</summary>
        <ConversationEventList events={block.events} />
      </details>
    </section>
  );
}

function ConversationEventList({
  events
}: {
  events: Extract<CoworkerConversationTimelineBlock, { kind: "debug" }>["events"];
}) {
  return (
    <ol>
      {events.map((event) => (
        <li key={event.id}>
          <span>{event.summary.label}</span>
          <code>{event.summary.type}</code>
          {event.summary.detail ? <small>{event.summary.detail}</small> : null}
          <pre>{formatRawStreamEvent(event.summary.raw)}</pre>
        </li>
      ))}
    </ol>
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

function formatToolArgs(argsText: string, args: unknown) {
  if (argsText.trim()) {
    return argsText;
  }
  if (args === null) {
    return "";
  }
  return JSON.stringify(args, null, 2);
}

function formatToolStatus(status: string) {
  if (status === "input-streaming") {
    return "参数生成中";
  }
  if (status === "input-ready") {
    return "待调用";
  }
  if (status === "awaiting-approval") {
    return "等待确认";
  }
  if (status === "running") {
    return "执行中";
  }
  if (status === "done") {
    return "已完成";
  }
  if (status === "declined") {
    return "已拒绝";
  }
  return "错误";
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

function formatConversationStatus(status: ConversationStatus) {
  if (status === "streaming") {
    return "输出中";
  }
  if (status === "awaiting_approval") {
    return "待确认";
  }
  if (status === "done") {
    return "已完成";
  }
  if (status === "error") {
    return "错误";
  }
  return "就绪";
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
