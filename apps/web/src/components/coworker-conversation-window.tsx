"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import type { DrawlessCanvasViewportContext } from "@drawless/shared";
import { LiquidGlassProvider } from "@drawless/ui";

import { resolveCoworkerAvatarMode } from "@/lib/coworker-avatar-state";
import { getLatestCanvasEditResult } from "@/lib/coworker-presence-content";
import type { CoworkerCanvasTargetResolver } from "@/lib/coworker-presence-content";
import { resolveCoworkerPresenceView } from "@/lib/coworker-presence-state";
import type { CoworkerPromptPresetMode } from "@/lib/coworker-prompt-presets";
import { useCoworkerConversation } from "@/lib/use-coworker-conversation";
import {
  createInitialCoworkerWorkspaceSurface,
  createCoworkerWorkspacePresentationKey,
  reduceCoworkerWorkspaceSurface,
  resolveCoworkerPrimaryArtifact,
  resolveCoworkerWorkspaceAttention,
  type CoworkerComposerPurpose,
  type CoworkerWorkspaceSurface
} from "@/lib/coworker-workspace-view";

import { CoworkerActivityLog } from "./coworker-activity-log";
import { COWORKER_COMPOSER_MESSAGE_ID } from "./coworker-composer";
import type { CoworkerControlState } from "./coworker-control-state";
import { CoworkerPresenceStage } from "./coworker-presence-stage";

const COWORKER_WORKSPACE_ID = "coworker-workspace";
const COWORKER_ENTRY_ID = "coworker-entry";
const COWORKER_ACTIVITY_LOG_ID = "coworker-activity-log";

/**
 * 在场式 Coworker 的编排边界。业务 controller 永远挂载，收起任何 UI 都不会停止任务。
 */
