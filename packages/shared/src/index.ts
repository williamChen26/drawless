import { z } from "zod";

export const DRAWLESS_SYNC_ROUTE = "/sync";

export const ROOM_ID_MAX_LENGTH = 80;
export const SESSION_ID_MAX_LENGTH = 128;
export const COWORKER_SESSION_PREFIX = "coworker:";
export const roomIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
export const sessionIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;

/**
 * 可协作画布的房间 ID。它会出现在 URL、WebSocket 路径和后端房间注册表中。
 */
export type DrawlessRoomId = string;

/**
 * 单个浏览器标签页连接 tldraw 协同房间时使用的会话 ID。
 */
export type DrawlessSessionId = string;

/**
 * 前端连接后端协同服务所需的完整配置。
 */
export interface DrawlessSyncConfig {
  /** 规范化后的房间 ID。 */
  roomId: DrawlessRoomId;
  /** 规范化后的 WebSocket 协同房间地址。 */
  roomUri: string;
  /** 本次浏览器标签页的会话 ID。 */
  sessionId: DrawlessSessionId;
}

/**
 * 后端 Fastify 协同服务的启动配置。
 */
export interface DrawlessServerConfig {
  /** 服务监听的主机名或 IP。 */
  host: string;
  /** 服务监听端口。 */
  port: number;
  /** tldraw 协同 WebSocket 路由前缀。 */
  syncRoute: string;
  /** 允许访问协同服务的显式浏览器来源列表。 */
  allowedOrigins: string[];
}

/**
 * 后端进程内房间注册表的可观测摘要。
 */
export interface DrawlessRoomRegistryStats {
  /** 当前进程里已经初始化的房间数量。 */
  roomCount: number;
  /** 当前进程里已经初始化的房间 ID 列表。 */
  roomIds: DrawlessRoomId[];
}

/**
 * 后端当前使用的 tldraw 协同存储说明。
 */
export interface DrawlessStorageSummary {
  /** 存储后端类型。 */
  kind: "process-local-memory";
  /** 房间数据是否能跨进程重启保留。 */
  durable: boolean;
  /** 给开发者看的存储限制说明。 */
  note: string;
}

/**
 * `/health` 返回的轻量健康检查响应。
 */
export interface DrawlessHealthResponse {
  /** 健康检查是否成功。 */
  ok: true;
  /** 当前服务名。 */
  service: "@drawless/server";
  /** 当前运行模式。 */
  mode: "development";
  /** 当前协同存储类型。 */
  storage: DrawlessStorageSummary["kind"];
  /** 房间是否只保存在当前 Node 进程内。 */
  processLocal: true;
  /** WebSocket 协同路由模板。 */
  syncRoute: string;
}

/**
 * `/ready` 返回的协同服务就绪状态。
 */
export interface DrawlessReadyResponse {
  /** 请求是否成功。 */
  ok: true;
  /** 服务是否已准备接受协同连接。 */
  ready: true;
  /** 当前进程内房间注册表摘要。 */
  rooms: DrawlessRoomRegistryStats;
  /** 当前协同存储说明。 */
  storage: DrawlessStorageSummary;
}

/**
 * 为后续 AI 接入保留的房间级扩展点。当前项目不会启动 AI 功能，只统一类型入口。
 */
export interface DrawlessAiExtensionPoint {
  /** AI 功能是否已在当前房间启用。 */
  enabled: boolean;
  /** 未来接入的 AI 提供方名称；未启用时为 null。 */
  provider: string | null;
  /** 未来接入的模型名称；未启用时为 null。 */
  model: string | null;
  /** 最近一次 AI 配置更新时间；未配置时为 null。 */
  lastConfiguredAt: string | null;
}

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
 * coworker 在房间内的启用配置。
 */
export interface DrawlessCoworkerRoomConfig {
  /** 配置所属的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 当前房间是否启用 coworker。 */
  enabled: boolean;
  /** coworker 是否允许在用户进入房间后自动加入。 */
  autoJoin: boolean;
  /** coworker 当前允许的最高介入等级。 */
  maxInterventionLevel: DrawlessInterventionLevel;
}

/**
 * coworker 观察到的画布事件类型。
 */
