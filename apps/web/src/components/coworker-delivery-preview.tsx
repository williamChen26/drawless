"use client";

import React from "react";
import { Button } from "@drawless/ui";

export function CoworkerDeliveryPreview({
  summary,
  recordIds,
  onExpand,
  onRequestChanges,
  onLocateResult
}: {
  /** 已通过工具契约验证的完成摘要。 */
  summary: string;
  /** 可以重新向 tldraw store 查询的画布记录。 */
  recordIds: string[];
  /** 展开完整工作说明。 */
  onExpand: () => void;
  /** 就当前交付继续给 Coworker 反馈。 */
  onRequestChanges: () => void;
  /** 在画布中定位真实工作结果。 */
  onLocateResult?: ((recordIds: string[]) => void) | undefined;
}) {
  const uniqueRecordIds = Array.from(new Set(recordIds));
  const canLocate = uniqueRecordIds.length > 0 && Boolean(onLocateResult);

  return (
    <article
      aria-label="Coworker 的画布交付"
      className="coworker-delivery-preview"
    >
      <header>
        <span>交付给你</span>
        <strong>画布成果已经就位</strong>
      </header>
      <p>{summary}</p>
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
  );
}
