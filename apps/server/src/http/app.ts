import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { Readable } from "node:stream";
import type {
  DrawlessHealthResponse,
  DrawlessReadyResponse,
  DrawlessRoomId,
  DrawlessServerConfig,
  DrawlessStorageSummary
} from "@drawless/shared";
import {
  DRAWLESS_COWORKER_DISPLAY_NAME,
  verifyRoomAccessToken,
  coworkerApprovalIdSchema,
  coworkerApprovalListQuerySchema,
  coworkerApprovalResolutionRequestSchema,
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
  createCoworkerApprovalRegistry,
  type CoworkerApprovalLease,
  type CoworkerApprovalRegistry
} from "../coworker/coworker-approval-registry.js";
import { createCoworkerPublicEventStream } from "../coworker/coworker-public-stream.js";
import {
  createRoomRegistry,
  type RoomRegistry
} from "../sync/room-registry.js";
import { attachTldrawSyncSocket } from "../sync/tldraw-sync.js";
import { registerFeedbackRoutes } from "../feedback/feedback-routes.js";
import type { FeedbackClient } from "../feedback/github-feedback-client.js";

export type CreateServerAppOptions = {
  config: DrawlessServerConfig;
  registry?: RoomRegistry;
  coworkerClient?: CoworkerControlClient;
  coworkerApprovalRegistry?: CoworkerApprovalRegistry;
  feedbackClient?: FeedbackClient | null;
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

type CoworkerApprovalRouteParams = {
  roomId: string;
  approvalId: string;
};

type CoworkerApprovalListRouteQuery = {
  status?: string;
};

const storageSummary: DrawlessStorageSummary = {
  kind: "process-local-memory",
  durable: false,
  note:
    "@tldraw/sync-core 为每个 TLSocketRoom 使用 InMemorySyncStorage；重启进程或最后一个连接离开 30 分钟后会清空房间。"
};

const DREW_UNAVAILABLE_MESSAGE =
  `${DRAWLESS_COWORKER_DISPLAY_NAME} 暂时不可用，请稍后再试。`;

/**
 * 构建只包含 tldraw 协同能力的 Fastify 应用。
 */
export async function createServerApp({
  config,
  registry = createRoomRegistry(),
  coworkerClient,
  coworkerApprovalRegistry = createCoworkerApprovalRegistry(),
  feedbackClient = null,
  logger = false
}: CreateServerAppOptions): Promise<ServerApp> {
  // 默认不信任客户端转发头；部署时按代理的实际 IP/CIDR 显式配置。
  const app = Fastify({
    logger: logger ? { redact: ["req.headers.authorization"], serializers: { req: (req) => ({ method: req.method, url: req.url.split("?")[0] ?? "", remoteAddress: req.ip }) } } : false,
    trustProxy: config.trustedProxies?.length ? config.trustedProxies : false,
    bodyLimit: 64 * 1024
  });
  const resolvedCoworkerClient =
    coworkerClient ?? createCoworkerControlClientIfConfigured(config);

  await app.register(websocket, { options: { maxPayload: 1024 * 1024 } });

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    reply.header("vary", "Origin");
    if (origin && !isOriginAllowed(origin, config.allowedOrigins)) {
      return reply.code(403).send({ ok: false, error: "Origin is not allowed." });
    }
    if (isOriginAllowed(origin, config.allowedOrigins) && origin) {
      reply.header("access-control-allow-origin", origin);
      reply.header("access-control-allow-methods", "GET,POST,DELETE,OPTIONS");
      reply.header("access-control-allow-headers", "content-type,authorization");
    }

    if (request.method === "OPTIONS") {
      // 浏览器在跨域 POST/DELETE 前会先发 preflight；这里直接返回 204，避免落到普通 route 后变成 404。
      return reply.code(204).send();
    }
  });

  app.addHook("preValidation", async (request, reply) => {
    const roomId = (request.params as { roomId?: string } | null)?.roomId;
    if (!roomId || !config.roomAccessSecret) return;
    const token = request.headers.authorization?.replace(/^Bearer /, "")
      ?? (request.query as { accessToken?: string } | null)?.accessToken;
    if (!await verifyRoomAccessToken(roomId, token, config.roomAccessSecret)) {
      return reply.code(401).send({ ok: false, error: "房间链接无效或已过期。" });
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
    rooms: { roomCount: registry.getStats().roomCount },
    storage: storageSummary
  }));

  registerFeedbackRoutes(app, {
    allowedOrigins: config.allowedOrigins,
    feedbackClient
  });

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
          error: DREW_UNAVAILABLE_MESSAGE
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
          error: DREW_UNAVAILABLE_MESSAGE
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
          error: DREW_UNAVAILABLE_MESSAGE
        });
      }

      try {
        await ensureCoworkerSessionReady(resolvedCoworkerClient, roomId.value);
        const response = await resolvedCoworkerClient.streamConversation(
          roomId.value,
          body.data,
          createReplyAbortSignal(reply)
        );
        return sendCoworkerStreamResponse(reply, response, {
          roomId: roomId.value,
          approvalRegistry: coworkerApprovalRegistry
        });
      } catch (error) {
        return sendCoworkerControlError(reply, error);
      }
    }
  );

  app.get<{
    Params: CoworkerRouteParams;
    Querystring: CoworkerApprovalListRouteQuery;
  }>(
    "/rooms/:roomId/coworker/approvals",
    async (request, reply) => {
      const roomId = parseRoomIdForHttp(request.params.roomId);
      if (!roomId.ok) {
        return reply.code(400).send({ ok: false, error: roomId.error });
      }

      const query = coworkerApprovalListQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.code(400).send({
          ok: false,
          error:
            query.error.issues[0]?.message ??
            "Invalid coworker approval list request."
        });
      }

      return {
        roomId: roomId.value,
        approvals: coworkerApprovalRegistry.list(
          roomId.value,
          query.data.status
        )
      };
    }
  );

  app.post<{ Params: CoworkerApprovalRouteParams }>(
    "/rooms/:roomId/coworker/approvals/:approvalId/resolve",
    async (request, reply) => {
      const roomId = parseRoomIdForHttp(request.params.roomId);
      if (!roomId.ok) {
        return reply.code(400).send({ ok: false, error: roomId.error });
      }

      const approvalId = coworkerApprovalIdSchema.safeParse(
        request.params.approvalId
      );
      if (!approvalId.success) {
        return reply.code(400).send({
          ok: false,
          error:
            approvalId.error.issues[0]?.message ??
            "Invalid coworker conversation approval request."
        });
      }
      const resolution = coworkerApprovalResolutionRequestSchema.safeParse(
        request.body ?? {}
      );
      if (!resolution.success) {
        return reply.code(400).send({
          ok: false,
          error:
            resolution.error.issues[0]?.message ??
            "Invalid coworker conversation approval request."
        });
      }

      if (!config.coworker.enabled || !resolvedCoworkerClient) {
        return reply.code(503).send({
          ok: false,
          error: DREW_UNAVAILABLE_MESSAGE
        });
      }

      const acquired = coworkerApprovalRegistry.acquire(
        roomId.value,
        approvalId.data,
        resolution.data.decision
      );
      if (!acquired.ok) {
        const statusCode =
          acquired.reason === "not-found" || acquired.reason === "room-mismatch"
            ? 404
            : 409;
        return reply.code(statusCode).send({
          ok: false,
          error:
            acquired.reason === "resolved"
              ? "Coworker approval was already resolved."
              : acquired.reason === "resolving"
                ? "Coworker approval is already being resolved."
                : "Coworker approval was not found in this room."
        });
      }

      try {
        const runtimeRequest = {
          runId: acquired.lease.runtime.runId,
          toolCallId: acquired.lease.runtime.toolCallId
        };
        const response =
          resolution.data.decision === "approve"
            ? await resolvedCoworkerClient.approveConversationToolCall(
                roomId.value,
                runtimeRequest,
                createReplyAbortSignal(reply)
              )
            : await resolvedCoworkerClient.declineConversationToolCall(
                roomId.value,
                runtimeRequest,
                createReplyAbortSignal(reply)
              );
        coworkerApprovalRegistry.settle(approvalId.data, { succeeded: true });
        return sendCoworkerStreamResponse(reply, response, {
          roomId: roomId.value,
          approvalRegistry: coworkerApprovalRegistry,
          resolvedApproval: acquired.lease
        });
      } catch (error) {
        coworkerApprovalRegistry.settle(approvalId.data, {
          succeeded: false,
          error: error instanceof Error ? error.message : String(error)
        });
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
          error: DREW_UNAVAILABLE_MESSAGE
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

async function ensureCoworkerSessionReady(
  client: CoworkerControlClient,
  roomId: string
) {
  const status = await client.status(roomId);
  if (status.status === "online") {
    return;
  }

  // conversation chat 是 agent 入口；进入长对话前先让 coworker 完成 hydration。
  // starting/offline 虽然表示存在 session，但还不能保证 edit-canvas 会广播到用户画布。
  const started = await client.start(roomId, {
    waitUntilLoaded: true,
    timeoutMs: 8_000
  });
  if (started.status !== "online") {
    throw new CoworkerControlClientError(
      `Coworker is not online after start; current status is ${started.status}.`,
      503
    );
  }
}

function sendCoworkerStreamResponse(
  reply: FastifyReply,
  response: Response,
  input: {
    /** 当前协同房间 ID。 */
    roomId: DrawlessRoomId;
    /** Server 进程内的审批注册表。 */
    approvalRegistry: CoworkerApprovalRegistry;
    /** 审批续流时已知的 runtime 与公开 ID 映射。 */
    resolvedApproval?: CoworkerApprovalLease | undefined;
  }
) {
  if (!response.body) {
    return reply.code(502).send({
      ok: false,
      error: "Coworker conversation stream is empty."
    });
  }

  reply.header(
    "content-type",
    response.headers.get("content-type") ?? "text/event-stream; charset=utf-8"
  );
  reply.header("cache-control", "no-cache");
  const publicStream = createCoworkerPublicEventStream({
    ...input,
    stream: response.body
  });
  return reply.send(Readable.fromWeb(publicStream));
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

function createReplyAbortSignal(reply: FastifyReply) {
  const controller = new AbortController();
  reply.raw.once("close", () => controller.abort());
  return controller.signal;
}
