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
 * 画布上的一个点。
 */
export interface DrawlessCanvasPoint {
  /** 画布坐标系中的 x 坐标。 */
  x: number;
  /** 画布坐标系中的 y 坐标。 */
  y: number;
}

/**
 * 目标对象包围盒内的归一化坐标。
 */
export interface DrawlessCanvasNormalizedPoint {
  /** 目标包围盒内的归一化 x 坐标，范围为 0 到 1。 */
  x: number;
  /** 目标包围盒内的归一化 y 坐标，范围为 0 到 1。 */
  y: number;
}

/**
 * conversation chat 发起时用户当前可视区的临时上下文。
 */
export interface DrawlessCanvasViewportContext {
  /** 用户当前所在的 page ID；无法确定时为 null。 */
  currentPageId: string | null;
  /** 用户当前屏幕可见区域换算到画布坐标系后的包围盒。 */
  viewportBounds: DrawlessCanvasBounds;
  /** 用户当前屏幕中心点换算到画布坐标系后的坐标。 */
  viewportCenter: DrawlessCanvasPoint;
  /** 用户当前画布缩放比例。 */
  zoom: number;
}

/**
 * coworker 收集画布上下文时使用的只读请求。
 */
export interface DrawlessCanvasContextRequest {
  /** 请求上下文的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 调用方认为当前所在的 page ID；不确定时可以为空。 */
  currentPageId?: string | null | undefined;
  /** 调用方希望优先关注的 tldraw record ID 列表。 */
  focusedRecordIds?: string[] | undefined;
  /** cursor chat 或用户指向的位置；没有明确位置时为空。 */
  cursor?: DrawlessCanvasPoint | null | undefined;
  /** 返回给模型的最大语义节点数量，用于控制上下文体积。 */
  maxNodes?: number | undefined;
}

/**
 * coworker 收集画布上下文后提供给模型的焦点信息。
 */
export interface DrawlessCanvasContextFocus {
  /** 当前从 presence 中观察到的用户选中对象 ID 列表。 */
  selectedRecordIds: string[];
  /** 本次请求显式要求关注的对象 ID 列表。 */
  focusedRecordIds: string[];
  /** 根据 cursor 或焦点对象推断出的附近对象 ID 列表。 */
  nearbyRecordIds: string[];
  /** 最近从远端同步变化中观察到的 record ID 列表。 */
  recentlyChangedRecordIds: string[];
}

/**
 * coworker 从本地 TLStore 派生出的只读画布上下文。它是观察结果，不是新的画布事实源。
 */
export interface DrawlessCanvasContextSnapshot {
  /** 上下文所属的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** coworker 当前是否能读取到这个 room 的本地同步状态。 */
  available: boolean;
  /** 上下文生成时间，使用 ISO 字符串。 */
  capturedAt: string;
  /** 当前 page ID；无法确定时为 null。 */
  currentPageId: string | null;
  /** 从 tldraw records 派生出的画布摘要；不可用时为 null。 */
  summary: DrawlessCanvasSummary | null;
  /** 从 tldraw records 派生出的语义图；不可用或被请求关闭时为 null。 */
  semanticGraph: DrawlessCanvasSemanticGraph | null;
  /** 本次上下文里模型应优先关注的对象集合。 */
  focus: DrawlessCanvasContextFocus;
  /** 上下文收集过程中的限制、截断或不可用说明。 */
  warnings: string[];
}

/**
 * coworker 可以创建的基础画布形状类型。
 */
export type DrawlessCanvasEditableShapeKind =
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "text";

/**
 * coworker 写画布时允许使用的受控样式。
 */
export type DrawlessCanvasEditColor =
  | "black"
  | "grey"
  | "light-violet"
  | "violet"
  | "blue"
  | "light-blue"
  | "yellow"
  | "orange"
  | "green"
  | "light-green"
  | "light-red"
  | "red";

