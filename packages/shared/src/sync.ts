import type { DrawlessCoworkerControlConfig } from "./coworker-control.js";
import type { DrawlessRoomId, DrawlessSessionId } from "./identity.js";

export const DRAWLESS_SYNC_ROUTE = "/sync";

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
  /** 房间签名密钥；仅本机开发允许省略。 */
  roomAccessSecret?: string | undefined;
  /** 反向代理可信 IP 或 CIDR；默认不信任转发头。 */
  trustedProxies?: string[] | undefined;
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
  rooms: Pick<DrawlessRoomRegistryStats, "roomCount">;
  /** 当前协同存储说明。 */
  storage: DrawlessStorageSummary;
}
