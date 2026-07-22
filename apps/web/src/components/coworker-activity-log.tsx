"use client";

import React, { useEffect, useRef } from "react";
import { Button } from "@drawless/ui";

import type { CoworkerConversationTimelineBlock } from "../lib/coworker-conversation-timeline";
import { normalizeCoworkerExpression } from "../lib/coworker-presence-content";
import type { CoworkerConversationTurn } from "../lib/use-coworker-conversation";

export type CoworkerActivityLogProps = {
  /** 协作往来容器 DOM ID。 */
  id: string;
  /** 当前房间内的本地协作轮次。 */
  turns: CoworkerConversationTurn[];
  /** 收起协作往来但不影响正在进行的工作。 */
  onClose: () => void;
};

/**
 * 展示当前 room 中的沟通和工作事件；技术细节只在非生产环境提供。
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
      aria-label="与 Coworker 的协作往来"
      className="coworker-activity-log"
      id={id}
      ref={logRef}
      tabIndex={-1}
    >
      <header className="coworker-activity-log__header">
        <div>
          <strong>协作往来</strong>
          <span>我们在这个 Room 里说过的话和推进的工作</span>
        </div>
        <Button onClick={onClose} size="sm" type="button" variant="ghost">
          收起
        </Button>
      </header>

      {turns.length === 0 ? (
        <p className="coworker-activity-log__empty">
          这里还没有留下协作往来。
        </p>
      ) : (
        <ol className="coworker-activity-log__turns">
          {turns.map((turn) => (
            <li
              className="coworker-activity-log__turn"
              data-status={turn.status}
              key={turn.id}
            >
              <header>
                <strong>{getTurnHeading(turn.status)}</strong>
                <span>{formatTurnStatus(turn.status)}</span>
              </header>
              {turn.userText ? (
                <blockquote>
                  <span>你</span>
                  <p>{turn.userText}</p>
                </blockquote>
              ) : null}
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
        <span>Coworker</span>
        <p>{normalizeCoworkerExpression(block.text)}</p>
      </article>
    );
  }

  if (block.kind === "tool") {
    const args = formatValue(block.argsText || block.args);
    const showTechnicalDetails = process.env.NODE_ENV !== "production";
    return (
      <section
        className="coworker-activity-log__tool"
        data-status={block.status}
      >
        <header>
          <strong>{formatToolName(block.toolName)}</strong>
          <span>{formatToolStatus(block.status)}</span>
        </header>
        {showTechnicalDetails && args ? (
          <details>
            <summary>查看工作计划</summary>
            <pre>{args}</pre>
          </details>
        ) : null}
        {showTechnicalDetails && block.result !== null ? (
          <details>
            <summary>查看执行结果</summary>
            <pre>{formatValue(block.result)}</pre>
          </details>
        ) : null}
      </section>
    );
  }

  if (process.env.NODE_ENV === "production") {
    return null;
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

function getTurnHeading(status: CoworkerConversationTurn["status"]) {
  if (status === "awaiting_approval") {
    return "Coworker 提交了工作计划";
  }
  if (status === "streaming" || status === "receiving") {
    return "我们正在推进这件事";
  }
  if (status === "done") {
    return "这段协作已经完成";
  }
  if (status === "error") {
    return "这段协作遇到了问题";
  }
  return "这段协作先停在这里";
}

function formatToolName(toolName: string | null) {
  if (toolName === "collect-canvas-context") {
    return "Coworker 查看了当前画布";
  }
  if (toolName === "edit-canvas") {
    return "Coworker 准备修改画布";
  }
  return "Coworker 准备继续工作";
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
