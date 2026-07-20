"use client";

import { useEffect, useRef, useState } from "react";
import type { DrawlessCanvasViewportContext } from "@drawless/shared";

import { resolveCoworkerAvatarMode } from "@/lib/coworker-avatar-state";
import { getLatestCanvasEditResult } from "@/lib/coworker-presence-content";
import { resolveCoworkerPresenceView } from "@/lib/coworker-presence-state";
import { useCoworkerAvatarFrame } from "@/lib/use-coworker-avatar-frame";
import { useCoworkerConversation } from "@/lib/use-coworker-conversation";

import { CoworkerActivityLog } from "./coworker-activity-log";
import type { CoworkerControlState } from "./coworker-control-state";
import { CoworkerPresenceStage } from "./coworker-presence-stage";

const COWORKER_COMPOSER_ID = "coworker-composer";
const COWORKER_ACTIVITY_LOG_ID = "coworker-activity-log";

/**
 * 在场式 Coworker 的编排边界。业务 controller 永远挂载，收起任何 UI 都不会停止任务。
 */
export function CoworkerConversationWindow({
  roomId,
  coworker,
  getCanvasViewport,
  onLocateResult
}: {
  /** 当前协同房间 ID。 */
  roomId: string;
  /** 当前 room 的 coworker 生命周期状态和控制动作。 */
  coworker: CoworkerControlState;
  /** 发送消息时读取用户当前画布可视区。 */
  getCanvasViewport?: () => DrawlessCanvasViewportContext | null;
  /** 在 tldraw 中定位工具真实返回的 record IDs。 */
  onLocateResult?: ((recordIds: string[]) => void) | undefined;
}) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const [entryHovered, setEntryHovered] = useState(false);
  const [entryFocused, setEntryFocused] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [handoff, setHandoff] = useState<{
    id: number;
    text: string;
  } | null>(null);
  const handoffSequenceRef = useRef(0);
  const handoffTimerRef = useRef<number | null>(null);
  const conversation = useCoworkerConversation({ roomId, getCanvasViewport });
  const presence = resolveCoworkerPresenceView({
    status: conversation.status,
    turns: conversation.turns,
    inputFocused: composerOpen && inputFocused
  });
  const avatarMode = resolveCoworkerAvatarMode({
    conversationStatus: conversation.status,
    inputFocused: composerOpen && inputFocused,
    entryEngaged: entryHovered || entryFocused
  });
  const { frameSrc } = useCoworkerAvatarFrame(avatarMode);
  const result = presence.activeTurn
    ? getLatestCanvasEditResult(presence.activeTurn.blocks)
    : null;
  const pendingApproval =
    presence.activeTurn && presence.pendingApproval
      ? {
          turn: presence.activeTurn,
          approval: presence.pendingApproval
        }
      : null;
  const online = coworker.view.state === "online";
  const joinError =
    coworker.view.state === "disabled" || coworker.view.state === "error"
      ? coworker.view.detail
      : null;

  const toggleComposer = () => {
    if (composerOpen) {
      setInputFocused(false);
    }
    setComposerOpen((current) => !current);
  };

  useEffect(() => {
    return () => {
      if (handoffTimerRef.current !== null) {
        window.clearTimeout(handoffTimerRef.current);
      }
    };
  }, [roomId]);

  const join = () => {
    void coworker.start({
      sendIntroCursorChat: true,
      timeoutMs: 10_000,
      waitUntilLoaded: true
    });
  };

  const sendMessage = () => {
    const submittedMessage = conversation.message.trim();
    const shouldAnimateHandoff = Boolean(submittedMessage) && !conversation.busy;
    // 请求立即开始；Composer 同步收起，让输入在视觉上真正交接给 Coworker。
    const request = conversation.sendMessage();
    if (shouldAnimateHandoff) {
      handoffSequenceRef.current += 1;
      setHandoff({
        id: handoffSequenceRef.current,
        text: submittedMessage
      });
      if (handoffTimerRef.current !== null) {
        window.clearTimeout(handoffTimerRef.current);
      }
      handoffTimerRef.current = window.setTimeout(() => {
        setHandoff(null);
        handoffTimerRef.current = null;
      }, 920);
    }
    setInputFocused(false);
    setComposerOpen(false);
    return request;
  };

  const closeActivityLog = () => {
    setActivityLogOpen(false);
    window.requestAnimationFrame(() => {
      document.getElementById(`${COWORKER_ACTIVITY_LOG_ID}-trigger`)?.focus();
    });
  };

  return (
    <div
      className="coworker-conversation-surface coworker-presence-surface"
      data-expanded={composerOpen || activityLogOpen}
      data-mode={avatarMode}
      data-phase={presence.phase}
    >
      <CoworkerPresenceStage
        activityLogId={COWORKER_ACTIVITY_LOG_ID}
        activityLogOpen={activityLogOpen}
        avatarMode={avatarMode}
        canCancel={
          conversation.status === "receiving" ||
          conversation.status === "streaming"
        }
        completionSummary={
          presence.phase === "completed"
            ? result?.summary ?? null
            : null
        }
        composerId={COWORKER_COMPOSER_ID}
        composerOpen={composerOpen}
        frameSrc={frameSrc}
        handoff={handoff}
        joinError={joinError}
        joining={coworker.view.state === "loading"}
        latestText={presence.latestText ?? ""}
        latestUserText={presence.activeTurn?.userText ?? null}
        lifecycleState={coworker.view.state}
        message={conversation.message}
        onAvatarFocusChange={setEntryFocused}
        onAvatarHoverChange={setEntryHovered}
        onCancel={conversation.cancel}
        onComposerFocusChange={setInputFocused}
        onJoin={join}
        onLocateResult={onLocateResult}
        onMessageChange={conversation.setMessage}
        onResolveApproval={conversation.resolveToolApproval}
        onSend={sendMessage}
        onToggleActivityLog={() => setActivityLogOpen((current) => !current)}
        onToggleComposer={toggleComposer}
        online={online}
        pendingApproval={pendingApproval}
        phase={presence.phase}
        resultRecordIds={result?.recordIds ?? []}
        sendDisabled={conversation.busy}
        statusText={presence.statusText}
      />

      {activityLogOpen ? (
        <CoworkerActivityLog
          id={COWORKER_ACTIVITY_LOG_ID}
          onClose={closeActivityLog}
          turns={conversation.turns}
        />
      ) : null}
    </div>
  );
}
