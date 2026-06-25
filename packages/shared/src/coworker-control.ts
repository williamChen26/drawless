import { z } from "zod";

import { roomIdSchema, sessionIdSchema } from "./identity.js";
import type { DrawlessRoomId, DrawlessSessionId } from "./identity.js";

export const COWORKER_SESSION_PREFIX = "coworker:";

/**
 * coworker 进入协同房间时使用的稳定身份。
 */
export interface DrawlessCoworkerIdentity {
  /** coworker 所在的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** coworker 连接 tldraw sync room 时使用的会话 ID。 */
  sessionId: DrawlessSessionId;
  /** coworker 在协同 presence 中展示的名称。 */
  displayName: string;
  /** coworker 在协同 presence 中展示的颜色。 */
  color: string;
  /** coworker 当前运行实例 ID，用于排查多实例重复进入同一房间。 */
  instanceId: string;
}

/**
 * coworker room client 在控制面中暴露的生命周期状态。
 */
export type DrawlessCoworkerRoomSessionStatus =
  | "not_started"
  | "starting"
  | "online"
  | "offline"
  | "error"
  | "stopped";

/**
 * server 请求 coworker 加入指定 room 时使用的参数。
 */
export interface DrawlessCoworkerStartRequest {
  /** drawless server 的 HTTP 或 WebSocket 基础地址。 */
  serverUrl: string;
  /** coworker 当前运行实例 ID；不传时由 coworker 自动生成。 */
  instanceId?: string | undefined;
  /** coworker 在协同身份中展示的名称；不传时使用默认名称。 */
  displayName?: string | undefined;
  /** coworker 在协同身份中展示的颜色；不传时使用默认颜色。 */
  color?: string | undefined;
  /** 是否等待 coworker 完成首次 room hydration 后再返回。 */
  waitUntilLoaded: boolean;
  /** 等待首次 room hydration 的超时时间，单位毫秒。 */
  timeoutMs: number;
  /** 是否在成功进入协同后主动发送入场 cursor chat 引导。 */
  sendIntroCursorChat: boolean;
}

/**
 * web 或 server API 请求启动 coworker 时允许传入的可控参数。
 */
export interface DrawlessServerCoworkerStartRequest {
  /** coworker 当前运行实例 ID；不传时由 coworker 自动生成。 */
  instanceId?: string | undefined;
  /** coworker 在协同身份中展示的名称；不传时使用默认名称。 */
  displayName?: string | undefined;
  /** coworker 在协同身份中展示的颜色；不传时使用默认颜色。 */
  color?: string | undefined;
  /** 是否等待 coworker 完成首次 room hydration 后再返回；不传时由 server 决定默认值。 */
  waitUntilLoaded?: boolean | undefined;
  /** 等待首次 room hydration 的超时时间，单位毫秒；不传时由 server 决定默认值。 */
  timeoutMs?: number | undefined;
  /** 是否在成功进入协同后主动发送入场 cursor chat 引导。 */
  sendIntroCursorChat?: boolean | undefined;
}

/**
 * server 调用 coworker Mastra custom API 时使用的控制面配置。
 */
export interface DrawlessCoworkerControlConfig {
  /** 当前 server 是否允许通过控制面启动或停止 coworker。 */
  enabled: boolean;
  /** coworker Mastra 服务的 HTTP 基础地址；未启用时为 null。 */
  baseUrl: string | null;
  /** coworker 连接 drawless sync room 时使用的 server 基础地址。 */
  serverUrl: string;
  /** server 调用 coworker 控制面的超时时间，单位毫秒。 */
  requestTimeoutMs: number;
}

/**
 * coworker 从本地 TLStore 派生出的轻量 room 快照。
 */
export interface DrawlessCoworkerRoomSnapshotSummary {
  /** coworker 所在的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** coworker 当前 sync session ID。 */
  sessionId: DrawlessSessionId;
  /** 当前 store 中的 record 总数。 */
  recordCount: number;
  /** 当前 store 中的 document record 数量。 */
  documentRecordCount: number;
  /** 当前 store 中的 shape record 数量。 */
  shapeCount: number;
  /** 当前 store 中的 presence record 数量。 */
  presenceCount: number;
  /** 快照生成时间，使用 ISO 字符串。 */
  capturedAt: string;
}

/**
 * coworker 控制面返回的 room session 状态。
 */
export interface DrawlessCoworkerRoomStatusResponse {
  /** 状态所属的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 当前 room 是否存在可用的 coworker session。 */
  active: boolean;
  /** coworker room session 当前状态。 */
  status: DrawlessCoworkerRoomSessionStatus;
  /** coworker 当前身份；未启动时为 null。 */
  identity: DrawlessCoworkerIdentity | null;
  /** coworker 最近一次轻量 store 快照；未启动或尚未加载时为 null。 */
  snapshot: DrawlessCoworkerRoomSnapshotSummary | null;
  /** 最近一次错误信息；没有错误时为 null。 */
  lastError: string | null;
  /** coworker session 启动时间，使用 ISO 字符串；未启动时为 null。 */
  startedAt: string | null;
  /** coworker session 最近更新时间，使用 ISO 字符串；未启动时为 null。 */
  updatedAt: string | null;
}

