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
  /** server 调用 coworker 控制面的配置。 */
  coworker: DrawlessCoworkerControlConfig;
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
  /** coworker 是否允许在观察画布后主动通过 cursor chat 交流。 */
  allowProactiveCursorChat: boolean;
  /** coworker 是否允许在聊天中请求操作画布。 */
  allowCanvasOperationRequests: boolean;
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
 * 从 tldraw shape 派生出的画布包围盒。
 */
export interface DrawlessCanvasBounds {
  /** 包围盒左上角的 x 坐标。 */
  x: number;
  /** 包围盒左上角的 y 坐标。 */
  y: number;
  /** 包围盒宽度。 */
  w: number;
  /** 包围盒高度。 */
  h: number;
}

/**
 * coworker 理解画布节点时使用的粗粒度节点类型。
 */
export type DrawlessCanvasSemanticNodeKind =
  | "text"
  | "shape"
  | "arrow"
  | "frame"
  | "group"
  | "lane"
  | "unknown";

/**
 * 从 tldraw shape 派生出的语义节点。
 */
export interface DrawlessCanvasSemanticNode {
  /** 对应的 tldraw shape ID。 */
  id: string;
  /** coworker 用于理解画布语义的节点类型。 */
  kind: DrawlessCanvasSemanticNodeKind;
  /** tldraw 原始 shape type。 */
  shapeType: string;
  /** 从 shape props 中提取的文本；没有文本时为 null。 */
  text: string | null;
  /** 从 shape 位置和尺寸派生出的包围盒。 */
  bounds: DrawlessCanvasBounds;
  /** tldraw parentId，用于表达 page、frame、group 等层级关系。 */
  parentId: string;
  /** 节点所属 page ID；无法直接判断时为 null。 */
  pageId: string | null;
}

/**
 * 语义边的方向。
 */
export type DrawlessCanvasSemanticEdgeDirection =
  | "forward"
  | "reverse"
  | "bidirectional"
  | "unknown";

/**
 * 从箭头或连接关系派生出的语义边。
 */
export interface DrawlessCanvasSemanticEdge {
  /** 语义边 ID，通常复用对应的 arrow shape ID。 */
  id: string;
  /** 起点 shape ID；无法识别时为 null。 */
  fromId: string | null;
  /** 终点 shape ID；无法识别时为 null。 */
  toId: string | null;
  /** 箭头上的文本标签；没有标签时为 null。 */
  label: string | null;
  /** 连接方向。 */
  direction: DrawlessCanvasSemanticEdgeDirection;
  /** 产生这条语义边的 tldraw record ID。 */
  recordId: string;
}

/**
 * coworker 理解容器区域时使用的粗粒度区域类型。
 */
export type DrawlessCanvasSemanticRegionKind =
  | "frame"
  | "group"
  | "cluster"
  | "swimlane"
  | "unknown";

/**
 * 从 frame、group 或空间包含关系派生出的语义区域。
 */
export interface DrawlessCanvasSemanticRegion {
  /** 区域 ID，通常复用对应的容器 shape ID。 */
  id: string;
  /** coworker 用于理解区域语义的区域类型。 */
  kind: DrawlessCanvasSemanticRegionKind;
  /** 区域标题；没有标题时为 null。 */
  title: string | null;
  /** 区域在画布上的包围盒。 */
  bounds: DrawlessCanvasBounds;
  /** 当前判断属于该区域的 shape ID 列表。 */
  shapeIds: string[];
}

/**
 * 从 tldraw document 派生出的画布语义图。它只作为观察视图，不作为新的画布事实源。
 */
export interface DrawlessCanvasSemanticGraph {
  /** 语义图所属的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 语义图生成时间，使用 ISO 字符串。 */
  generatedAt: string;
  /** 当前 page ID；无法确定时为 null。 */
  currentPageId: string | null;
  /** 从 shape 派生出的语义节点列表。 */
  nodes: DrawlessCanvasSemanticNode[];
  /** 从箭头或绑定关系派生出的语义边列表。 */
  edges: DrawlessCanvasSemanticEdge[];
  /** 从 frame、group 或布局关系派生出的语义区域列表。 */
  regions: DrawlessCanvasSemanticRegion[];
}

/**
 * 用户和 coworker 交流时使用的聊天通道。
 */
export type DrawlessCoworkerChatChannel =
  | "cursor_chat"
  | "conversation_chat";

/**
 * 聊天消息的发送方。
 */
export type DrawlessCoworkerChatSender =
  | "user"
  | "coworker";

/**
 * 聊天消息在协作流程中的意图。
 */
export type DrawlessCoworkerChatIntent =
  | "message"
  | "question"
  | "operation_request"
  | "operation_permission";

/**
 * 用户或 coworker 在聊天通道中发送的一条消息。
 */
