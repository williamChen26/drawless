"use client";

import React, {
  type CompositionEvent,
  type FormEvent,
  type KeyboardEvent,
  useRef
} from "react";
import { Button, Textarea } from "@drawless/ui";

const COMPOSER_HINT_ID = "coworker-composer-hint";
const COMPOSER_MESSAGE_ID = "coworker-composer-message";

export type CoworkerComposerProps = {
  /** 当前尚未发送的用户草稿。 */
  message: string;
  /** 当前任务进行中时只阻止再次发送，仍允许用户准备下一条草稿。 */
  sendDisabled: boolean;
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
      aria-label="把想法交给 Coworker"
      className="coworker-composer"
      onSubmit={submit}
    >
      <label className="coworker-composer__label" htmlFor={COMPOSER_MESSAGE_ID}>
        你想一起完成什么？
      </label>
      <div className="coworker-composer__surface">
        <Textarea
          aria-describedby={COMPOSER_HINT_ID}
          autoFocus
          className="coworker-composer__input"
          id={COMPOSER_MESSAGE_ID}
          maxLength={8_000}
          onBlur={() => onFocusChange(false)}
          onChange={(event) => onMessageChange(event.target.value)}
          onCompositionEnd={handleCompositionEnd}
          onCompositionStart={handleCompositionStart}
          onFocus={() => onFocusChange(true)}
          onKeyDown={handleKeyDown}
          placeholder="告诉我你想理解、整理或修改什么"
          rows={2}
          value={message}
        />
        <Button
          aria-label={sendDisabled ? "Coworker 正在处理当前任务" : "发送给 Coworker"}
          className="coworker-composer__send"
          disabled={!canSend}
          type="submit"
        >
          交给他
        </Button>
      </div>
      <p className="coworker-composer__hint" id={COMPOSER_HINT_ID}>
        {sendDisabled
          ? "可以继续写下一个想法，当前任务完成后再发送。"
          : "Enter 发送，Shift + Enter 换行"}
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
