import type { CoworkerPresencePhase } from "./coworker-presence-state";

export type CoworkerComposerPurpose =
  | "open"
  | "plan-adjustment"
  | "delivery-feedback";

/**
 * 用户当前展开的唯一工作表面。
 * 这里只保存展示意图，不表示 Drew 的业务阶段，也不复制 conversation 事实。
 */
export type CoworkerWorkspaceSurface =
  | { kind: "closed" }
  | { kind: "current" }
  | { kind: "prompts" }
  | { kind: "composer"; purpose: CoworkerComposerPurpose }
  | { kind: "delivery" }
  | { kind: "activity" };

export type CoworkerWorkspaceAction =
  | { type: "show-current" }
  | { type: "show-prompts" }
  | { type: "open-composer"; purpose?: CoworkerComposerPurpose }
  | { type: "show-delivery" }
  | { type: "show-activity" }
  | { type: "close" };

export type CoworkerWorkspaceAttention =
  | { kind: "none" }
  | { kind: "reply"; label: "有新回应" }
  | { kind: "approval"; label: "等你确认" }
  | { kind: "delivery"; label: "有新交付" };

/**
 * 人物旁唯一主物件的纯派生结果。
 * 组件不能直接保存或修改这个值，避免形成第二套工作状态。
 */
export type CoworkerPrimaryArtifact =
  | { kind: "none" }
  | { kind: "handoff" }
  | { kind: "thought" }
  | { kind: "approval" }
  | { kind: "dialogue" }
  | { kind: "issue" }
  | { kind: "delivery-preview" }
  | { kind: "delivery" };

/**
 * 每次进入 room 都先打开 Drew 的沟通入口。
 * Drew 尚未在线时，同一表面会展示加入画布确认，不引入额外业务状态。
 */
export function createInitialCoworkerWorkspaceSurface(): CoworkerWorkspaceSurface {
  return { kind: "composer", purpose: "open" };
}

export function reduceCoworkerWorkspaceSurface(
  _current: CoworkerWorkspaceSurface,
  action: CoworkerWorkspaceAction
): CoworkerWorkspaceSurface {
  if (action.type === "show-current") {
    return { kind: "current" };
  }
  if (action.type === "show-prompts") {
    return { kind: "prompts" };
  }
  if (action.type === "open-composer") {
    return { kind: "composer", purpose: action.purpose ?? "open" };
  }
  if (action.type === "show-delivery") {
    return { kind: "delivery" };
  }
  if (action.type === "show-activity") {
    return { kind: "activity" };
  }
  return { kind: "closed" };
}

/**
 * 根据真实工作阶段选择人物身旁唯一的主物件。
 * 辅助表面只控制展开意图，不复制或改写业务状态。
 */
export function resolveCoworkerPrimaryArtifact(input: {
  phase: CoworkerPresencePhase;
  hasHandoff: boolean;
  hasPendingApproval: boolean;
  hasText: boolean;
  hasCanvasResult: boolean;
  surface: CoworkerWorkspaceSurface;
}): CoworkerPrimaryArtifact {
  if (input.surface.kind === "closed" || input.surface.kind === "activity") {
    return { kind: "none" };
  }
  if (
    input.surface.kind === "composer" ||
    input.surface.kind === "prompts"
  ) {
    return { kind: "none" };
  }
  if (input.hasPendingApproval) {
    return { kind: "approval" };
  }
  if (input.hasHandoff) {
    return { kind: "handoff" };
  }
  if (
    input.phase === "receiving" ||
    input.phase === "thinking" ||
    input.phase === "executing"
  ) {
    return { kind: "thought" };
  }
  if (input.phase === "error" || input.phase === "interrupted") {
    return input.hasText ? { kind: "issue" } : { kind: "none" };
  }
  if (!input.hasText && !input.hasCanvasResult) {
    return { kind: "none" };
  }
  if (input.hasCanvasResult) {
    return input.surface.kind === "delivery"
      ? { kind: "delivery" }
      : { kind: "delivery-preview" };
  }
  return { kind: "dialogue" };
}

/**
 * 根据当前工作事实和用户是否已经收起当前呈现，派生人物入口需要保留的注意力提示。
 */
export function resolveCoworkerWorkspaceAttention(input: {
  phase: CoworkerPresencePhase;
  hasPendingApproval: boolean;
  hasText: boolean;
  hasCanvasResult: boolean;
  acknowledged: boolean;
}): CoworkerWorkspaceAttention {
  if (input.hasPendingApproval) {
    return { kind: "approval", label: "等你确认" };
  }
  if (input.acknowledged) {
    return { kind: "none" };
  }
  if (input.phase === "completed" && input.hasCanvasResult) {
    return { kind: "delivery", label: "有新交付" };
  }
  if (
    input.hasText &&
    (input.phase === "completed" ||
      input.phase === "interrupted" ||
      input.phase === "error")
  ) {
    return { kind: "reply", label: "有新回应" };
  }
  return { kind: "none" };
}

/**
 * 为一项需要用户注意的新事实生成稳定键，避免同一结果被反复自动展开。
 */
export function createCoworkerWorkspacePresentationKey(input: {
  phase: CoworkerPresencePhase;
  turnId: string | null;
  approvalId: string | null;
  hasText: boolean;
  hasCanvasResult: boolean;
}): string | null {
  if (input.approvalId) {
    return `approval:${input.approvalId}`;
  }
  if (!input.turnId) {
    return null;
  }
  if (input.phase === "completed" && input.hasCanvasResult) {
    return `delivery:${input.turnId}`;
  }
  if (
    input.hasText &&
    (input.phase === "completed" ||
      input.phase === "interrupted" ||
      input.phase === "error")
  ) {
    return `reply:${input.turnId}`;
  }
  return null;
}
