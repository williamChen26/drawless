"use client";

import React, { useEffect, useRef } from "react";
import { DRAWLESS_COWORKER_DISPLAY_NAME } from "@drawless/shared";
import { Button, LiquidGlassSurface } from "@drawless/ui";

import type { CoworkerConversationTimelineBlock } from "../lib/coworker-conversation-timeline";
import { normalizeCoworkerExpression } from "../lib/coworker-presence-content";
import type { CoworkerConversationTurn } from "../lib/use-coworker-conversation";

const SHOW_DEBUG_UI = process.env.NEXT_PUBLIC_DRAWLESS_DEBUG_UI === "true";

export type CoworkerActivityLogProps = {
  /** 协作往来容器 DOM ID。 */
  id: string;
  /** 协作往来是否已经展开。 */
  open?: boolean;
  /** 当前房间内的本地协作轮次。 */
  turns: CoworkerConversationTurn[];
  /** 收起协作往来但不影响正在进行的工作。 */
  onClose: () => void;
};

/**
 * 展示当前 room 中的沟通和工作事件；技术细节只在显式 debug 模式提供。
 */
export function CoworkerActivityLog({
  id,
  open = true,
  turns,
  onClose
}: CoworkerActivityLogProps) {
  const logRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      logRef.current?.focus();
    }
  }, [open]);

  return (
    <div
      aria-hidden={!open}
      className="coworker-activity-layer"
      data-open={open}
      inert={!open}
    >
      <button
        aria-label="收起协作往来"
        className="coworker-activity-layer__scrim"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <aside
        aria-label={`与 ${DRAWLESS_COWORKER_DISPLAY_NAME} 的协作往来`}
        className="coworker-activity-log"
        id={id}
        ref={logRef}
        tabIndex={-1}
      >
        <LiquidGlassSurface asChild variant="panel">
          <header className="coworker-activity-log__header">
            <div>
              <strong>协作往来</strong>
              <span>这个房间里的对话和工作记录</span>
            </div>
            <LiquidGlassSurface asChild variant="control">
              <Button
                aria-label="收起协作往来"
                className="coworker-activity-log__close"
                onClick={onClose}
                size="sm"
                type="button"
                variant="ghost"
              >
                收起
              </Button>
            </LiquidGlassSurface>
          </header>
        </LiquidGlassSurface>

        {turns.length === 0 ? (
          <LiquidGlassSurface asChild tone="quiet">
            <p className="coworker-activity-log__empty">
              还没有记录。找 Drew 聊聊或交代工作后，这里会留下往来。
            </p>
          </LiquidGlassSurface>
        ) : (
          <ol className="coworker-activity-log__turns">
            {turns.map((turn) => (
              <li
                className="coworker-activity-log__turn"
                data-status={turn.status}
                key={turn.id}
              >
                <header className="coworker-activity-log__turn-status">
                  <strong>{getTurnHeading(turn.status)}</strong>
                  <span>{formatTurnStatus(turn.status)}</span>
                </header>
                {turn.userText ? (
                  <LiquidGlassSurface asChild tone="accent">
                    <blockquote className="coworker-activity-log__message coworker-activity-log__message--user">
                      <span>你</span>
                      <p>{turn.userText}</p>
                    </blockquote>
                  </LiquidGlassSurface>
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
    </div>
  );
}

function ActivityBlock({ block }: { block: CoworkerConversationTimelineBlock }) {
  if (block.kind === "text") {
    return (
      <LiquidGlassSurface asChild>
        <article
          className="coworker-activity-log__message coworker-activity-log__message--drew coworker-activity-log__text"
          data-status={block.status}
        >
          <span>{DRAWLESS_COWORKER_DISPLAY_NAME}</span>
          <p>{normalizeCoworkerExpression(block.text)}</p>
        </article>
      </LiquidGlassSurface>
    );
  }

  if (block.kind === "tool") {
    const args = formatValue(block.argsText || block.args);
    return (
      <LiquidGlassSurface asChild tone="quiet">
        <section
          className="coworker-activity-log__message coworker-activity-log__message--tool coworker-activity-log__tool"
          data-status={block.status}
        >
          <header>
            <strong>{formatToolName(block.toolName)}</strong>
            <span>{formatToolStatus(block.status)}</span>
          </header>
          {SHOW_DEBUG_UI && args ? (
            <details>
              <summary>查看工作计划</summary>
              <pre>{args}</pre>
            </details>
          ) : null}
          {SHOW_DEBUG_UI && block.result !== null ? (
            <details>
              <summary>查看执行结果</summary>
              <pre>{formatValue(block.result)}</pre>
            </details>
          ) : null}
        </section>
      </LiquidGlassSurface>
    );
  }

  if (!SHOW_DEBUG_UI) {
    return null;
  }

  return (
    <LiquidGlassSurface asChild tone="quiet">
      <details className="coworker-activity-log__message coworker-activity-log__message--debug coworker-activity-log__debug">
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
    </LiquidGlassSurface>
  );
}

function getTurnHeading(status: CoworkerConversationTurn["status"]) {
  if (status === "awaiting_approval") {
    return `${DRAWLESS_COWORKER_DISPLAY_NAME} 提交了工作计划`;
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
    return `${DRAWLESS_COWORKER_DISPLAY_NAME} 查看了当前画布`;
  }
  if (toolName === "edit-canvas") {
    return `${DRAWLESS_COWORKER_DISPLAY_NAME} 准备修改画布`;
  }
  return `${DRAWLESS_COWORKER_DISPLAY_NAME} 准备继续工作`;
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
  if (status === "resolved") {
    return "决定已提交";
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
