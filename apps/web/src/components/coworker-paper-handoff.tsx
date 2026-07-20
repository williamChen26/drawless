import React from "react";

import styles from "./coworker-paper-handoff.module.css";

export type CoworkerPaperHandoffProps = {
  /** 正在交给 Coworker 的用户文本。 */
  text: string;
};

/**
 * 纯展示的纸带交接动效。
 * 业务状态和无障碍播报由外层负责，这里只表现信息从 exchange 流向 Coworker 的空间关系。
 */
export function CoworkerPaperHandoff({ text }: CoworkerPaperHandoffProps) {
  return (
    <div aria-hidden="true" className={styles.root}>
      <span className={styles.inkTrail}>
        <span className={styles.trailFar} />
        <span className={styles.trailMiddle} />
        <span className={styles.trailNear} />
      </span>

      <span className={`${styles.paper} ${styles.sheet}`}>
        <span className={styles.copy}>{text}</span>
        <span className={styles.foldMark} />
      </span>

      <span className={`${styles.paper} ${styles.foldedSheet}`}>
        <span className={styles.foldMark} />
      </span>

      <span className={`${styles.paper} ${styles.paperScrap}`}>
        <span className={styles.foldMark} />
      </span>
    </div>
  );
}