/**
 * coworker 写画布时允许使用的受控颜色。
 */
export interface DrawlessCanvasEditStyle {
  /** tldraw shape 主色；不传时由 coworker 使用默认值。 */
  color?: DrawlessCanvasEditColor | undefined;
  /** tldraw geo shape 填充样式；文本 shape 会忽略该字段。 */
  fill?: "none" | "semi" | "solid" | undefined;
  /** tldraw shape 尺寸样式；不传时由 coworker 使用默认值。 */
  size?: "s" | "m" | "l" | "xl" | undefined;
}

/**
 * coworker 执行画布编辑计划时的可控节奏。
 */
export type DrawlessCanvasEditExecutionMode = "instant" | "performed";

/**
 * tldraw arrow binding 的受控吸附策略。
 */
export type DrawlessCanvasEditArrowBindingSnap =
  | "center"
  | "edge-point"
  | "edge"
  | "none";

/**
 * coworker 创建箭头时用于绑定箭头端点的目标。
 */
export interface DrawlessCanvasEditArrowBindingTarget {
  /** 已存在的 tldraw shape ID；连接已有对象时使用。 */
  shapeId?: string | undefined;
  /** 同一编辑请求内 create_shape 操作的 operationId；连接本次新建对象时使用。 */
  operationId?: string | undefined;
  /** 绑定在目标对象包围盒内的归一化锚点；不传时使用中心点。 */
  normalizedAnchor?: DrawlessCanvasNormalizedPoint | undefined;
  /** tldraw arrow binding 的吸附策略；不传时由 coworker 使用 edge。 */
  snap?: DrawlessCanvasEditArrowBindingSnap | undefined;
  /** 是否精确使用 normalizedAnchor；不传时由 coworker 使用 true。 */
  isPrecise?: boolean | undefined;
  /** 箭头端点是否进入目标 shape 指向锚点；不传时由 coworker 使用 false。 */
  isExact?: boolean | undefined;
}

/**
 * coworker 创建基础 shape 的受控操作。
 */
export interface DrawlessCanvasEditCreateShapeOperation {
  /** 单次编辑请求内的操作 ID，用于回溯模型意图和写入结果。 */
  operationId: string;
  /** 操作类型。 */
  kind: "create_shape";
  /** 要创建的基础 shape 类型。 */
  shapeKind: DrawlessCanvasEditableShapeKind;
  /** 写入 shape 的文字；没有文字时可以为空。 */
  text?: string | undefined;
  /** shape 在画布坐标系中的目标包围盒。 */
  bounds: DrawlessCanvasBounds;
  /** shape 使用的受控样式。 */
  style?: DrawlessCanvasEditStyle | undefined;
}

/**
 * coworker 更新已有 shape 文本的受控操作。
 */
export interface DrawlessCanvasEditUpdateShapeTextOperation {
  /** 单次编辑请求内的操作 ID，用于回溯模型意图和写入结果。 */
  operationId: string;
  /** 操作类型。 */
  kind: "update_shape_text";
  /** 要更新的 tldraw shape ID。 */
  shapeId: string;
  /** 更新后的文本内容。 */
  text: string;
}

/**
 * coworker 移动已有 shape 的受控操作。
 */
export interface DrawlessCanvasEditMoveShapeOperation {
  /** 单次编辑请求内的操作 ID，用于回溯模型意图和写入结果。 */
  operationId: string;
  /** 操作类型。 */
  kind: "move_shape";
  /** 要移动的 tldraw shape ID。 */
  shapeId: string;
  /** shape 左上角移动后的画布坐标。 */
  point: DrawlessCanvasPoint;
}

/**
 * coworker 调整已有 shape 包围盒的受控操作。
 */
