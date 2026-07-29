import { randomUUID } from "node:crypto";

import {
  coworkerApprovalRequestSchema,
  type DrawlessCoworkerApprovalAuditEvent,
  type DrawlessCoworkerApprovalRequest,
  type DrawlessCoworkerApprovalSnapshot,
  type DrawlessCoworkerApprovalStatus,
  type DrawlessRoomId
} from "@drawless/shared";

export type CoworkerRuntimeApprovalReference = {
  /** 审批所属的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** Coworker runtime 的 agent run ID。 */
  runId: string;
  /** Coworker runtime 的 tool call ID。 */
  toolCallId: string;
};

export type CoworkerApprovalRegistration = CoworkerRuntimeApprovalReference & {
  /** 已用于同一条公开工具事件流的 ID；未提供时由 registry 创建。 */
  id?: string | undefined;
  /** 面向产品层的能力标识。 */
  capability: string;
  /** 本次能力调用的风险类别。 */
  risk: DrawlessCoworkerApprovalRequest["risk"];
  /** 供能力展示器校验和呈现的结构化提案。 */
  proposal: unknown;
};

export type CoworkerApprovalLease = {
  /** 面向 Web 的审批请求。 */
  approval: DrawlessCoworkerApprovalRequest;
  /** 仅供 server 调用 Coworker runtime 的内部引用。 */
  runtime: CoworkerRuntimeApprovalReference;
};

type CoworkerApprovalEntry = CoworkerApprovalLease & {
  /** 当前审批在 server 内的处理状态。 */
  status: DrawlessCoworkerApprovalStatus;
  /** 当前审批已经接受的决定。 */
  decision: "approve" | "decline" | null;
  /** 最近一次状态变化的 ISO 时间。 */
  updatedAt: string;
  /** Coworker runtime 成功接受审批决定的 ISO 时间；尚未完成时为空。 */
  resolvedAt: string | null;
  /** 按发生顺序保留的审批审计事件。 */
  audit: DrawlessCoworkerApprovalAuditEvent[];
  /** 该内存记录失效的毫秒时间戳。 */
  expiresAt: number;
};

export type CoworkerApprovalAcquireResult =
  | { ok: true; lease: CoworkerApprovalLease }
  | {
      ok: false;
      reason: "not-found" | "room-mismatch" | "resolving" | "resolved";
    };

export type CoworkerApprovalRegistry = {
  /** 登记 runtime 审批并返回稳定的公开审批请求。 */
  register: (
    input: CoworkerApprovalRegistration
  ) => DrawlessCoworkerApprovalRequest;
  /** 原子占用待处理审批，阻止重复提交。 */
  acquire: (
    roomId: DrawlessRoomId,
    approvalId: string,
    decision: "approve" | "decline"
  ) => CoworkerApprovalAcquireResult;
  /** 完成或回滚一次审批占用。 */
  settle: (
    approvalId: string,
    result: {
      /** Coworker runtime 是否接受本次解析。 */
      succeeded: boolean;
      /** 解析失败时记录的安全错误信息。 */
      error?: string | undefined;
    }
  ) => void;
  /** 查询 room 内不包含 runtime 标识的审批生命周期快照。 */
  list: (
    roomId: DrawlessRoomId,
    status?: DrawlessCoworkerApprovalStatus | undefined
  ) => DrawlessCoworkerApprovalSnapshot[];
};

