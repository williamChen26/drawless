import type { CoworkerConversationStatus } from "./coworker-conversation-state";
import { DRAWLESS_COWORKER_DISPLAY_NAME } from "@drawless/shared";

export type CoworkerAvatarMode =
  | "idle"
  | "hover"
  | "listening"
  | "working"
  | "awaiting-approval";

export type ResolveCoworkerAvatarModeInput = {
  /** 当前会话的业务运行状态。 */
  conversationStatus: CoworkerConversationStatus;
  /** 输入框当前是否获得焦点。 */
  inputFocused: boolean;
  /** 人物入口当前是否处于 hover 或键盘 focus。 */
  entryEngaged: boolean;
};

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