export interface DrawlessCanvasEditResizeShapeOperation {
  /** 单次编辑请求内的操作 ID，用于回溯模型意图和写入结果。 */
  operationId: string;
  /** 操作类型。 */
  kind: "resize_shape";
  /** 要调整尺寸的 tldraw shape ID。 */
  shapeId: string;
  /** shape 调整后的目标包围盒。 */
  bounds: DrawlessCanvasBounds;
}

/**
 * coworker 创建基础箭头的受控操作。
 */
export interface DrawlessCanvasEditCreateArrowOperation {
  /** 单次编辑请求内的操作 ID，用于回溯模型意图和写入结果。 */
  operationId: string;
  /** 操作类型。 */
  kind: "create_arrow";
  /** 箭头起点的画布坐标。 */
  from: DrawlessCanvasPoint;
  /** 箭头终点的画布坐标。 */
  to: DrawlessCanvasPoint;
  /** 箭头起点绑定的目标 shape；不传时仅使用坐标起点。 */
  startBinding?: DrawlessCanvasEditArrowBindingTarget | undefined;
  /** 箭头终点绑定的目标 shape；不传时仅使用坐标终点。 */
  endBinding?: DrawlessCanvasEditArrowBindingTarget | undefined;
  /** 箭头标签文本；没有标签时可以为空。 */
  text?: string | undefined;
  /** 箭头使用的受控样式。 */
  style?: DrawlessCanvasEditStyle | undefined;
}

/**
 * coworker 可以执行的受控画布编辑操作。
 */
export type DrawlessCanvasEditOperation =
  | DrawlessCanvasEditCreateShapeOperation
  | DrawlessCanvasEditUpdateShapeTextOperation
  | DrawlessCanvasEditMoveShapeOperation
  | DrawlessCanvasEditResizeShapeOperation
  | DrawlessCanvasEditCreateArrowOperation;

/**
 * conversation agent 请求 coworker 写画布时传入的受控编辑计划。
 */
export interface DrawlessCanvasEditRequest {
  /** 编辑所属的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 调用方认为当前所在的 page ID；不确定时可以为空。 */
  currentPageId?: string | null | undefined;
  /** coworker 执行本次编辑计划时的节奏；不传时默认按拟人化步骤执行。 */
  executionMode?: DrawlessCanvasEditExecutionMode | undefined;
  /** 用户本次希望达成的画布编辑意图。 */
  intent: string;
  /** 需要按顺序应用到 tldraw document 的受控编辑操作。 */
  operations: DrawlessCanvasEditOperation[];
}

/**
 * coworker 应用受控画布编辑后的结果摘要。
 */
export interface DrawlessCanvasEditResult {
  /** 编辑所属的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 本次编辑是否至少成功写入了一个 record。 */
  applied: boolean;
  /** 本次编辑新建的 tldraw record ID 列表。 */
  createdRecordIds: string[];
  /** 本次编辑更新的 tldraw record ID 列表。 */
  updatedRecordIds: string[];
  /** 本次编辑删除的 tldraw record ID 列表；当前 MVP 不主动删除，保留字段方便后续扩展。 */
  deletedRecordIds: string[];
  /** 编辑过程中跳过、降级或失败的操作说明。 */
  warnings: string[];
  /** 给 conversation agent 和 UI 展示的人类可读结果摘要。 */
  summary: string;
}

/**
 * conversation chat 发送给 coworker 的长对话请求。
 */
export interface DrawlessCoworkerConversationStreamRequest {
  /** 请求所属的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 用户在 conversation chat 中输入的原始消息。 */
  message: string;
  /** conversation 发起时用户当前可视区上下文；没有 editor 实例时为空。 */
  viewport?: DrawlessCanvasViewportContext | null | undefined;
}

/**
 * web 或 server 对 conversation tool call 做人工确认时使用的请求。
 */
