import React from "react";
import { LiquidGlassSurface } from "@drawless/ui";

import styles from "./coworker-glass-handoff.module.css";

export type CoworkerGlassHandoffProps = {
  /** 正在交给 Drew 的用户文本。 */
  text: string;
};

/**
 * 纯展示的液态玻璃交接动效。
 * 业务状态和无障碍播报由外层负责，这里只表现信息从 exchange 流向 Drew 的空间关系。
 */
export function CoworkerGlassHandoff({ text }: CoworkerGlassHandoffProps) {
  return (
    <div aria-hidden="true" className={styles.root}>
      <span className={styles.inkTrail}>
        <span className={styles.trailFar} />
        <span className={styles.trailMiddle} />
        <span className={styles.trailNear} />
      </span>

      <LiquidGlassSurface asChild tone="accent" variant="card">
        <span className={`${styles.glass} ${styles.sheet}`}>
          <span className={styles.copy}>{text}</span>
        </span>
      </LiquidGlassSurface>

      <LiquidGlassSurface asChild tone="accent" variant="card">
        <span className={`${styles.glass} ${styles.foldedSheet}`} />
      </LiquidGlassSurface>

      <LiquidGlassSurface asChild tone="accent" variant="card">
        <span className={`${styles.glass} ${styles.glassDroplet}`} />
      </LiquidGlassSurface>
    </div>
  );
}
