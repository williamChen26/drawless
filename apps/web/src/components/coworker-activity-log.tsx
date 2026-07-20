"use client";

import React, { useEffect, useRef } from "react";
import { Button } from "@drawless/ui";

import type { CoworkerConversationTimelineBlock } from "../lib/coworker-conversation-timeline";
import type { CoworkerConversationTurn } from "../lib/use-coworker-conversation";

export type CoworkerActivityLogProps = {
  /** 工作记录容器 DOM ID。 */
  id: string;
  /** 当前房间内的本地会话轮次。 */
  turns: CoworkerConversationTurn[];
  /** 关闭工作记录但不影响正在执行的任务。 */
  onClose: () => void;
};

/**
 * 后台工作记录保留完整流式结果和工具事件，但不承担主要交流体验。
 */
export function CoworkerActivityLog({
  id,
  turns,
  onClose
}: CoworkerActivityLogProps) {
  const logRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    logRef.current?.focus();
  }, []);

  return (
    <aside
      aria-label="Coworker 工作记录"
      className="coworker-activity-log"
      id={id}
      ref={logRef}
      tabIndex={-1}
    >
      <header className="coworker-activity-log__header">
        <div>
          <strong>工作记录</strong>
          <span>对话、工具与结果的完整记录</span>
        </div>
        <Button onClick={onClose} size="sm" type="button" variant="ghost">
          收起记录
        </Button>
      </header>

      {turns.length === 0 ? (
        <p className="coworker-activity-log__empty">还没有工作记录。</p>
      ) : (
        <ol className="coworker-activity-log__turns">
          {turns.map((turn, index) => (
            <li
              className="coworker-activity-log__turn"
              data-status={turn.status}
              key={turn.id}
            >
              <header>
                <strong>第 {index + 1} 次协作</strong>
                <span>{formatTurnStatus(turn.status)}</span>
              </header>
              <blockquote>{turn.userText}</blockquote>
              <div className="coworker-activity-log__blocks">
                {turn.blocks.map((block) => (
                  <ActivityBlock block={block} key={block.id} />
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

function ActivityBlock({ block }: { block: CoworkerConversationTimelineBlock }) {
  if (block.kind === "text") {
    return (
      <article className="coworker-activity-log__text" data-status={block.status}>
        <p>{block.text}</p>
      </article>
    );
  }

  if (block.kind === "tool") {
    const args = formatValue(block.argsText || block.args);
    return (
      <section
        className="coworker-activity-log__tool"
        data-status={block.status}
      >
        <header>
          <strong>{block.toolName ?? "工具调用"}</strong>
          <span>{formatToolStatus(block.status)}</span>
        </header>
        {args ? (
          <details>
            <summary>查看工作计划</summary>
            <pre>{args}</pre>
          </details>
        ) : null}
        {block.result !== null ? (
          <details>
            <summary>查看执行结果</summary>
            <pre>{formatValue(block.result)}</pre>
          </details>
        ) : null}
      </section>
    );
  }

  return (
    <details className="coworker-activity-log__debug">
      <summary>技术事件 · {block.events.length}</summary>
      <ol>
        {block.events.map((event) => (
          <li key={event.id}>
            <strong>{event.summary.label}</strong>
            <code>{event.summary.type}</code>
            {event.summary.detail ? <span>{event.summary.detail}</span> : null}
          </li>
        ))}
      </ol>
    </details>
  );
}

function formatTurnStatus(status: CoworkerConversationTurn["status"]) {
  if (status === "streaming") {
    return "进行中";
  }
  if (status === "awaiting_approval") {
    return "等待确认";
  }
  if (status === "done") {
    return "已完成";
  }
  if (status === "error") {
    return "未完成";
  }
  return "已停止";
}

function formatToolStatus(
  status: Extract<CoworkerConversationTimelineBlock, { kind: "tool" }>["status"]
) {
  if (status === "input-streaming") {
    return "正在准备";
  }
  if (status === "input-ready") {
    return "准备完成";
  }
  if (status === "awaiting-approval") {
    return "等待确认";
  }
  if (status === "running") {
    return "正在执行";
  }
  if (status === "done") {
    return "已完成";
  }
  if (status === "declined") {
    return "未执行";
  }
  return "执行失败";
}

function formatValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