export interface DrawlessCoworkerConversationToolApprovalRequest {
  /** Mastra 当前 agent stream 的 run ID。 */
  runId: string;
  /** 等待用户确认的 tool call ID。 */
  toolCallId: string;
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

export const canvasObservationKindSchema = z.enum([
  "shape_created",
  "shape_updated",
  "shape_deleted",
  "selection_changed",
  "presence_updated",
  "page_changed",
  "unknown_change"
]);

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

export const canvasNormalizedPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1)
}) satisfies z.ZodType<DrawlessCanvasNormalizedPoint>;

export const canvasViewportContextSchema = z.object({
  currentPageId: z.string().trim().min(1).nullable(),
  viewportBounds: canvasBoundsSchema,
  viewportCenter: canvasPointSchema,
  zoom: z.number().positive()
}) satisfies z.ZodType<DrawlessCanvasViewportContext>;

export const canvasContextRequestSchema = z.object({
  roomId: roomIdSchema,
  currentPageId: z.string().trim().min(1).nullable().optional(),
  focusedRecordIds: z.array(z.string().trim().min(1)).optional(),
  cursor: canvasPointSchema.nullable().optional(),
  maxNodes: z.number().int().min(10).max(200).optional()
}) satisfies z.ZodType<DrawlessCanvasContextRequest>;

export const canvasContextFocusSchema = z.object({
  selectedRecordIds: z.array(z.string().trim().min(1)),
  focusedRecordIds: z.array(z.string().trim().min(1)),
  nearbyRecordIds: z.array(z.string().trim().min(1)),
  recentlyChangedRecordIds: z.array(z.string().trim().min(1))
}) satisfies z.ZodType<DrawlessCanvasContextFocus>;

export const canvasContextSnapshotSchema = z.object({
  roomId: roomIdSchema,
  available: z.boolean(),
  capturedAt: z.string().datetime(),
  currentPageId: z.string().trim().min(1).nullable(),
  summary: canvasSummarySchema.nullable(),
  semanticGraph: canvasSemanticGraphSchema.nullable(),
  focus: canvasContextFocusSchema,
  warnings: z.array(z.string().trim().min(1))
}) satisfies z.ZodType<DrawlessCanvasContextSnapshot>;

export const canvasEditableShapeKindSchema = z.enum([
  "rectangle",
  "ellipse",
  "diamond",
  "text"
]) satisfies z.ZodType<DrawlessCanvasEditableShapeKind>;

export const canvasEditColorSchema = z.enum([
  "black",
  "grey",
  "light-violet",
  "violet",
  "blue",
  "light-blue",
  "yellow",
  "orange",
  "green",
  "light-green",
  "light-red",
  "red"
]) satisfies z.ZodType<DrawlessCanvasEditColor>;

export const canvasEditStyleSchema = z.object({
  color: canvasEditColorSchema.optional(),
  fill: z.enum(["none", "semi", "solid"]).optional(),
  size: z.enum(["s", "m", "l", "xl"]).optional()
}) satisfies z.ZodType<DrawlessCanvasEditStyle>;

export const canvasEditExecutionModeSchema = z.enum([
  "instant",
  "performed"
]) satisfies z.ZodType<DrawlessCanvasEditExecutionMode>;

export const canvasEditArrowBindingSnapSchema = z.enum([
  "center",
  "edge-point",
  "edge",
  "none"
]) satisfies z.ZodType<DrawlessCanvasEditArrowBindingSnap>;

const canvasEditOperationBaseSchema = z.object({
  operationId: z.string().trim().min(1).max(120)
});

export const canvasEditArrowBindingTargetSchema = z
  .object({
    shapeId: z.string().trim().min(1).optional(),
    operationId: z.string().trim().min(1).max(120).optional(),
    normalizedAnchor: canvasNormalizedPointSchema.optional(),
    snap: canvasEditArrowBindingSnapSchema.optional(),
    isPrecise: z.boolean().optional(),
    isExact: z.boolean().optional()
  })
  .refine((value) => Boolean(value.shapeId || value.operationId), {
    message: "Arrow binding target must include shapeId or operationId."
  }) satisfies z.ZodType<DrawlessCanvasEditArrowBindingTarget>;

