import type { CoworkerConversationStatus } from "./coworker-conversation-state";
import { DRAWLESS_COWORKER_DISPLAY_NAME } from "@drawless/shared";

export type CoworkerAvatarMode =
  | "idle"
  | "hover"
  | "listening"
  | "working"
  | "awaiting-approval";

export type CoworkerAvatarFrame = 1 | 2 | 5 | 6 | 7 | 8 | 9 | 10;

export type ResolveCoworkerAvatarModeInput = {
  /** 当前会话的业务运行状态。 */
  conversationStatus: CoworkerConversationStatus;
  /** 输入框当前是否获得焦点。 */
  inputFocused: boolean;
  /** 人物入口当前是否处于 hover 或键盘 focus。 */
  entryEngaged: boolean;
};

export const COWORKER_AVATAR_FRAME_PATHS = [
  "/coworker/avatar/frame-01.webp",
  "/coworker/avatar/frame-02.webp",
  "/coworker/avatar/frame-03.webp",
  "/coworker/avatar/frame-04.webp",
  "/coworker/avatar/frame-05.webp",
  "/coworker/avatar/frame-06.webp",
  "/coworker/avatar/frame-07.webp",
  "/coworker/avatar/frame-08.webp",
  "/coworker/avatar/frame-09.webp",
  "/coworker/avatar/frame-10.webp"
] as const;

export const COWORKER_POINTING_FRAME_PATH =
  "/coworker/avatar/pointing-right-v1.webp";

export const COWORKER_WORKING_FRAMES = [5, 6, 7] as const;
export const COWORKER_LISTENING_FRAMES = [8, 9, 10] as const;
export const COWORKER_WORKING_FRAME_INTERVAL_MS = 450;

/**
 * 只根据现有业务状态计算人物表现，不保存第二份派生状态。
 */
export function resolveCoworkerAvatarMode(
  input: ResolveCoworkerAvatarModeInput
): CoworkerAvatarMode {
  if (
    input.conversationStatus === "receiving" ||
    input.conversationStatus === "streaming"
  ) {
    return "working";
  }
  if (input.conversationStatus === "awaiting_approval") {
    return "awaiting-approval";
  }
  if (input.inputFocused) {
    return "listening";
  }
  if (input.entryEngaged) {
    return "hover";
  }
  return "idle";
}

export function getCoworkerAvatarFramePath(frame: CoworkerAvatarFrame) {
  return (
    COWORKER_AVATAR_FRAME_PATHS[frame - 1] ??
    COWORKER_AVATAR_FRAME_PATHS[0]
  );
}

export function getCoworkerAvatarLabel(mode: CoworkerAvatarMode) {
  if (mode === "working") {
    return "正在处理";
  }
  if (mode === "awaiting-approval") {
    return "等你确认";
  }
  if (mode === "listening") {
    return "我在听";
  }
  return `找 ${DRAWLESS_COWORKER_DISPLAY_NAME}`;
}

export function getNextWorkingFrame(
  currentFrame: CoworkerAvatarFrame
): CoworkerAvatarFrame {
  const currentIndex = COWORKER_WORKING_FRAMES.indexOf(
    currentFrame as (typeof COWORKER_WORKING_FRAMES)[number]
  );
  if (currentIndex < 0) {
    return COWORKER_WORKING_FRAMES[0];
  }
  return (
    COWORKER_WORKING_FRAMES[
      (currentIndex + 1) % COWORKER_WORKING_FRAMES.length
    ] ?? COWORKER_WORKING_FRAMES[0]
  );
}

export function pickNextListeningFrame(
  currentFrame: CoworkerAvatarFrame | null,
  random: () => number = Math.random
): CoworkerAvatarFrame {
  const candidates = COWORKER_LISTENING_FRAMES.filter(
    (frame) => frame !== currentFrame
  );
  const rawIndex = Math.floor(random() * candidates.length);
  const index = Math.min(Math.max(rawIndex, 0), candidates.length - 1);
  return candidates[index] ?? COWORKER_LISTENING_FRAMES[0];
}
