"use client";

import React, { useState } from "react";
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
  /** 会话面板当前是否展开。 */
  expanded: boolean;
  /** 会话面板 DOM ID。 */
  panelId: string;
  /** coworker 当前生命周期状态。 */
  lifecycleState: string;
  /** 当前主舞台要求用户先完成审批时，暂时锁定 Composer 入口。 */
  disabled?: boolean;
  /** 切换会话面板展开状态。 */
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
  lifecycleState,
  disabled = false,
  onToggle,
  onHoverChange,
  onFocusChange
}: CoworkerAvatarEntryProps) {
  const [assetFailed, setAssetFailed] = useState(false);
  const accessibleLabel = disabled
    ? "请先处理 Coworker 的确认单"
    : expanded
      ? "收起 Coworker 输入区"
      : "和 Coworker 一起工作";
  const commonProps = {
    "aria-controls": panelId,
    "aria-expanded": expanded,
    "aria-label": accessibleLabel,
    disabled,
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
        {getCoworkerAvatarLabel(mode)}
      </span>
    </button>
  );
}
