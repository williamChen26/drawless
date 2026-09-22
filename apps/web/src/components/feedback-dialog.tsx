"use client";

import React, {
  useId,
  useRef,
  useState,
  type FormEvent
} from "react";
import { Button, Textarea } from "@drawless/ui";
import type { DrawlessFeedbackCategory } from "@drawless/shared";

import { submitDrawlessFeedback } from "../lib/feedback";

type FeedbackDialogStatus =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; issueNumber: number }
  | { kind: "error"; message: string };

export function FeedbackDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [category, setCategory] =
    useState<DrawlessFeedbackCategory>("bug");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [submissionId, setSubmissionId] = useState<string | null>(
    null
  );
  const [status, setStatus] = useState<FeedbackDialogStatus>({
    kind: "idle"
  });

  function openDialog() {
    if (status.kind === "success") {
      setCategory("bug");
      setMessage("");
      setWebsite("");
    }
    setStatus({ kind: "idle" });
    setSubmissionId(null);
    dialogRef.current?.showModal();
    globalThis.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }

  function closeDialog() {
    if (status.kind !== "submitting") {
      dialogRef.current?.close();
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currentSubmissionId =
      submissionId ?? globalThis.crypto.randomUUID();
    setSubmissionId(currentSubmissionId);
    setStatus({ kind: "submitting" });

    const response = await submitDrawlessFeedback({
      request: {
        submissionId: currentSubmissionId,
        category,
        message,
        surface: "canvas"
      },
      website,
      serverUrl:
        process.env.NEXT_PUBLIC_DRAWLESS_SERVER_URL ??
        process.env.NEXT_PUBLIC_DRAWLESS_SYNC_SERVER_URL
    });

    if (response.ok) {
      setStatus({
        kind: "success",
        issueNumber: response.issueNumber
      });
      return;
    }

    setStatus({ kind: "error", message: response.message });
  }

  function startAnotherFeedback() {
    setMessage("");
    setWebsite("");
    setSubmissionId(null);
    setStatus({ kind: "idle" });
    globalThis.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }

  return (
    <>
      <Button
        className="feedback-dialog__trigger"
        onClick={openDialog}
        size="sm"
        type="button"
        variant="ghost"
      >
        反馈
      </Button>
      <dialog
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        className="feedback-dialog"
        onCancel={(event) => {
          if (status.kind === "submitting") {
            event.preventDefault();
          }
        }}
        ref={dialogRef}
      >
        <div className="feedback-dialog__header">
          <div>
            <strong id={titleId}>告诉我哪里可以更好</strong>
            <p id={descriptionId}>
              你的反馈会直接进入 drawless 的公开问题列表。
            </p>
          </div>
          <Button
            aria-label="关闭反馈"
            disabled={status.kind === "submitting"}
            onClick={closeDialog}
            size="sm"
            type="button"
            variant="ghost"
          >
            关闭
          </Button>
        </div>

        {status.kind === "success" ? (
          <div
            className="feedback-dialog__success"
            data-testid="feedback-success"
            role="status"
          >
            <span aria-hidden="true">✓</span>
            <strong>已经收到，谢谢你。</strong>
            <p>反馈编号 #{status.issueNumber}</p>
            <div className="feedback-dialog__actions">
              <Button
                onClick={startAnotherFeedback}
                type="button"
                variant="secondary"
              >
                再写一条
              </Button>
              <Button onClick={closeDialog} type="button">
                完成
              </Button>
            </div>
          </div>
        ) : (
          <form className="feedback-dialog__form" onSubmit={submit}>
            <label className="feedback-dialog__field">
              <span>反馈类型</span>
              <select
                disabled={status.kind === "submitting"}
                onChange={(event) => {
                  setCategory(
                    event.currentTarget
                      .value as DrawlessFeedbackCategory
                  );
                  setSubmissionId(null);
                  if (status.kind === "error") {
                    setStatus({ kind: "idle" });
                  }
                }}
                value={category}
              >
                <option value="bug">遇到问题</option>
                <option value="suggestion">功能建议</option>
                <option value="other">其他反馈</option>
              </select>
            </label>

            <label className="feedback-dialog__field">
              <span>具体情况</span>
              <Textarea
                disabled={status.kind === "submitting"}
                maxLength={4_000}
                minLength={10}
                onChange={(event) => {
                  setMessage(event.currentTarget.value);
                  setSubmissionId(null);
                  if (status.kind === "error") {
                    setStatus({ kind: "idle" });
                  }
                }}
                placeholder="发生了什么？你原本希望它怎样工作？"
                ref={textareaRef}
                required
                rows={7}
                value={message}
              />
              <small>{message.length} / 4000</small>
            </label>

            <div
              aria-hidden="true"
              className="feedback-dialog__honeypot"
              hidden
              inert
            >
              <input
                aria-hidden="true"
                autoComplete="off"
                name="website"
                onChange={(event) =>
                  setWebsite(event.currentTarget.value)
                }
                tabIndex={-1}
                value={website}
              />
            </div>

            <p className="feedback-dialog__privacy">
              反馈会保存为公开 GitHub Issue。请不要填写房间链接、画布内容或联系方式。
            </p>

            {status.kind === "error" ? (
              <p className="feedback-dialog__error" role="alert">
                {status.message}
              </p>
            ) : null}

            <div className="feedback-dialog__actions">
              <Button
                disabled={status.kind === "submitting"}
                onClick={closeDialog}
                type="button"
                variant="secondary"
              >
                取消
              </Button>
              <Button
                disabled={
                  status.kind === "submitting" ||
                  !message.trim().length
                }
                type="submit"
              >
                {status.kind === "submitting"
                  ? "正在提交…"
                  : "提交反馈"}
              </Button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
