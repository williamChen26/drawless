"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import {
  createCoworkerConversationStream,
  readCoworkerConversationEventStream,
  type CoworkerConversationStreamError
} from "@/lib/coworker-conversation";
import {
  createCoworkerConversationOutput,
  type CoworkerConversationEventSummary
} from "@/lib/coworker-conversation-output";

type ConversationTurn = {
  /** 本地渲染用 ID，不作为跨端消息事实源。 */
  id: string;
  /** 用户在这一轮发送的文本。 */
  userText: string;
  /** coworker 在这一轮内按 text-delta 增量拼接出的回复。 */
  coworkerText: string;
  /** 这一轮回复的流式状态。 */
  status: ConversationStatus;
  /** 非正文 event 形成的增量补充信息。 */
  events: ConversationEventEntry[];
};

type ConversationEventEntry = {
  /** 本地渲染用 ID，不作为跨端事件事实源。 */
  id: string;
  /** 当前 stream chunk 的展示摘要。 */
  summary: CoworkerConversationEventSummary;
};

type ConversationStatus = "idle" | "streaming" | "done" | "error";

export function CoworkerConversationWindow({ roomId }: { roomId: string }) {
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
    setStatus((current) => (current === "streaming" ? "idle" : current));
    setOpen(false);
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextMessage = message.trim();
    if (!nextMessage || status === "streaming") {
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
        serverUrl:
          process.env.NEXT_PUBLIC_DRAWLESS_SERVER_URL ??
          process.env.NEXT_PUBLIC_DRAWLESS_SYNC_SERVER_URL,
        signal: abortController.signal
      });

      if (!result.ok) {
        appendTextToTurn(turn.id, formatStreamError(result.error));
        setTurnStatus(turn.id, "error");
        setStatus("error");
        return;
      }

      let streamFailed = false;
      await readCoworkerConversationEventStream(result.stream, (event) => {
        const output = createCoworkerConversationOutput(event);
        if (output.kind === "text-delta" && output.text) {
          appendTextToTurn(turn.id, output.text);
        } else {
          appendEventToTurn(turn.id, output.event);
          if (output.event.type === "error") {
            streamFailed = true;
          }
        }
      });
      setTurnStatus(turn.id, streamFailed ? "error" : "done");
      setStatus(streamFailed ? "error" : "done");
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

  const appendTextToTurn = (turnId: string, chunk: string) => {
    setTurns((current) =>
      current.map((turn) =>
        turn.id === turnId
          ? { ...turn, coworkerText: `${turn.coworkerText}${chunk}` }
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
              events: [...turn.events, { id: createLocalId(), summary }]
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
          turns.map((turn) => (
            <section
              className="coworker-conversation__turn"
              data-status={turn.status}
              key={turn.id}
            >
              <article className="coworker-conversation__message" data-role="user">
                <strong>user</strong>
                <pre>{turn.userText}</pre>
              </article>
              <article className="coworker-conversation__message" data-role="coworker">
                <strong>coworker</strong>
                <pre>
                  {turn.coworkerText || getCoworkerPlaceholder(turn.status)}
                </pre>
              </article>
              {turn.events.length > 0 ? (
                <details className="coworker-conversation__events">
                  <summary>events {turn.events.length}</summary>
                  <ol>
                    {turn.events.map((event) => (
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
              ) : null}
            </section>
          ))
        )}
      </div>
      <form className="coworker-conversation__form" onSubmit={sendMessage}>
        <textarea
          aria-label="Conversation message"
          disabled={status === "streaming"}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="输入要让 coworker 长回复的问题"
          rows={3}
          value={message}
        />
        <button type="submit" disabled={!message.trim() || status === "streaming"}>
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
    coworkerText: "",
    status: "streaming",
    events: []
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

function getCoworkerPlaceholder(status: ConversationStatus) {
  if (status === "streaming") {
    return "[waiting for stream]";
  }
  if (status === "error") {
    return "[stream error]";
  }
  return "";
}
