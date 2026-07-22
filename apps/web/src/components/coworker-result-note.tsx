"use client";

import React from "react";
import { Button } from "@drawless/ui";

import styles from "./coworker-result-note.module.css";

export type CoworkerResultNotePhase =
  | "speaking"
  | "completed"
  | "interrupted"
  | "error";

export type CoworkerResultNoteProps = {
  /** Coworker 当前交付结果的阶段。 */
  phase: CoworkerResultNotePhase;
  /** 按语义段落拆分的正文；流式输出时可以逐步追加。 */
  paragraphs: string[];
  /** 完成后的简短工作回执。 */
  completionSummary?: string | null;
  /** 可以在画布中定位的真实 record ID。 */
  recordIds?: string[];
  /** 用户请求在画布中定位交付结果。 */
  onLocateResult?: ((recordIds: string[]) => void) | undefined;
  /** 用户希望基于当前交付继续反馈。 */
  onRequestChanges?: (() => void) | undefined;
  /** 工作便笺标题。 */
  title?: string;
  /** 展示在边栏的便笺编号。 */
  noteNumber?: string;
};

const phaseCopy: Record<
  CoworkerResultNotePhase,
  { eyebrow: string; liveLabel: string }
> = {
  speaking: {
    eyebrow: "正在写给你",
    liveLabel: "Coworker 正在说明工作结果"
  },
  completed: {
    eyebrow: "交付给你",
    liveLabel: "Coworker 已完成工作"
  },
  interrupted: {
    eyebrow: "先停在这里",
    liveLabel: "Coworker 已停止本次工作"
  },
  error: {
    eyebrow: "交付异常",
    liveLabel: "Coworker 本次工作遇到问题"
  }
};

/**
 * Coworker 递回的编辑部工作便笺。
 *
 * 组件只呈现调用方传入的会话派生结果，不持有画布数据或第二份任务状态。
 */
export function CoworkerResultNote({
  phase,
  paragraphs,
  completionSummary = null,
  recordIds = [],
  onLocateResult,
  onRequestChanges,
  title = "给你的工作说明",
  noteNumber
}: CoworkerResultNoteProps) {
  const copy = phaseCopy[phase];
  const visibleParagraphs = paragraphs.filter(
    (paragraph) => paragraph.trim().length > 0
  );
  const locatableRecordIds = Array.from(
    new Set(recordIds.map((recordId) => recordId.trim()).filter(Boolean))
  );
  const canLocate = locatableRecordIds.length > 0 && Boolean(onLocateResult);
  const showReceipt = phase === "completed" && Boolean(completionSummary);

  return (
    <article
      aria-label={copy.liveLabel}
      className={styles.note}
      data-phase={phase}
    >
      <span aria-hidden="true" className={styles.clip} />

      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>
            <span aria-hidden="true" className={styles.statusMark} />
            {copy.eyebrow}
          </p>
          <h2 className={styles.title}>{title}</h2>
        </div>
        {noteNumber ? (
          <p aria-label={`工作便笺编号 ${noteNumber}`} className={styles.folio}>
            <span>工作便笺</span>
            <strong>{noteNumber.padStart(2, "0")}</strong>
          </p>
        ) : null}
      </header>

      <div
        aria-label="Coworker 工作说明正文"
        aria-live="off"
        className={styles.copy}
        tabIndex={0}
      >
        {visibleParagraphs.length > 0 ? (
          visibleParagraphs.map((paragraph, index) => (
            <div className={styles.paragraphRow} key={`paragraph-${index}`}>
              <span aria-hidden="true" className={styles.lineNumber}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <p>{paragraph}</p>
            </div>
          ))
        ) : (
          <p className={styles.emptyCopy}>
            {phase === "speaking"
              ? "我正在把结果整理成清楚的说明。"
              : "这次没有留下可展示的正文。"}
          </p>
        )}
        {phase === "speaking" ? (
          <span aria-hidden="true" className={styles.writingLine} />
        ) : null}
      </div>

      {showReceipt ? (
        <footer className={styles.receipt}>
          <div className={styles.receiptCopy}>
            <span>完成回执</span>
            <strong>{completionSummary}</strong>
            {locatableRecordIds.length > 0 ? (
              <small>
                画布成果已就位
              </small>
            ) : null}
          </div>
          {canLocate || onRequestChanges ? (
            <div className={styles.receiptActions}>
              {canLocate ? (
                <Button
                  className={styles.locateButton}
                  onClick={() => onLocateResult?.(locatableRecordIds)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  看画布成果
                </Button>
              ) : null}
              {onRequestChanges ? (
                <Button
                  onClick={onRequestChanges}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  继续调整
                </Button>
              ) : null}
            </div>
          ) : null}
        </footer>
      ) : null}

      {phase === "interrupted" || phase === "error" ? (
        <footer className={styles.endNote} role="status">
          <span>{phase === "error" ? "需要处理" : "已保留现场"}</span>
          <p>
            {phase === "error"
              ? "上面的内容已经保留，可以补充说明后再试一次。"
              : "已停止继续生成，上面的内容仍可查看。"}
          </p>
        </footer>
      ) : null}
    </article>
  );
}
