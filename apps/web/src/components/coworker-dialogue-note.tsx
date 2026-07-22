"use client";

import React from "react";
import { DRAWLESS_COWORKER_DISPLAY_NAME } from "@drawless/shared";

import { normalizeCoworkerExpression } from "../lib/coworker-presence-content";
import type { CoworkerPresencePhase } from "../lib/coworker-presence-state";

type CoworkerDialoguePhase = Extract<
  CoworkerPresencePhase,
  "speaking" | "completed" | "interrupted" | "error"
>;

export function CoworkerDialogueNote({
  phase,
  text
}: {
  /** 当前回应所处的阶段。 */
  phase: CoworkerDialoguePhase;
  /** Coworker 当前或最近一次自然语言回应。 */
  text: string;
}) {
  const displayText = normalizeCoworkerExpression(text);
  const normalizedText = displayText.replace(/\s+/g, " ").trim();
  const preview = createDialoguePreview(normalizedText);
  const expandable = normalizedText.length > preview.length;

  return (
    <article
      aria-label={getDialogueLabel(phase)}
      className="coworker-dialogue-note"
      data-phase={phase}
    >
      <span aria-hidden="true" className="coworker-dialogue-note__tail" />
      <header>
        <span>{getDialogueEyebrow(phase)}</span>
      </header>
      <p>{preview || "我正在组织一下怎么和你说。"}</p>
      {expandable ? (
        <details>
          <summary>
            <span className="coworker-dialogue-note__read-more">阅读全文</span>
            <span className="coworker-dialogue-note__read-less">收起全文</span>
          </summary>
          <div>{displayText}</div>
        </details>
      ) : null}
    </article>
  );
}

function getDialogueEyebrow(phase: CoworkerDialoguePhase) {
  if (phase === "speaking") {
    return "正在写给你";
  }
  if (phase === "error") {
    return "刚刚没有说完";
  }
  if (phase === "interrupted") {
    return "先停在这里";
  }
  return DRAWLESS_COWORKER_DISPLAY_NAME;
}

function getDialogueLabel(phase: CoworkerDialoguePhase) {
  if (phase === "speaking") {
    return `${DRAWLESS_COWORKER_DISPLAY_NAME} 正在回应`;
  }
  if (phase === "error") {
    return `${DRAWLESS_COWORKER_DISPLAY_NAME} 的回应遇到问题`;
  }
  if (phase === "interrupted") {
    return `${DRAWLESS_COWORKER_DISPLAY_NAME} 已停止当前回应`;
  }
  return `${DRAWLESS_COWORKER_DISPLAY_NAME} 的回应`;
}

function createDialoguePreview(text: string, maxLength = 220) {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}
