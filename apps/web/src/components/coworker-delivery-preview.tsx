"use client";

import React from "react";
import { DRAWLESS_COWORKER_DISPLAY_NAME } from "@drawless/shared";
import { Button, LiquidGlassSurface } from "@drawless/ui";

export function CoworkerDeliveryPreview({
  summary,
  outcome,
  warnings,
  recordIds,
  onExpand,
  onRequestChanges,
  onLocateResult
}: {
  /** 已通过工具契约验证的完成摘要。 */
  summary: string;
  /** 根据真实写入和警告派生的交付结果。 */
  outcome: "success" | "partial" | "not-applied";
  /** 执行期间跳过、降级或失败的说明。 */
  warnings: string[];
  /** 可以重新向 tldraw store 查询的画布记录。 */
  recordIds: string[];
  /** 展开完整工作说明。 */
  onExpand: () => void;
  /** 就当前交付继续给 Drew 反馈。 */
  onRequestChanges: () => void;
  /** 在画布中定位真实工作结果。 */
  onLocateResult?: ((recordIds: string[]) => void) | undefined;
}) {
  const uniqueRecordIds = Array.from(new Set(recordIds));
  const canLocate = uniqueRecordIds.length > 0 && Boolean(onLocateResult);
  const copy = DELIVERY_OUTCOME_COPY[outcome];

  return (
    <LiquidGlassSurface
      asChild
      tone={getDeliveryTone(outcome)}
      variant="card"
    >
      <article
        aria-label={`${DRAWLESS_COWORKER_DISPLAY_NAME} 的画布交付`}
        className="coworker-delivery-preview"
        data-outcome={outcome}
      >
        <header>
          <span>{copy.eyebrow}</span>
          <strong>{copy.title}</strong>
        </header>
        <p>{summary}</p>
        {warnings.length > 0 ? (
          <ul aria-label="执行说明" className="coworker-delivery-preview__warnings">
            {warnings.map((warning, index) => (
              <li key={`${index}-${warning}`}>{warning}</li>
            ))}
          </ul>
        ) : null}
        <div className="coworker-delivery-preview__actions">
          {canLocate ? (
            <Button
              onClick={() => onLocateResult?.(uniqueRecordIds)}
              size="sm"
              type="button"
            >
              看画布成果
            </Button>
          ) : null}
          <Button
            onClick={onRequestChanges}
            size="sm"
            type="button"
            variant="secondary"
          >
            继续调整
          </Button>
          <Button onClick={onExpand} size="sm" type="button" variant="ghost">
            展开说明
          </Button>
        </div>
      </article>
    </LiquidGlassSurface>
  );
}

const DELIVERY_OUTCOME_COPY = {
  success: { eyebrow: "交付给你", title: "画布成果已经就位" },
  partial: { eyebrow: "部分完成", title: "有些修改需要再处理" },
  "not-applied": { eyebrow: "未写入画布", title: "这次没有改动画布" }
} as const;

function getDeliveryTone(
  outcome: "success" | "partial" | "not-applied"
): "success" | "warning" | "danger" {
  if (outcome === "partial") {
    return "warning";
  }
  if (outcome === "not-applied") {
    return "danger";
  }
  return "success";
}