export const canvasEditCreateShapeOperationSchema = canvasEditOperationBaseSchema.extend({
  kind: z.literal("create_shape"),
  shapeKind: canvasEditableShapeKindSchema,
  text: z.string().trim().max(1_000).optional(),
  bounds: canvasBoundsSchema,
  style: canvasEditStyleSchema.optional()
}) satisfies z.ZodType<DrawlessCanvasEditCreateShapeOperation>;

export const canvasEditUpdateShapeTextOperationSchema = canvasEditOperationBaseSchema.extend({
  kind: z.literal("update_shape_text"),
  shapeId: z.string().trim().min(1),
  text: z.string().trim().max(1_000)
}) satisfies z.ZodType<DrawlessCanvasEditUpdateShapeTextOperation>;

export const canvasEditMoveShapeOperationSchema = canvasEditOperationBaseSchema.extend({
  kind: z.literal("move_shape"),
  shapeId: z.string().trim().min(1),
  point: canvasPointSchema
}) satisfies z.ZodType<DrawlessCanvasEditMoveShapeOperation>;

export const canvasEditResizeShapeOperationSchema = canvasEditOperationBaseSchema.extend({
  kind: z.literal("resize_shape"),
  shapeId: z.string().trim().min(1),
  bounds: canvasBoundsSchema
}) satisfies z.ZodType<DrawlessCanvasEditResizeShapeOperation>;

export const canvasEditCreateArrowOperationSchema = canvasEditOperationBaseSchema.extend({
  kind: z.literal("create_arrow"),
  from: canvasPointSchema,
  to: canvasPointSchema,
  startBinding: canvasEditArrowBindingTargetSchema.optional(),
  endBinding: canvasEditArrowBindingTargetSchema.optional(),
  text: z.string().trim().max(1_000).optional(),
  style: canvasEditStyleSchema.optional()
}) satisfies z.ZodType<DrawlessCanvasEditCreateArrowOperation>;

export const canvasEditOperationSchema = z.discriminatedUnion("kind", [
  canvasEditCreateShapeOperationSchema,
  canvasEditUpdateShapeTextOperationSchema,
  canvasEditMoveShapeOperationSchema,
  canvasEditResizeShapeOperationSchema,
  canvasEditCreateArrowOperationSchema
]) satisfies z.ZodType<DrawlessCanvasEditOperation>;

export const canvasEditRequestSchema = z.object({
  roomId: roomIdSchema,
  currentPageId: z.string().trim().min(1).nullable().optional(),
  executionMode: canvasEditExecutionModeSchema.optional().default("performed"),
  intent: z.string().trim().min(1).max(1_000),
  operations: z.array(canvasEditOperationSchema).min(1).max(20)
}) satisfies z.ZodType<DrawlessCanvasEditRequest>;

export const canvasEditResultSchema = z.object({
  roomId: roomIdSchema,
  applied: z.boolean(),
  createdRecordIds: z.array(z.string().trim().min(1)),
  updatedRecordIds: z.array(z.string().trim().min(1)),
  deletedRecordIds: z.array(z.string().trim().min(1)),
  warnings: z.array(z.string().trim().min(1)),
  summary: z.string().trim().min(1)
}) satisfies z.ZodType<DrawlessCanvasEditResult>;

export const coworkerConversationStreamRequestSchema = z.object({
  roomId: roomIdSchema,
  message: z.string().trim().min(1).max(8_000),
  viewport: canvasViewportContextSchema.nullable().optional()
}) satisfies z.ZodType<DrawlessCoworkerConversationStreamRequest>;

export const coworkerConversationToolApprovalRequestSchema = z.object({
  runId: z.string().trim().min(1),
  toolCallId: z.string().trim().min(1)
}) satisfies z.ZodType<DrawlessCoworkerConversationToolApprovalRequest>;

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