export type DrawlessCanvasObservationKind =
  | "shape_created"
  | "shape_updated"
  | "shape_deleted"
  | "selection_changed"
  | "presence_updated"
  | "page_changed"
  | "unknown_change";

/**
 * 从 tldraw document 或协作者 presence 派生出的画布观察事件。
 */
export interface DrawlessCanvasObservationEvent {
  /** 事件所属的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 事件 ID，用于去重、排序和排查问题。 */
  eventId: string;
  /** 事件发生时间，使用 ISO 字符串。 */
  occurredAt: string;
  /** 触发事件的协作者会话 ID。 */
  actorSessionId: DrawlessSessionId;
  /** 观察事件的类型。 */
  kind: DrawlessCanvasObservationKind;
  /** 受影响的 tldraw record ID 列表。 */
  recordIds: string[];
  /** 给 coworker 快速理解的人类可读摘要。 */
  summary: string;
}

/**
 * coworker 判断介入时使用的画布焦点上下文。
 */
export interface DrawlessCanvasFocusContext {
  /** 用户当前选中的 tldraw record ID 列表。 */
  selectedRecordIds: string[];
  /** 最近发生变化的 tldraw record ID 列表。 */
  recentlyChangedRecordIds: string[];
  /** 当前视口内可见的 tldraw record ID 列表。 */
  viewportRecordIds: string[];
}

/**
 * 提供给 coworker 的画布语义摘要。
 */
export interface DrawlessCanvasSummary {
  /** 摘要所属的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 摘要生成时间，使用 ISO 字符串。 */
  capturedAt: string;
  /** 当前 page ID；无法确定时为 null。 */
  currentPageId: string | null;
  /** 从 tldraw records 派生出的人类可读摘要。 */
  summary: string;
  /** coworker 当前应该优先关注的画布上下文。 */
  focus: DrawlessCanvasFocusContext;
  /** 摘要覆盖的最近画布观察事件。 */
  recentEvents: DrawlessCanvasObservationEvent[];
}

/**
 * coworker 可以选择的介入等级。
 */
export type DrawlessInterventionLevel = "silent" | "suggest" | "propose_action";

/**
 * coworker 介入结果的类型。
 */
export type DrawlessCoworkerInterventionKind =
  | "message"
  | "question"
  | "operation_draft"
  | "canvas_operation";

/**
 * coworker 草拟的低风险画布操作类型。
 */
export type DrawlessCanvasOperationType =
  | "create_text"
  | "create_note"
  | "create_arrow"
  | "move_shape"
  | "update_text";

/**
 * coworker 提出的单个画布操作草案。
 */
export interface DrawlessCanvasOperationDraft {
  /** 草案中的操作类型。 */
  operationType: DrawlessCanvasOperationType;
  /** 这次操作想帮助用户完成的目标。 */
  intent: string;
  /** 操作目标对象或区域的文字描述。 */
  targetDescription: string;
  /** 为什么建议执行这次操作。 */
  rationale: string;
  /** 执行前是否必须获得用户确认。 */
  requiresUserConfirmation: boolean;
}

/**
 * coworker 对一次用户请求或画布变化给出的介入草案。
 */
export interface DrawlessCoworkerInterventionDraft {
  /** 草案 ID，用于确认、执行和排查问题。 */
  draftId: string;
  /** 草案所属的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 草案创建时间，使用 ISO 字符串。 */
  createdAt: string;
  /** coworker 建议采用的介入等级。 */
  level: DrawlessInterventionLevel;
  /** coworker 介入结果的类型。 */
  kind: DrawlessCoworkerInterventionKind;
  /** 建议展示给用户的自然语言内容。 */
  message: string;
  /** coworker 根据上下文提出的画布操作草案列表。 */
  operationDrafts: DrawlessCanvasOperationDraft[];
}

export const roomIdSchema = z
  .string()
  .trim()
  .min(1, "Room id cannot be empty.")
  .max(ROOM_ID_MAX_LENGTH, `Room id cannot exceed ${ROOM_ID_MAX_LENGTH} characters.`)
  .regex(
    roomIdPattern,
    "Room id may only contain letters, numbers, dots, underscores, and hyphens."
  );