/**
 * coworker 控制面停止 room session 后返回的状态。
 */
export interface DrawlessCoworkerStopResponse {
  /** 停止操作所属的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 本次请求是否关闭了已有 coworker session。 */
  stopped: boolean;
  /** 停止后的 coworker room session 状态。 */
  status: DrawlessCoworkerRoomSessionStatus;
}

export const coworkerSessionIdSchema = sessionIdSchema.refine(
  (value) => value.startsWith(COWORKER_SESSION_PREFIX),
  `Coworker session id must start with ${COWORKER_SESSION_PREFIX}.`
);

export const coworkerIdentitySchema = z.object({
  roomId: roomIdSchema,
  sessionId: coworkerSessionIdSchema,
  displayName: z.string().trim().min(1),
  color: z.string().trim().min(1),
  instanceId: z.string().trim().min(1)
}) satisfies z.ZodType<DrawlessCoworkerIdentity>;

export const coworkerRoomSessionStatusSchema = z.enum([
  "not_started",
  "starting",
  "online",
  "offline",
  "error",
  "stopped"
]);

const serverUrlSchema = z
  .string()
  .trim()
  .min(1, "Server url cannot be empty.")
  .refine((value) => {
    try {
      const url = new URL(value);
      return ["http:", "https:", "ws:", "wss:"].includes(url.protocol);
    } catch {
      return false;
    }
  }, "Server url must use http, https, ws, or wss protocol.");

export const coworkerStartRequestSchema = z.object({
  serverUrl: serverUrlSchema,
  instanceId: z.string().trim().min(1).optional(),
  displayName: z.string().trim().min(1).optional(),
  color: z.string().trim().min(1).optional(),
  waitUntilLoaded: z.boolean().default(true),
  timeoutMs: z.number().int().min(500).max(30_000).default(8_000),
  sendIntroCursorChat: z.boolean().default(false)
}) satisfies z.ZodType<DrawlessCoworkerStartRequest>;

export const coworkerControlConfigSchema = z.object({
  enabled: z.boolean(),
  baseUrl: serverUrlSchema.nullable(),
  serverUrl: serverUrlSchema,
  requestTimeoutMs: z.number().int().min(500).max(60_000)
}) satisfies z.ZodType<DrawlessCoworkerControlConfig>;

export const serverCoworkerStartRequestSchema = z.object({
  instanceId: z.string().trim().min(1).optional(),
  displayName: z.string().trim().min(1).optional(),
  color: z.string().trim().min(1).optional(),
  waitUntilLoaded: z.boolean().optional(),
  timeoutMs: z.number().int().min(500).max(30_000).optional(),
  sendIntroCursorChat: z.boolean().optional()
}) satisfies z.ZodType<DrawlessServerCoworkerStartRequest>;

export const coworkerRoomSnapshotSummarySchema = z.object({
  roomId: roomIdSchema,
  sessionId: coworkerSessionIdSchema,
  recordCount: z.number().int().min(0),
  documentRecordCount: z.number().int().min(0),
  shapeCount: z.number().int().min(0),
  presenceCount: z.number().int().min(0),
  capturedAt: z.string().datetime()
}) satisfies z.ZodType<DrawlessCoworkerRoomSnapshotSummary>;

export const coworkerRoomStatusResponseSchema = z.object({
  roomId: roomIdSchema,
  active: z.boolean(),
  status: coworkerRoomSessionStatusSchema,
  identity: coworkerIdentitySchema.nullable(),
  snapshot: coworkerRoomSnapshotSummarySchema.nullable(),
  lastError: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime().nullable()
}) satisfies z.ZodType<DrawlessCoworkerRoomStatusResponse>;

export const coworkerStopResponseSchema = z.object({
  roomId: roomIdSchema,
  stopped: z.boolean(),
  status: coworkerRoomSessionStatusSchema
}) satisfies z.ZodType<DrawlessCoworkerStopResponse>;

export function createDrawlessCoworkerSessionId(input: {
  roomId: DrawlessRoomId;
  instanceId: string;
}): DrawlessSessionId {
  return `${COWORKER_SESSION_PREFIX}${input.roomId}:${input.instanceId}`;
}

export function parseDrawlessCoworkerSessionId(
  input: unknown
): { ok: true; value: DrawlessSessionId } | { ok: false; reason: string } {
  const result = coworkerSessionIdSchema.safeParse(input);
  return result.success
    ? { ok: true, value: result.data }
    : {
        ok: false,
        reason:
          result.error.issues[0]?.message ?? "Invalid coworker session id."
      };
}
