"use client";

import React from "react";
import { DRAWLESS_COWORKER_DISPLAY_NAME } from "@drawless/shared";
import { Button, LiquidGlassSurface } from "@drawless/ui";

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
  /** 根据真实写入和警告派生的交付结果。 */
  outcome?: "success" | "partial" | "not-applied";
  /** 执行期间跳过、降级或失败的说明。 */
  warnings?: string[];
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
    liveLabel: `${DRAWLESS_COWORKER_DISPLAY_NAME} 正在说明工作结果`
  },
  completed: {
    eyebrow: "交付给你",
    liveLabel: `${DRAWLESS_COWORKER_DISPLAY_NAME} 已完成工作`
  },
  interrupted: {
    eyebrow: "先停在这里",
    liveLabel: `${DRAWLESS_COWORKER_DISPLAY_NAME} 已停止本次工作`
  },
  error: {
    eyebrow: "交付异常",
    liveLabel: `${DRAWLESS_COWORKER_DISPLAY_NAME} 本次工作遇到问题`
  }
};

/**
 * Coworker 递回的高可读工作浮层。
 *
 * 组件只呈现调用方传入的会话派生结果，不持有画布数据或第二份任务状态。
 */
export function CoworkerResultNote({
  phase,
  paragraphs,
  completionSummary = null,
  outcome = "success",
  warnings = [],
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
    <LiquidGlassSurface
      asChild
      tone={getResultTone(phase, outcome)}
      variant="document"
    >
      <article
        aria-label={copy.liveLabel}
        className={styles.note}
        data-outcome={outcome}
        data-phase={phase}
      >
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
          aria-label={`${DRAWLESS_COWORKER_DISPLAY_NAME} 工作说明正文`}
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
              <span>{getReceiptLabel(outcome)}</span>
              <strong>{completionSummary}</strong>
              {outcome !== "not-applied" && locatableRecordIds.length > 0 ? (
                <small>
                  {outcome === "partial"
                    ? "已定位完成的部分"
                    : "画布成果已就位"}
                </small>
              ) : null}
              {warnings.length > 0 ? (
                <ul className={styles.warnings} aria-label="执行说明">
                  {warnings.map((warning, index) => (
                    <li key={`${index}-${warning}`}>{warning}</li>
                  ))}
                </ul>
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
    </LiquidGlassSurface>
  );
}

function getReceiptLabel(outcome: NonNullable<CoworkerResultNoteProps["outcome"]>) {
  if (outcome === "partial") {
    return "部分完成";
  }
  if (outcome === "not-applied") {
    return "未写入画布";
  }
  return "完成回执";
}

function getResultTone(
  phase: CoworkerResultNotePhase,
  outcome: NonNullable<CoworkerResultNoteProps["outcome"]>
): "success" | "warning" | "danger" | "neutral" {
  if (phase === "error" || outcome === "not-applied") {
    return "danger";
  }
  if (phase === "interrupted" || outcome === "partial") {
    return "warning";
  }
  if (phase === "completed") {
    return "success";
  }
  return "neutral";
}
