"use client";

import React from "react";
import {
  LiquidGlassSurface,
  type LiquidGlassSurfaceProps
} from "@drawless/ui";

type LiquidGlassBubbleProps = {
  /** 气泡主体；保留调用方提供的 section、aside 等业务语义。 */
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
  /**
   * 气泡外层类名，只负责应用侧尺寸和空间位置。
   * 外层不能保留 transform；入场动效由内部玻璃 surface 统一承担，避免阻断 backdrop 采样。
   */
  className?: string;
  /** 气泡轮廓；thought 使用更松软的不规则轮廓。 */
  shape?: "speech" | "thought";
  /** 气泡尾部朝向，用来指向触发它的空间锚点。 */
  tail?: "start" | "end" | "none";
  /** Liquid Glass 的语义色调。 */
  tone?: LiquidGlassSurfaceProps["tone"];
  /** Liquid Glass 的语义表面类型。 */
  variant?: LiquidGlassSurfaceProps["variant"];
};

/**
 * 画布功能浮层使用的可复用 Liquid Glass 气泡。
 *
 * 组件统一组合玻璃材质、空间尾部和入场动效，不保存开关或业务状态。
 */
export function LiquidGlassBubble({
  children,
  className,
  shape = "speech",
  tail = "start",
  tone = "neutral",
  variant = "card"
}: LiquidGlassBubbleProps) {
  const classes = ["liquid-glass-bubble", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} data-shape={shape} data-tail={tail}>
      <LiquidGlassSurface
        asChild
        className="liquid-glass-bubble__surface"
        tone={tone}
        variant={variant}
      >
        {children}
      </LiquidGlassSurface>
      <LiquidGlassSurface
        aria-hidden="true"
        className="liquid-glass-bubble__tail"
        tone={tone}
        variant={variant}
      />
      <LiquidGlassSurface
        aria-hidden="true"
        className="liquid-glass-bubble__tail-tip"
        tone={tone}
        variant={variant}
      />
    </div>
  );
}