export function createCoworkerApprovalRegistry(input?: {
  /** 测试可注入的 ID 工厂。 */
  createId?: (() => string) | undefined;
  /** 测试可注入的当前时间。 */
  now?: (() => number) | undefined;
  /** 审批内存记录的存活时间。 */
  ttlMs?: number | undefined;
  /** 单进程最多保留的审批记录数。 */
  maxEntries?: number | undefined;
}): CoworkerApprovalRegistry {
  const entries = new Map<string, CoworkerApprovalEntry>();
  const approvalIdByRuntime = new Map<string, string>();
  const createId = input?.createId ?? randomUUID;
  const now = input?.now ?? Date.now;
  const ttlMs = input?.ttlMs ?? 30 * 60 * 1_000;
  const maxEntries = Math.max(1, input?.maxEntries ?? 1_000);

  const removeEntry = (approvalId: string, entry: CoworkerApprovalEntry) => {
    entries.delete(approvalId);
    approvalIdByRuntime.delete(createRuntimeKey(entry.runtime));
  };

  const pruneExpiredEntries = () => {
    const currentTime = now();
    for (const [approvalId, entry] of entries) {
      if (entry.expiresAt <= currentTime && entry.status !== "resolving") {
        removeEntry(approvalId, entry);
      }
    }
  };

  const enforceCapacity = (protectedApprovalId: string) => {
    while (entries.size > maxEntries) {
      const removable = Array.from(entries.entries()).find(
        ([approvalId, entry]) =>
          approvalId !== protectedApprovalId && entry.status !== "resolving"
      );
      if (!removable) {
        return;
      }
      removeEntry(removable[0], removable[1]);
    }
  };

  return {
    register(registration) {
      pruneExpiredEntries();
      const runtimeKey = createRuntimeKey(registration);
      const existingId = approvalIdByRuntime.get(runtimeKey);
      const existing = existingId ? entries.get(existingId) : null;
      if (existing) {
        return existing.approval;
      }

      const currentTime = now();
      const requestedAt = new Date(currentTime).toISOString();
      const approvalId = registration.id ?? createId();
      if (entries.has(approvalId)) {
        throw new Error("Coworker approval id collision.");
      }
      const approval = coworkerApprovalRequestSchema.parse({
        id: approvalId,
        roomId: registration.roomId,
        capability: registration.capability,
        risk: registration.risk,
        proposal: registration.proposal,
        requestedAt
      });
      const runtime = {
        roomId: registration.roomId,
        runId: registration.runId,
        toolCallId: registration.toolCallId
      };
      entries.set(approval.id, {
        approval,
        runtime,
        status: "pending",
        decision: null,
        updatedAt: requestedAt,
        resolvedAt: null,
        audit: [
          {
            kind: "requested",
            occurredAt: requestedAt,
            decision: null,
            message: null
          }
        ],
        expiresAt: currentTime + ttlMs
      });
      approvalIdByRuntime.set(runtimeKey, approval.id);
      enforceCapacity(approval.id);
      return approval;
    },
    acquire(roomId, approvalId, decision) {
      pruneExpiredEntries();
      const entry = entries.get(approvalId);
      if (!entry) {
        return { ok: false, reason: "not-found" };
      }
      if (entry.approval.roomId !== roomId) {
        return { ok: false, reason: "room-mismatch" };
      }
      if (entry.status === "resolving") {
        return { ok: false, reason: "resolving" };
      }
      if (entry.status === "resolved") {
        return { ok: false, reason: "resolved" };
      }

      entry.status = "resolving";
      entry.decision = decision;
      const currentTime = now();
      entry.updatedAt = new Date(currentTime).toISOString();
      entry.audit = appendAuditEvent(entry.audit, {
        kind: "resolution-started",
        occurredAt: entry.updatedAt,
        decision,
        message: null
      });
      entry.expiresAt = currentTime + ttlMs;
      return {
        ok: true,
        lease: { approval: entry.approval, runtime: entry.runtime }
      };
    },
    settle(approvalId, result) {
      const entry = entries.get(approvalId);
      if (!entry || entry.status !== "resolving") {
        return;
      }

      const currentTime = now();
      const occurredAt = new Date(currentTime).toISOString();
      const attemptedDecision = entry.decision;
      entry.status = result.succeeded ? "resolved" : "pending";
      entry.updatedAt = occurredAt;
      entry.resolvedAt = result.succeeded ? occurredAt : null;
      entry.audit = appendAuditEvent(entry.audit, {
        kind: result.succeeded ? "resolved" : "resolution-failed",
        occurredAt,
        decision: attemptedDecision,
        message: result.succeeded
          ? null
          : normalizeAuditError(result.error ?? "Resolution failed.")
      });
      if (!result.succeeded) {
        entry.decision = null;
      }
      entry.expiresAt = currentTime + ttlMs;
    },
    list(roomId, status) {
      pruneExpiredEntries();
      return Array.from(entries.values())
        .filter(
          (entry) =>
            entry.approval.roomId === roomId &&
            (status === undefined || entry.status === status)
        )
        .map(createPublicSnapshot)
        .sort((left, right) =>
          left.approval.requestedAt.localeCompare(right.approval.requestedAt)
        );
    }
  };
}

function createRuntimeKey(runtime: CoworkerRuntimeApprovalReference) {
  return JSON.stringify([runtime.roomId, runtime.runId, runtime.toolCallId]);
}

function createPublicSnapshot(
  entry: CoworkerApprovalEntry
): DrawlessCoworkerApprovalSnapshot {
  return {
    approval: entry.approval,
    status: entry.status,
    decision: entry.decision,
    updatedAt: entry.updatedAt,
    resolvedAt: entry.resolvedAt,
    audit: entry.audit.map((event) => ({ ...event }))
  };
}

function appendAuditEvent(
  audit: DrawlessCoworkerApprovalAuditEvent[],
  event: DrawlessCoworkerApprovalAuditEvent
) {
  const next = [...audit, event];
  if (next.length <= MAX_APPROVAL_AUDIT_EVENTS) {
    return next;
  }
  return [next[0]!, ...next.slice(-(MAX_APPROVAL_AUDIT_EVENTS - 1))];
}

const MAX_APPROVAL_AUDIT_EVENTS = 32;

function normalizeAuditError(message: string) {
  const normalized = message.replace(/\s+/gu, " ").trim();
  return normalized.slice(0, MAX_APPROVAL_AUDIT_MESSAGE_LENGTH);
}

const MAX_APPROVAL_AUDIT_MESSAGE_LENGTH = 500;
