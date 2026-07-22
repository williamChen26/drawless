"use client";

import React, {
  type CompositionEvent,
  type FormEvent,
  type KeyboardEvent,
  useRef
} from "react";
import { Button, Textarea } from "@drawless/ui";

const COMPOSER_HINT_ID = "coworker-composer-hint";
export const COWORKER_COMPOSER_MESSAGE_ID = "coworker-composer-message";

export type CoworkerComposerProps = {
  /** 当前尚未发送的用户草稿。 */
  message: string;
  /** 当前任务进行中时只阻止再次发送，仍允许用户准备下一条草稿。 */
  sendDisabled: boolean;
  /** Coworker 忙碌时对当前发送限制的准确说明。 */
  busyHint?: string;
  /** 当前沟通语境下的输入标签。 */
  label?: string;
  /** 当前沟通语境下的输入提示。 */
  placeholder?: string;
  /** 当前沟通语境下的提交动作。 */
  sendLabel?: string;
  /** 更新用户草稿。 */
  onMessageChange: (message: string) => void;
  /** 提交当前草稿。 */
  onSend: () => Promise<void>;
  /** 通知人物表现层输入焦点是否在 Composer 内。 */
  onFocusChange: (focused: boolean) => void;
};

/**
 * 人物身旁的轻量输入器。业务状态由外层 controller 持有，这里只处理输入语义。
 */
export function CoworkerComposer({
  message,
  sendDisabled,
  busyHint = "Coworker 正在处理。你可以先写下来，当前步骤结束后再递给他。",
  label = "写给 Coworker",
  placeholder = "聊聊你的想法，或者把要做的事交代给我",
  sendLabel = "递给他",
  onMessageChange,
  onSend,
  onFocusChange
}: CoworkerComposerProps) {
  const compositionRef = useRef(false);
  const canSend = Boolean(message.trim()) && !sendDisabled;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSend) {
      void onSend();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!shouldSubmitCoworkerComposerOnKeyDown({
      key: event.key,
      shiftKey: event.shiftKey,
      compositionActive: compositionRef.current,
      nativeIsComposing: event.nativeEvent.isComposing,
      nativeKeyCode: event.nativeEvent.keyCode
    })) {
      return;
    }

    event.preventDefault();
    if (canSend) {
      void onSend();
    }
  };

  const handleCompositionStart = (_event: CompositionEvent<HTMLTextAreaElement>) => {
    compositionRef.current = true;
  };

  const handleCompositionEnd = (_event: CompositionEvent<HTMLTextAreaElement>) => {
    compositionRef.current = false;
  };

  return (
    <form
      aria-label={label}
      className="coworker-composer"
      onSubmit={submit}
    >
      <label
        className="coworker-composer__label"
        htmlFor={COWORKER_COMPOSER_MESSAGE_ID}
      >
        {label}
      </label>
      <div className="coworker-composer__surface">
        <Textarea
          aria-describedby={COMPOSER_HINT_ID}
          autoFocus
          className="coworker-composer__input"
          id={COWORKER_COMPOSER_MESSAGE_ID}
          maxLength={8_000}
          onBlur={() => onFocusChange(false)}
          onChange={(event) => onMessageChange(event.target.value)}
          onCompositionEnd={handleCompositionEnd}
          onCompositionStart={handleCompositionStart}
          onFocus={() => onFocusChange(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={2}
          value={message}
        />
        <Button
          aria-label={sendDisabled ? "Coworker 正在处理当前工作" : sendLabel}
          className="coworker-composer__send"
          disabled={!canSend}
          type="submit"
        >
          {sendLabel}
        </Button>
      </div>
      <p className="coworker-composer__hint" id={COMPOSER_HINT_ID}>
        {sendDisabled
          ? busyHint
          : "Enter 递出，Shift + Enter 换行"}
      </p>
    </form>
  );
}

/**
 * compositionRef 兼容部分浏览器在 compositionend 附近不稳定的 isComposing；
 * keyCode 229 是 Safari 和部分输入法仍会使用的兼容信号。
 */
export function shouldSubmitCoworkerComposerOnKeyDown(input: {
  /** React keyboard event key。 */
  key: string;
  /** 用户是否同时按下 Shift。 */
  shiftKey: boolean;
  /** compositionstart/compositionend ref 记录的输入法状态。 */
  compositionActive: boolean;
  /** 浏览器原生 KeyboardEvent.isComposing。 */
  nativeIsComposing: boolean;
  /** 浏览器原生 KeyboardEvent.keyCode。 */
  nativeKeyCode: number;
}) {
  return (
    input.key === "Enter" &&
    !input.shiftKey &&
    !input.compositionActive &&
    !input.nativeIsComposing &&
    input.nativeKeyCode !== 229
  );
}
