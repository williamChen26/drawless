import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { Readable } from "node:stream";
import type {
  DrawlessHealthResponse,
  DrawlessReadyResponse,
  DrawlessServerConfig,
  DrawlessStorageSummary
} from "@drawless/shared";
import {
  coworkerConversationStreamRequestSchema,
  parseDrawlessRoomId,
  serverCoworkerStartRequestSchema
} from "@drawless/shared";

import { isOriginAllowed } from "../config.js";
import {
  CoworkerControlClientError,
  createCoworkerControlClient,
  type CoworkerControlClient
} from "../coworker/coworker-control-client.js";
import {
  createRoomRegistry,
  type RoomRegistry
} from "../sync/room-registry.js";
import { attachTldrawSyncSocket } from "../sync/tldraw-sync.js";

export type CreateServerAppOptions = {
  config: DrawlessServerConfig;
  registry?: RoomRegistry;
  coworkerClient?: CoworkerControlClient;
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

type CoworkerRouteParams = {
  roomId: string;
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
  coworkerClient,
  logger = false
}: CreateServerAppOptions): Promise<ServerApp> {
  const app = Fastify({ logger });
  const resolvedCoworkerClient =
    coworkerClient ?? createCoworkerControlClientIfConfigured(config);

  await app.register(websocket);

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (isOriginAllowed(origin, config.allowedOrigins) && origin) {
      reply.header("access-control-allow-origin", origin);
      reply.header("access-control-allow-methods", "GET,POST,DELETE,OPTIONS");
      reply.header("access-control-allow-headers", "content-type");
    }

    if (request.method === "OPTIONS") {
      // 浏览器在跨域 POST/DELETE 前会先发 preflight；这里直接返回 204，避免落到普通 route 后变成 404。
      return reply.code(204).send();
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

  app.post<{ Params: CoworkerRouteParams }>(
    "/rooms/:roomId/coworker/start",
    async (request, reply) => {
      const roomId = parseRoomIdForHttp(request.params.roomId);
      if (!roomId.ok) {
        return reply.code(400).send({ ok: false, error: roomId.error });
      }

      const body = serverCoworkerStartRequestSchema.safeParse(
        request.body ?? {}
      );
      if (!body.success) {
        return reply.code(400).send({
          ok: false,
          error:
            body.error.issues[0]?.message ??
            "Invalid coworker start request."
        });
      }

      if (!config.coworker.enabled || !resolvedCoworkerClient) {
        return reply.code(503).send({
          ok: false,
          error: "Coworker control is disabled."
        });
      }

      try {
        return await resolvedCoworkerClient.start(roomId.value, body.data);
      } catch (error) {
        return sendCoworkerControlError(reply, error);
      }
    }
  );

  app.get<{ Params: CoworkerRouteParams }>(
    "/rooms/:roomId/coworker/status",
    async (request, reply) => {
      const roomId = parseRoomIdForHttp(request.params.roomId);
      if (!roomId.ok) {
        return reply.code(400).send({ ok: false, error: roomId.error });
      }

      if (!config.coworker.enabled || !resolvedCoworkerClient) {
        return reply.code(503).send({
          ok: false,
          error: "Coworker control is disabled."
        });
      }

      try {
        return await resolvedCoworkerClient.status(roomId.value);
      } catch (error) {
        return sendCoworkerControlError(reply, error);
      }
    }
  );

  app.post<{ Params: CoworkerRouteParams }>(
    "/rooms/:roomId/coworker/conversation/stream",
    async (request, reply) => {
      const roomId = parseRoomIdForHttp(request.params.roomId);
      if (!roomId.ok) {
        return reply.code(400).send({ ok: false, error: roomId.error });
      }

      const body = coworkerConversationStreamRequestSchema.safeParse({
        ...(request.body && typeof request.body === "object" ? request.body : {}),
        roomId: roomId.value
      });
      if (!body.success) {
        return reply.code(400).send({
          ok: false,
          error:
            body.error.issues[0]?.message ??
            "Invalid coworker conversation request."
        });
      }

      if (!config.coworker.enabled || !resolvedCoworkerClient) {
        return reply.code(503).send({
          ok: false,
          error: "Coworker control is disabled."
        });
      }

      try {
        const response = await resolvedCoworkerClient.streamConversation(
          roomId.value,
          body.data
        );
        if (!response.body) {
          return reply.code(502).send({
            ok: false,
            error: "Coworker conversation stream is empty."
          });
        }

        reply.header("content-type", "text/plain; charset=utf-8");
        reply.header("cache-control", "no-cache");
        return reply.send(Readable.fromWeb(response.body));
      } catch (error) {
        return sendCoworkerControlError(reply, error);
      }
    }
  );

  app.delete<{ Params: CoworkerRouteParams }>(
    "/rooms/:roomId/coworker/stop",
    async (request, reply) => {
      const roomId = parseRoomIdForHttp(request.params.roomId);
      if (!roomId.ok) {
        return reply.code(400).send({ ok: false, error: roomId.error });
      }

      if (!config.coworker.enabled || !resolvedCoworkerClient) {
        return reply.code(503).send({
          ok: false,
          error: "Coworker control is disabled."
        });
      }

      try {
        return await resolvedCoworkerClient.stop(roomId.value);
      } catch (error) {
        return sendCoworkerControlError(reply, error);
      }
    }
  );

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

function createCoworkerControlClientIfConfigured(
  config: DrawlessServerConfig
) {
  // 默认不创建 client，避免未启用 coworker 时 server 启动就依赖 Mastra 服务配置。
  if (!config.coworker.enabled) {
    return null;
  }

  return createCoworkerControlClient(config.coworker);
}

function parseRoomIdForHttp(roomId: string) {
  const result = parseDrawlessRoomId(roomId);
  return result.ok
    ? { ok: true as const, value: result.value }
    : { ok: false as const, error: result.reason };
}

function sendCoworkerControlError(
  reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } },
  error: unknown
) {
  if (error instanceof CoworkerControlClientError) {
    return reply.code(error.statusCode).send({ ok: false, error: error.message });
  }

  return reply.code(502).send({
    ok: false,
    error: error instanceof Error ? error.message : String(error)
  });
}
