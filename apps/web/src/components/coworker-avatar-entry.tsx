"use client";

import React, { useState } from "react";
import { DRAWLESS_COWORKER_DISPLAY_NAME } from "@drawless/shared";
import { Button } from "@drawless/ui";

import {
  getCoworkerAvatarLabel,
  type CoworkerAvatarMode
} from "../lib/coworker-avatar-state";

type CoworkerAvatarEntryProps = {
  /** 当前人物表现状态。 */
  mode: CoworkerAvatarMode;
  /** 当前人物静态帧地址。 */
  frameSrc: string;
  /** Coworker 协作空间当前是否展开。 */
  expanded: boolean;
  /** Coworker 协作空间 DOM ID。 */
  panelId: string;
  /** 人物入口 DOM ID，用于收起后恢复键盘焦点。 */
  entryId?: string;
  /** coworker 当前生命周期状态。 */
  lifecycleState: string;
  /** 协作空间收起后仍需提醒用户的工作事实。 */
  attentionLabel?: string | null;
  /** 用户纸带是否正在进入人物接收区。 */
  receivingHandoff?: boolean;
  /** 打开或收起 Coworker 协作空间。 */
  onToggle: () => void;
  /** 更新鼠标 hover 状态。 */
  onHoverChange: (hovered: boolean) => void;
  /** 更新键盘 focus 状态。 */
  onFocusChange: (focused: boolean) => void;
};

export function CoworkerAvatarEntry({
  mode,
  frameSrc,
  expanded,
  panelId,
  entryId,
  lifecycleState,
  attentionLabel = null,
  receivingHandoff = false,
  onToggle,
  onHoverChange,
  onFocusChange
}: CoworkerAvatarEntryProps) {
  const [assetFailed, setAssetFailed] = useState(false);
  const accessibleLabel = expanded
    ? `收起与 ${DRAWLESS_COWORKER_DISPLAY_NAME} 的协作空间`
    : attentionLabel
      ? `找 ${DRAWLESS_COWORKER_DISPLAY_NAME}，${attentionLabel}`
      : `找 ${DRAWLESS_COWORKER_DISPLAY_NAME}`;
  const visibleLabel =
    !expanded && attentionLabel
      ? attentionLabel
      : getCoworkerAvatarLabel(mode);
  const commonProps = {
    "aria-controls": panelId,
    "aria-expanded": expanded,
    "aria-label": accessibleLabel,
    id: entryId,
    onBlur: () => onFocusChange(false),
    onClick: onToggle,
    onFocus: () => onFocusChange(true),
    onMouseEnter: () => onHoverChange(true),
    onMouseLeave: () => onHoverChange(false),
    type: "button" as const
  };

  if (assetFailed) {
    return (
      <Button
        {...commonProps}
        className="coworker-avatar__fallback"
        variant="secondary"
      >
        一起工作
      </Button>
    );
  }

  return (
    <button
      {...commonProps}
      className="coworker-avatar"
      data-handoff={receivingHandoff}
      data-lifecycle={lifecycleState}
      data-mode={mode}
    >
      <span className="coworker-avatar__stage" aria-hidden="true">
        <img
          alt=""
          className="coworker-avatar__image"
          draggable={false}
          height={256}
          onError={() => setAssetFailed(true)}
          src={frameSrc}
          width={256}
        />
      </span>
      <span className="coworker-avatar__label" aria-hidden="true">
        {visibleLabel}
      </span>
    </button>
  );
}
