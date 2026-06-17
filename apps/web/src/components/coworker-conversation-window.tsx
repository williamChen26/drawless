"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import {
  createCoworkerConversationStream,
  type CoworkerConversationStreamError
} from "@/lib/coworker-conversation";

type ConversationEntry = {
  /** 本地渲染用 ID，不作为跨端消息事实源。 */
  id: string;
  /** 消息来源，用于区分用户输入和 coworker 输出。 */
  role: "user" | "coworker" | "system";
  /** 直接展示的原始文本内容。 */
  content: string;
};

type ConversationStatus = "idle" | "streaming" | "done" | "error";

export function CoworkerConversationWindow({ roomId }: { roomId: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [entries, setEntries] = useState<ConversationEntry[]>([]);
  const [status, setStatus] = useState<ConversationStatus>("idle");
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

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

    const userEntry = createConversationEntry("user", nextMessage);
    const coworkerEntry = createConversationEntry("coworker", "");
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setEntries((current) => [...current, userEntry, coworkerEntry]);
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
        appendToEntry(coworkerEntry.id, formatStreamError(result.error));
        setStatus("error");
        return;
      }

      await readTextStream(result.stream, (chunk) => {
        appendToEntry(coworkerEntry.id, chunk);
      });
      setStatus("done");
    } catch (error) {
      if (abortController.signal.aborted) {
        appendToEntry(coworkerEntry.id, "\n[stream aborted]");
        setStatus("idle");
        return;
      }

      appendToEntry(
        coworkerEntry.id,
        error instanceof Error ? error.message : String(error)
      );
      setStatus("error");
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    }
  };

  const appendToEntry = (entryId: string, chunk: string) => {
    setEntries((current) =>
      current.map((entry) =>
        entry.id === entryId
          ? { ...entry, content: `${entry.content}${chunk}` }
          : entry
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
        <strong>conversation chat</strong>
        <button type="button" onClick={close}>
          关闭
        </button>
      </header>
      <div className="coworker-conversation__body" aria-live="polite">
        {entries.length === 0 ? (
          <pre className="coworker-conversation__empty">
            {JSON.stringify({ roomId, status: "ready" }, null, 2)}
          </pre>
        ) : (
          entries.map((entry) => (
            <section
              className="coworker-conversation__entry"
              data-role={entry.role}
              key={entry.id}
            >
              <strong>{entry.role}</strong>
              <pre>{entry.content}</pre>
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

function createConversationEntry(
  role: ConversationEntry["role"],
  content: string
): ConversationEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content
  };
}

async function readTextStream(
  stream: ReadableStream<Uint8Array>,
  onChunk: (chunk: string) => void
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      onChunk(decoder.decode(value, { stream: true }));
    }
  }

  const remaining = decoder.decode();
  if (remaining) {
    onChunk(remaining);
  }
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