export const sessionIdSchema = z
  .string()
  .trim()
  .min(1, "Session id cannot be empty.")
  .max(
    SESSION_ID_MAX_LENGTH,
    `Session id cannot exceed ${SESSION_ID_MAX_LENGTH} characters.`
  )
  .regex(
    sessionIdPattern,
    "Session id may only contain letters, numbers, dots, underscores, hyphens, and colons."
  );

export const coworkerSessionIdSchema = sessionIdSchema.refine(
  (value) => value.startsWith(COWORKER_SESSION_PREFIX),
  `Coworker session id must start with ${COWORKER_SESSION_PREFIX}.`
);

export const interventionLevelSchema = z.enum([
  "silent",
  "suggest",
  "propose_action"
]);

export const coworkerInterventionKindSchema = z.enum([
  "message",
  "question",
  "operation_draft",
  "canvas_operation"
]);

export const canvasObservationKindSchema = z.enum([
  "shape_created",
  "shape_updated",
  "shape_deleted",
  "selection_changed",
  "presence_updated",
  "page_changed",
  "unknown_change"
]);

export const canvasOperationTypeSchema = z.enum([
  "create_text",
  "create_note",
  "create_arrow",
  "move_shape",
  "update_text"
]);

export const coworkerIdentitySchema = z.object({
  roomId: roomIdSchema,
  sessionId: coworkerSessionIdSchema,
  displayName: z.string().trim().min(1),
  color: z.string().trim().min(1),
  instanceId: z.string().trim().min(1)
}) satisfies z.ZodType<DrawlessCoworkerIdentity>;

export const coworkerRoomConfigSchema = z.object({
  roomId: roomIdSchema,
  enabled: z.boolean(),
  autoJoin: z.boolean(),
  maxInterventionLevel: interventionLevelSchema
}) satisfies z.ZodType<DrawlessCoworkerRoomConfig>;

export const canvasObservationEventSchema = z.object({
  roomId: roomIdSchema,
  eventId: z.string().trim().min(1),
  occurredAt: z.string().datetime(),
  actorSessionId: sessionIdSchema,
  kind: canvasObservationKindSchema,
  recordIds: z.array(z.string().trim().min(1)),
  summary: z.string().trim().min(1)
}) satisfies z.ZodType<DrawlessCanvasObservationEvent>;

export const canvasFocusContextSchema = z.object({
  selectedRecordIds: z.array(z.string().trim().min(1)),
  recentlyChangedRecordIds: z.array(z.string().trim().min(1)),
  viewportRecordIds: z.array(z.string().trim().min(1))
}) satisfies z.ZodType<DrawlessCanvasFocusContext>;

export const canvasSummarySchema = z.object({
  roomId: roomIdSchema,
  capturedAt: z.string().datetime(),
  currentPageId: z.string().trim().min(1).nullable(),
  summary: z.string().trim().min(1),
  focus: canvasFocusContextSchema,
  recentEvents: z.array(canvasObservationEventSchema)
}) satisfies z.ZodType<DrawlessCanvasSummary>;

export const canvasOperationDraftSchema = z.object({
  operationType: canvasOperationTypeSchema,
  intent: z.string().trim().min(1),
  targetDescription: z.string().trim().min(1),
  rationale: z.string().trim().min(1),
  requiresUserConfirmation: z.boolean()
}) satisfies z.ZodType<DrawlessCanvasOperationDraft>;

export const coworkerInterventionDraftSchema = z.object({
  draftId: z.string().trim().min(1),
  roomId: roomIdSchema,
  createdAt: z.string().datetime(),
  level: interventionLevelSchema,
  kind: coworkerInterventionKindSchema,
  message: z.string().trim().min(1),
  operationDrafts: z.array(canvasOperationDraftSchema)
}) satisfies z.ZodType<DrawlessCoworkerInterventionDraft>;

export function parseDrawlessRoomId(
  input: unknown
): { ok: true; value: DrawlessRoomId } | { ok: false; reason: string } {
  const result = roomIdSchema.safeParse(input);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, reason: result.error.issues[0]?.message ?? "Invalid room id." };
}

export function parseDrawlessSessionId(
  input: unknown
): { ok: true; value: DrawlessSessionId } | { ok: false; reason: string } {
  const result = sessionIdSchema.safeParse(input);
  return result.success
    ? { ok: true, value: result.data }
    : {
        ok: false,
        reason: result.error.issues[0]?.message ?? "Invalid session id."
      };
}

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