export function CoworkerConversationWindow({
  roomId,
  coworker,
  syncOnline,
  hasCanvasContent,
  getCanvasViewport,
  resolveCanvasTarget,
  onLocateResult
}: {
  /** 当前协同房间 ID。 */
  roomId: string;
  /** 当前 room 的 coworker 生命周期状态和控制动作。 */
  coworker: CoworkerControlState;
  /** tldraw 是否与当前协作房间保持在线同步。 */
  syncOnline: boolean;
  /** 从当前 tldraw document 即时判断是否至少存在一个 shape。 */
  hasCanvasContent?: (() => boolean) | undefined;
  /** 发送消息时读取用户当前画布可视区。 */
  getCanvasViewport?: () => DrawlessCanvasViewportContext | null;
  /** 从当前 tldraw document 即时读取审批所引用的对象。 */
  resolveCanvasTarget?: CoworkerCanvasTargetResolver | undefined;
  /** 在 tldraw 中定位工具真实返回的 record IDs。 */
  onLocateResult?: ((recordIds: string[]) => void) | undefined;
}) {
  const [surface, dispatchSurface] = useReducer(
    reduceCoworkerWorkspaceSurface,
    createInitialCoworkerWorkspaceSurface()
  );
  const [entryHovered, setEntryHovered] = useState(false);
  const [entryFocused, setEntryFocused] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [acknowledgedPresentationKey, setAcknowledgedPresentationKey] =
    useState<string | null>(null);
  const [handoff, setHandoff] = useState<{
    id: number;
    text: string;
  } | null>(null);
  const [promptPresetMode, setPromptPresetMode] =
    useState<CoworkerPromptPresetMode>("empty-canvas");
  const handoffSequenceRef = useRef(0);
  const handoffTimerRef = useRef<number | null>(null);
  const lastAutoOpenedPresentationKeyRef = useRef<string | null>(null);
  const promptArrivalPresentedRef = useRef(false);
  const conversation = useCoworkerConversation({ roomId, getCanvasViewport });
  const presence = resolveCoworkerPresenceView({
    status: conversation.status,
    turns: conversation.turns,
    inputFocused: surface.kind === "composer" && inputFocused
  });
  const avatarMode = resolveCoworkerAvatarMode({
    conversationStatus: conversation.status,
    inputFocused: surface.kind === "composer" && inputFocused,
    entryEngaged: entryHovered || entryFocused
  });
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
  const presentationKey = createCoworkerWorkspacePresentationKey({
    phase: presence.phase,
    turnId: presence.activeTurn?.id ?? null,
    approvalId: pendingApproval?.approval.id ?? null,
    hasText: Boolean(presence.latestText),
    hasCanvasResult: Boolean(result)
  });
  const attention = resolveCoworkerWorkspaceAttention({
    phase: presence.phase,
    hasPendingApproval: Boolean(pendingApproval),
    hasText: Boolean(presence.latestText),
    hasCanvasResult: Boolean(result),
    acknowledged:
      presentationKey === null ||
      acknowledgedPresentationKey === presentationKey
  });
  const currentArtifact = resolveCoworkerPrimaryArtifact({
    phase: presence.phase,
    hasHandoff: Boolean(handoff),
    hasPendingApproval: Boolean(pendingApproval),
    hasText: Boolean(presence.latestText),
    hasCanvasResult: Boolean(result),
    surface: { kind: "current" }
  });

  const acknowledgeCurrentPresentation = () => {
    if (presentationKey) {
      setAcknowledgedPresentationKey(presentationKey);
    }
  };

  const openComposer = (purpose: CoworkerComposerPurpose = "open") => {
    acknowledgeCurrentPresentation();
    dispatchSurface({ type: "open-composer", purpose });
    window.requestAnimationFrame(() => {
      document.getElementById(COWORKER_COMPOSER_MESSAGE_ID)?.focus();
    });
  };

  const closeSurface = () => {
    acknowledgeCurrentPresentation();
    setInputFocused(false);
    dispatchSurface({ type: "close" });
    window.requestAnimationFrame(() => {
      document.getElementById(COWORKER_ENTRY_ID)?.focus();
    });
  };

  const closeActivityLog = () => {
    acknowledgeCurrentPresentation();
    dispatchSurface({ type: "close" });
    window.requestAnimationFrame(() => {
      document.getElementById(`${COWORKER_ACTIVITY_LOG_ID}-trigger`)?.focus();
    });
  };

  const toggleWorkspace = () => {
    if (surface.kind !== "closed") {
      closeSurface();
      return;
    }
    if (currentArtifact.kind === "none") {
      openComposer();
      return;
    }
    dispatchSurface({ type: "show-current" });
  };

  useEffect(() => {
    setInputFocused(false);
    setAcknowledgedPresentationKey(null);
    setPromptPresetMode("empty-canvas");
    lastAutoOpenedPresentationKeyRef.current = null;
    promptArrivalPresentedRef.current = false;
    dispatchSurface({ type: "open-composer" });

    return () => {
      if (handoffTimerRef.current !== null) {
        window.clearTimeout(handoffTimerRef.current);
      }
    };
  }, [roomId]);

  useEffect(() => {
    if (
      !online ||
      promptArrivalPresentedRef.current ||
      conversation.turns.length > 0 ||
      conversation.message.trim()
    ) {
      return;
    }

    promptArrivalPresentedRef.current = true;
    setInputFocused(false);
    setPromptPresetMode(
      hasCanvasContent?.() ? "canvas-context" : "empty-canvas"
    );
    dispatchSurface({ type: "show-prompts" });
  }, [
    conversation.message,
    conversation.turns.length,
    hasCanvasContent,
    online
  ]);

  useEffect(() => {
    if (surface.kind === "closed") {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (surface.kind === "activity") {
          closeActivityLog();
          return;
        }
        closeSurface();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [presentationKey, surface.kind]);

  useEffect(() => {
    if (
      !presentationKey ||
      lastAutoOpenedPresentationKeyRef.current === presentationKey
    ) {
      return;
    }

    if (surface.kind === "composer" && presentationKey.startsWith("reply:")) {
      // 调整方案时保留用户正在输入的 composer，不让旧回应重新抢占表面。
      lastAutoOpenedPresentationKeyRef.current = presentationKey;
      return;
    }

    lastAutoOpenedPresentationKeyRef.current = presentationKey;
    setAcknowledgedPresentationKey(null);
    dispatchSurface({ type: "show-current" });
  }, [presentationKey, surface.kind]);

  useEffect(() => {
    if (!pendingApproval || surface.kind !== "activity") {
      return;
    }

    // 审批是需要用户立即判断的工作节点，优先于回看协作往来。
    dispatchSurface({ type: "show-current" });
  }, [pendingApproval, surface.kind]);

  const join = () => {
    if (!syncOnline) {
      return;
    }
    void coworker.start({
      // 新的在场入口已经承担入场引导，避免旧 cursor chat 与沟通面板重叠。
      sendIntroCursorChat: false,
      timeoutMs: 10_000,
      waitUntilLoaded: true
    });
  };

  const sendMessage = (messageOverride?: string) => {
    if (!syncOnline) {
      return Promise.resolve();
    }
    const submittedMessage = (
      messageOverride ?? conversation.message
    ).trim();
    const shouldAnimateHandoff = Boolean(submittedMessage) && !conversation.busy;
    // 请求立即开始；Composer 让位给当前工作物件，让交接和执行状态保持在同一处。
    const request = conversation.sendMessage(messageOverride);
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
    dispatchSurface({ type: "show-current" });
    return request;
  };

  const locateResult = (recordIds: string[]) => {
    acknowledgeCurrentPresentation();
    setInputFocused(false);
    dispatchSurface({ type: "close" });
    onLocateResult?.(recordIds);
  };

  return (
    <div
      className="coworker-conversation-surface coworker-presence-surface"
      data-expanded={surface.kind !== "closed"}
      data-mode={avatarMode}
      data-phase={presence.phase}
      data-surface={surface.kind}
    >
      <LiquidGlassProvider>
        <CoworkerPresenceStage
          activityLogId={COWORKER_ACTIVITY_LOG_ID}
          attentionLabel={
            attention.kind === "none" ? null : attention.label
          }
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
          resultOutcome={result?.outcome ?? null}
          entryId={COWORKER_ENTRY_ID}
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
          onCloseActivity={closeActivityLog}
          onCloseSurface={closeSurface}
          onComposerFocusChange={setInputFocused}
          onDismissPrompts={closeSurface}
          onInvokePrompt={(prompt) => sendMessage(prompt)}
          onJoin={join}
          onInspectApprovalTargets={onLocateResult}
          onLocateResult={onLocateResult ? locateResult : undefined}
          onMessageChange={conversation.setMessage}
          onOpenComposer={() => openComposer()}
          onRequestApprovalAdjustment={async ({ turn, approval }) => {
            if (!syncOnline) {
              return false;
            }
            const planReleased = await conversation.resolveToolApproval(
              turn,
              approval,
              "decline"
            );
            if (planReleased) {
              openComposer("plan-adjustment");
            }
            return planReleased;
          }}
          onRequestDeliveryFeedback={() => openComposer("delivery-feedback")}
          onResolveApproval={(turn, approval, decision) =>
            syncOnline
              ? conversation.resolveToolApproval(turn, approval, decision)
              : Promise.resolve(false)
          }
          onSend={sendMessage}
          onShowActivity={() => {
            acknowledgeCurrentPresentation();
            dispatchSurface({ type: "show-activity" });
          }}
          onShowDelivery={() => {
            acknowledgeCurrentPresentation();
            dispatchSurface({ type: "show-delivery" });
          }}
          onToggleWorkspace={toggleWorkspace}
          online={online}
          pendingApproval={pendingApproval}
          phase={presence.phase}
          promptPresetMode={promptPresetMode}
          resultRecordIds={result?.recordIds ?? []}
          resultWarnings={result?.warnings ?? []}
          resolveCanvasTarget={resolveCanvasTarget}
          sendDisabled={conversation.busy || !syncOnline}
          statusText={presence.statusText}
          surface={surface}
          syncOnline={syncOnline}
          workspaceId={COWORKER_WORKSPACE_ID}
        />

        <CoworkerActivityLog
          id={COWORKER_ACTIVITY_LOG_ID}
          onClose={closeActivityLog}
          open={surface.kind === "activity"}
          turns={conversation.turns}
        />
      </LiquidGlassProvider>
    </div>
  );
}