export interface DrawlessCoworkerChatMessage {
  /** 消息 ID，用于去重、排序和排查问题。 */
  messageId: string;
  /** 消息所属的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 消息发生在哪个聊天通道。 */
  channel: DrawlessCoworkerChatChannel;
  /** 消息发送方。 */
  sender: DrawlessCoworkerChatSender;
  /** 发送方的协同会话 ID。 */
  senderSessionId: DrawlessSessionId;
  /** 消息意图，用于区分普通聊天、提问、操作请求和用户允许。 */
  intent: DrawlessCoworkerChatIntent;
  /** 消息正文。 */
  text: string;
  /** 消息发生时间，使用 ISO 字符串。 */
  createdAt: string;
  /** 消息关联的画布上下文；没有上下文时为 null。 */
  canvasContext: DrawlessCanvasChatContext | null;
}

/**
 * 聊天消息发生时的画布上下文。
 */
export interface DrawlessCanvasChatContext {
  /** 当前 page ID；无法确定时为 null。 */
  currentPageId: string | null;
  /** 消息发送时用户或 coworker 关注的 tldraw record ID 列表。 */
  focusedRecordIds: string[];
  /** cursor chat 在画布上的位置；conversation chat 没有位置时为 null。 */
  cursor: DrawlessCanvasPoint | null;
  /** 消息发生时可用的画布摘要；没有摘要时为 null。 */
  summary: DrawlessCanvasSummary | null;
}

/**
 * 画布上的一个点。
 */
export interface DrawlessCanvasPoint {
  /** 画布坐标系中的 x 坐标。 */
  x: number;
  /** 画布坐标系中的 y 坐标。 */
  y: number;
}

/**
 * coworker 可以请求执行的低风险画布操作类型。
 */
export type DrawlessCanvasOperationType =
  | "create_text"
  | "create_note"
  | "create_arrow"
  | "move_shape"
  | "update_text";

/**
 * coworker 在聊天中提出的画布操作请求。
 */
export interface DrawlessCanvasOperationRequest {
  /** 操作请求 ID，用于用户允许和后续执行追踪。 */
  requestId: string;
  /** 请求所属的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 请求来自哪个聊天通道。 */
  channel: DrawlessCoworkerChatChannel;
  /** 请求关联的 coworker 消息 ID。 */
  messageId: string;
  /** 请求创建时间，使用 ISO 字符串。 */
  createdAt: string;
  /** coworker 想执行的低风险操作类型。 */
  operationType: DrawlessCanvasOperationType;
  /** coworker 用自然语言说明想做什么。 */
  description: string;
  /** 操作影响的目标对象或区域描述。 */
  targetDescription: string;
  /** 第一版只允许低风险操作。 */
  riskLevel: "low";
}

/**
 * 用户对 coworker 画布操作请求给出的明确允许。
 */
export interface DrawlessCanvasOperationPermission {
  /** 被允许的操作请求 ID。 */
  requestId: string;
  /** 允许所属的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 用户允许发生在哪个聊天通道。 */
  channel: DrawlessCoworkerChatChannel;
  /** 给出允许的用户 session ID。 */
  approvedBySessionId: DrawlessSessionId;
  /** 用户允许时对应的聊天消息 ID。 */
  approvedMessageId: string;
  /** 用户允许时的原始文本。 */
  approvedText: string;
  /** 允许发生时间，使用 ISO 字符串。 */
  approvedAt: string;
}

/**
 * conversation chat 请求 coworker 回复时使用的输入。
 */
export interface DrawlessCoworkerConversationRequest {
  /** 请求所属的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 用户发给 coworker 的聊天消息。 */
  userMessage: DrawlessCoworkerChatMessage;
  /** 当前画布摘要；没有摘要时为 null。 */
  canvasSummary: DrawlessCanvasSummary | null;
  /** 当前画布语义图；没有语义图时为 null。 */
  canvasSemanticGraph: DrawlessCanvasSemanticGraph | null;
}

/**
 * coworker 对 conversation chat 请求的回复。
 */
export interface DrawlessCoworkerConversationResponse {
  /** 回复所属的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** coworker 返回给用户的聊天消息。 */
  replyMessage: DrawlessCoworkerChatMessage;
  /** coworker 想请求的画布操作；没有操作请求时为 null。 */
  operationRequest: DrawlessCanvasOperationRequest | null;
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

export const coworkerChatChannelSchema = z.enum([
  "cursor_chat",
  "conversation_chat"
]);

export const coworkerChatSenderSchema = z.enum(["user", "coworker"]);

export const coworkerChatIntentSchema = z.enum([
  "message",
  "question",
  "operation_request",
  "operation_permission"
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
  allowProactiveCursorChat: z.boolean(),
  allowCanvasOperationRequests: z.boolean()
}) satisfies z.ZodType<DrawlessCoworkerRoomConfig>;

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
  timeoutMs: z.number().int().min(500).max(30_000).default(8_000)
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
  timeoutMs: z.number().int().min(500).max(30_000).optional()
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

export const canvasBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number()
}) satisfies z.ZodType<DrawlessCanvasBounds>;

