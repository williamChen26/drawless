"use client";

import React, {
  type CSSProperties,
  type KeyboardEvent,
  type WheelEvent,
  useEffect,
  useRef,
  useState
} from "react";
import { DRAWLESS_COWORKER_DISPLAY_NAME } from "@drawless/shared";
import { LiquidGlassSurface } from "@drawless/ui";
import { useReducedMotion } from "motion/react";

import {
  getCoworkerPromptPresetGroups,
  type CoworkerPromptPreset,
  type CoworkerPromptPresetMode
} from "../lib/coworker-prompt-presets";

import styles from "./coworker-prompt-arrival.module.css";

export type CoworkerPromptArrivalProps = {
  /** 根据当前 tldraw document 是否为空选择起手句。 */
  mode: CoworkerPromptPresetMode;
  /** 当前同步或请求状态是否暂时阻止调用。 */
  disabled: boolean;
  /** 直接把预设要求递给 Drew。 */
  onInvoke: (message: string) => Promise<void>;
  /** 收起本次主动邀请。 */
  onDismiss: () => void;
};

/**
 * Drew 入场后主动递出的能力起手句。
 * 它与 Composer 互斥，只负责发现能力和发起一次真实 conversation 请求。
 */
export function CoworkerPromptArrival({
  mode,
  disabled,
  onInvoke,
  onDismiss
}: CoworkerPromptArrivalProps) {
  const groups = getCoworkerPromptPresetGroups(mode);
  const [pageIndex, setPageIndex] = useState(0);
  const [hasPaged, setHasPaged] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const promptButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pendingFocusIndexRef = useRef<number | null>(null);
  const invokeTimerRef = useRef<number | null>(null);
  const lastWheelAtRef = useRef(0);
  const mountedRef = useRef(true);
  const prefersReducedMotion = useReducedMotion();
  const currentGroup = groups[pageIndex] ?? groups[0] ?? [];

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (invokeTimerRef.current !== null) {
        window.clearTimeout(invokeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const focusIndex = pendingFocusIndexRef.current;
    if (focusIndex === null) {
      return;
    }
    pendingFocusIndexRef.current = null;
    window.requestAnimationFrame(() => {
      promptButtonRefs.current[focusIndex]?.focus();
    });
  }, [pageIndex]);

  const changePage = (nextPageIndex: number, focusIndex?: number) => {
    if (selectedId) {
      return;
    }
    const normalizedPageIndex =
      (nextPageIndex + groups.length) % groups.length;
    if (normalizedPageIndex === pageIndex) {
      return;
    }
    if (focusIndex !== undefined) {
      pendingFocusIndexRef.current = focusIndex;
    }
    setHasPaged(true);
    setPageIndex(normalizedPageIndex);
  };

  const handleWheel = (event: WheelEvent<HTMLElement>) => {
    const delta =
      Math.abs(event.deltaY) >= Math.abs(event.deltaX)
        ? event.deltaY
        : event.deltaX;
    if (selectedId) {
      return;
    }

    event.stopPropagation();
    if (Math.abs(delta) < 8) {
      return;
    }
    const now = Date.now();
    if (now - lastWheelAtRef.current < 280) {
      return;
    }
    lastWheelAtRef.current = now;
    changePage(pageIndex + (delta > 0 ? 1 : -1));
  };

  const invoke = (preset: CoworkerPromptPreset) => {
    if (disabled || selectedId) {
      return;
    }
    setSelectedId(preset.id);
    const delay = prefersReducedMotion ? 0 : 150;
    invokeTimerRef.current = window.setTimeout(() => {
      invokeTimerRef.current = null;
      void onInvoke(preset.message).finally(() => {
        if (mountedRef.current) {
          setSelectedId(null);
        }
      });
    }, delay);
  };

  const handlePromptKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    promptIndex: number
  ) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextPromptIndex =
        (promptIndex + direction + currentGroup.length) %
        currentGroup.length;
      promptButtonRefs.current[nextPromptIndex]?.focus();
      return;
    }
    if (
      event.key === "ArrowRight" ||
      event.key === "PageDown" ||
      event.key === "ArrowLeft" ||
      event.key === "PageUp"
    ) {
      event.preventDefault();
      const direction =
        event.key === "ArrowRight" || event.key === "PageDown" ? 1 : -1;
      changePage(pageIndex + direction, promptIndex);
    }
  };

  return (
    <section
      aria-label={`${DRAWLESS_COWORKER_DISPLAY_NAME} 推荐的画布起手句`}
      className={styles.root}
      data-disabled={disabled}
      data-paged={hasPaged}
      data-selecting={Boolean(selectedId)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onDismiss();
        }
      }}
      onWheel={handleWheel}
    >
      <header className={styles.header}>
        <p>
          <strong>{DRAWLESS_COWORKER_DISPLAY_NAME}</strong>
          <span>想先和你一起试试</span>
        </p>
        <button
          className={styles.dismiss}
          disabled={Boolean(selectedId)}
          onClick={onDismiss}
          type="button"
        >
          先自己看看
        </button>
      </header>

      <div
        aria-live="polite"
        className={styles.prompts}
        key={`${mode}:${pageIndex}`}
      >
        {currentGroup.map((preset, promptIndex) => (
          <LiquidGlassSurface
            asChild
            key={preset.id}
            tone={selectedId === preset.id ? "accent" : "quiet"}
            variant="control"
          >
            <button
              aria-label={`${preset.title}：${preset.message}`}
              className={styles.prompt}
              data-selected={selectedId === preset.id}
              disabled={disabled || Boolean(selectedId)}
              onClick={() => invoke(preset)}
              onKeyDown={(event) =>
                handlePromptKeyDown(event, promptIndex)
              }
              ref={(node) => {
                promptButtonRefs.current[promptIndex] = node;
              }}
              style={
                {
                  "--prompt-index": promptIndex
                } as CSSProperties
              }
              type="button"
            >
              <strong>{preset.title}</strong>
              <span>{preset.message}</span>
            </button>
          </LiquidGlassSurface>
        ))}
      </div>

      <footer className={styles.footer}>
        <span>滚动换一组</span>
        <div aria-label="选择起手句分组" className={styles.pages}>
          {groups.map((_, index) => (
            <button
              aria-label={`展示第 ${index + 1} 组起手句`}
              aria-pressed={pageIndex === index}
              disabled={Boolean(selectedId)}
              key={index}
              onClick={() => changePage(index)}
              type="button"
            >
              <span />
            </button>
          ))}
        </div>
      </footer>
    </section>
  );
}
