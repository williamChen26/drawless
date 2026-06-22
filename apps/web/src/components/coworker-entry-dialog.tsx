"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@drawless/ui";

import type { CoworkerControlState } from "./coworker-control-state";

// 弹窗内部只关心启动交互本身，不复刻完整 coworker 生命周期；真实状态仍以 coworker.view 为准。
type CoworkerEntryDialogState = "idle" | "starting" | "error";

type CoworkerEntryDialogProps = {
  /** 当前 room 的 coworker 控制状态和启动动作。 */
  coworker: CoworkerControlState;
  /** 当前协同房间 ID，用来隔离同一次页面生命周期内不同 room 的关闭状态。 */
  roomId: string;
};

export function CoworkerEntryDialog({
  coworker,
  roomId
}: CoworkerEntryDialogProps) {
  const [open, setOpen] = useState(false);
  const [dismissedRoomId, setDismissedRoomId] = useState<string | null>(null);
  const [state, setState] = useState<CoworkerEntryDialogState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (coworker.view.state === "online") {
      // coworker 已经在线时不再打扰用户；这也覆盖了用户从顶部栏手动点击“进入”的情况。
      setOpen(false);
      return;
    }
    if (dismissedRoomId !== roomId) {
      // 不写 sessionStorage：每次刷新或重新进入页面都重新询问，只在当前页面生命周期内避免反复弹出。
      setOpen(true);
    }
  }, [coworker.view.state, dismissedRoomId, roomId]);

  const decline = () => {
    // “暂不进入”只关闭当前页面生命周期内的提示；刷新页面后会再次询问。
    setDismissedRoomId(roomId);
    setOpen(false);
  };

  const approve = async () => {
    setState("starting");
    setMessage(null);
    const nextView = await coworker.start({
      sendIntroCursorChat: true,
      timeoutMs: 10_000,
      waitUntilLoaded: true
    });
    if (nextView.state === "online") {
      // 等待 hydration 成功后再关闭弹窗，保证后续三条 cursor chat 有真实协作者身份承载。
      setDismissedRoomId(roomId);
      setOpen(false);
      setState("idle");
      return;
    }

    setState("error");
    setMessage(nextView.detail);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          // 用户按 Esc 或点遮罩关闭，也只影响当前页面生命周期；刷新后仍会重新弹出。
          setDismissedRoomId(roomId);
        }
      }}
    >
      <DialogContent
        className="coworker-entry-dialog"
        onOpenAutoFocus={(event) => {
          // Radix Dialog 默认会聚焦第一个可聚焦元素；这里保留视觉弹窗，但不抢占到“暂不进入”按钮。
          event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>让 coworker 进入这个画布？</DialogTitle>
          <DialogDescription>
            它会作为协作者加入当前 room，用自己的光标和 cursor chat 介绍工作方式。
          </DialogDescription>
        </DialogHeader>
        <div className="coworker-entry-dialog__body">
          <p>
            进入后，coworker 可以读取当前画布上下文，并在你明确确认后执行画布编辑任务。
          </p>
          {message ? (
            <p className="coworker-entry-dialog__error" role="alert">
              {message}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            disabled={state === "starting" || coworker.view.busy}
            onClick={decline}
            type="button"
            variant="ghost"
          >
            暂不进入
          </Button>
          <Button
            disabled={state === "starting" || coworker.view.busy}
            onClick={approve}
            type="button"
          >
            {state === "starting" ? "正在进入" : "允许进入"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
