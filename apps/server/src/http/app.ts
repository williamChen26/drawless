import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import type {
  DrawlessHealthResponse,
  DrawlessReadyResponse,
  DrawlessServerConfig,
  DrawlessStorageSummary
} from "@drawless/shared";

import { isOriginAllowed } from "../config.js";
import {
  createRoomRegistry,
  type RoomRegistry
} from "../sync/room-registry.js";
import { attachTldrawSyncSocket } from "../sync/tldraw-sync.js";

export type CreateServerAppOptions = {
  config: DrawlessServerConfig;
  registry?: RoomRegistry;
  logger?: boolean;
};

export type ServerApp = {
  app: FastifyInstance;
  registry: RoomRegistry;
};

type SyncRouteParams = {
  roomId: string;
};

type SyncRouteQuery = {
  sessionId?: string;
};

const storageSummary: DrawlessStorageSummary = {
  kind: "process-local-memory",
  durable: false,
  note:
    "@tldraw/sync-core 为每个 TLSocketRoom 使用 InMemorySyncStorage；重启进程会清空房间。"
};

/**
 * 构建只包含 tldraw 协同能力的 Fastify 应用。
 */
export async function createServerApp({
  config,
  registry = createRoomRegistry(),
  logger = false
}: CreateServerAppOptions): Promise<ServerApp> {
  const app = Fastify({ logger });

  await app.register(websocket);

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (isOriginAllowed(origin, config.allowedOrigins) && origin) {
      reply.header("access-control-allow-origin", origin);
      reply.header("access-control-allow-methods", "GET,POST,OPTIONS");
      reply.header("access-control-allow-headers", "content-type");
    }
  });

  app.get("/health", async (): Promise<DrawlessHealthResponse> => ({
    ok: true,
    service: "@drawless/server",
    mode: "development",
    storage: storageSummary.kind,
    processLocal: true,
    syncRoute: `${config.syncRoute}/:roomId`
  }));

  app.get("/ready", async (): Promise<DrawlessReadyResponse> => ({
    ok: true,
    ready: true,
    rooms: registry.getStats(),
    storage: storageSummary
  }));

  app.get<{
    Params: SyncRouteParams;
    Querystring: SyncRouteQuery;
  }>(
    `${config.syncRoute}/:roomId`,
    { websocket: true },
    (socket, request) => {
      attachTldrawSyncSocket(
        socket,
        {
          roomId: request.params.roomId,
          sessionId: request.query.sessionId,
          origin: request.headers.origin
        },
        registry,
        config
      );
    }
  );

  app.addHook("onClose", async () => {
    registry.closeAll();
  });

  return { app, registry };
}