export const canvasSemanticNodeKindSchema = z.enum([
  "text",
  "shape",
  "arrow",
  "frame",
  "group",
  "lane",
  "unknown"
]);

export const canvasSemanticEdgeDirectionSchema = z.enum([
  "forward",
  "reverse",
  "bidirectional",
  "unknown"
]);

export const canvasSemanticRegionKindSchema = z.enum([
  "frame",
  "group",
  "cluster",
  "swimlane",
  "unknown"
]);

export const canvasSemanticNodeSchema = z.object({
  id: z.string().trim().min(1),
  kind: canvasSemanticNodeKindSchema,
  shapeType: z.string().trim().min(1),
  text: z.string().trim().min(1).nullable(),
  bounds: canvasBoundsSchema,
  parentId: z.string().trim().min(1),
  pageId: z.string().trim().min(1).nullable()
}) satisfies z.ZodType<DrawlessCanvasSemanticNode>;

export const canvasSemanticEdgeSchema = z.object({
  id: z.string().trim().min(1),
  fromId: z.string().trim().min(1).nullable(),
  toId: z.string().trim().min(1).nullable(),
  label: z.string().trim().min(1).nullable(),
  direction: canvasSemanticEdgeDirectionSchema,
  recordId: z.string().trim().min(1)
}) satisfies z.ZodType<DrawlessCanvasSemanticEdge>;

export const canvasSemanticRegionSchema = z.object({
  id: z.string().trim().min(1),
  kind: canvasSemanticRegionKindSchema,
  title: z.string().trim().min(1).nullable(),
  bounds: canvasBoundsSchema,
  shapeIds: z.array(z.string().trim().min(1))
}) satisfies z.ZodType<DrawlessCanvasSemanticRegion>;

export const canvasSemanticGraphSchema = z.object({
  roomId: roomIdSchema,
  generatedAt: z.string().datetime(),
  currentPageId: z.string().trim().min(1).nullable(),
  nodes: z.array(canvasSemanticNodeSchema),
  edges: z.array(canvasSemanticEdgeSchema),
  regions: z.array(canvasSemanticRegionSchema)
}) satisfies z.ZodType<DrawlessCanvasSemanticGraph>;

export const canvasPointSchema = z.object({
  x: z.number(),
  y: z.number()
}) satisfies z.ZodType<DrawlessCanvasPoint>;

export const canvasChatContextSchema = z.object({
  currentPageId: z.string().trim().min(1).nullable(),
  focusedRecordIds: z.array(z.string().trim().min(1)),
  cursor: canvasPointSchema.nullable(),
  summary: canvasSummarySchema.nullable()
}) satisfies z.ZodType<DrawlessCanvasChatContext>;

export const coworkerChatMessageSchema = z.object({
  messageId: z.string().trim().min(1),
  roomId: roomIdSchema,
  channel: coworkerChatChannelSchema,
  sender: coworkerChatSenderSchema,
  senderSessionId: sessionIdSchema,
  intent: coworkerChatIntentSchema,
  text: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  canvasContext: canvasChatContextSchema.nullable()
}) satisfies z.ZodType<DrawlessCoworkerChatMessage>;

export const canvasOperationRequestSchema = z.object({
  requestId: z.string().trim().min(1),
  roomId: roomIdSchema,
  channel: coworkerChatChannelSchema,
  messageId: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  operationType: canvasOperationTypeSchema,
  description: z.string().trim().min(1),
  targetDescription: z.string().trim().min(1),
  riskLevel: z.literal("low")
}) satisfies z.ZodType<DrawlessCanvasOperationRequest>;

export const canvasOperationPermissionSchema = z.object({
  requestId: z.string().trim().min(1),
  roomId: roomIdSchema,
  channel: coworkerChatChannelSchema,
  approvedBySessionId: sessionIdSchema,
  approvedMessageId: z.string().trim().min(1),
  approvedText: z.string().trim().min(1),
  approvedAt: z.string().datetime()
}) satisfies z.ZodType<DrawlessCanvasOperationPermission>;

export const coworkerConversationRequestSchema = z.object({
  roomId: roomIdSchema,
  userMessage: coworkerChatMessageSchema,
  canvasSummary: canvasSummarySchema.nullable(),
  canvasSemanticGraph: canvasSemanticGraphSchema.nullable()
}) satisfies z.ZodType<DrawlessCoworkerConversationRequest>;

export const coworkerConversationResponseSchema = z.object({
  roomId: roomIdSchema,
  replyMessage: coworkerChatMessageSchema,
  operationRequest: canvasOperationRequestSchema.nullable()
}) satisfies z.ZodType<DrawlessCoworkerConversationResponse>;

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
