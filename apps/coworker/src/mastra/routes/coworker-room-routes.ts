import { registerApiRoute } from '@mastra/core/server';

import {
  coworkerConversationStreamRequestSchema,
  coworkerStartRequestSchema,
} from '../../../../../packages/shared/src/index';
import type { DrawlessCoworkerRoomRegistry } from '../collaboration/coworker-room-registry';

type TextStreamReader = {
  read(): Promise<{ value?: string; done: boolean }>;
  cancel(reason?: unknown): Promise<unknown>;
};

type TextStreamLike = {
  getReader(): TextStreamReader;
};

// 这组 custom API routes 是 coworker 的控制面，只负责进入、查询、退出 room。
// 画布读写仍然通过 coworker 自己的 tldraw sync client 走协同边界。
export function createCoworkerRoomApiRoutes(coworkerRoomRegistry: DrawlessCoworkerRoomRegistry) {
  return [
    registerApiRoute('/drawless/rooms/:roomId/coworker/start', {
      method: 'POST',
      // 当前阶段用于本地 server/coworker 联调；生产环境需要换成 server 签名或内部鉴权。
      requiresAuth: false,
      handler: async (c) => {
        const roomId = c.req.param('roomId');
        const body = await readJsonBody(c.req);
        const request = coworkerStartRequestSchema.safeParse(body);
        if (!request.success) {
          return c.json(
            {
              ok: false,
              error: request.error.issues[0]?.message ?? 'Invalid coworker start request.',
            },
            400
          );
        }

        try {
          const status = await coworkerRoomRegistry.start(roomId, request.data);
          return c.json(status);
        } catch (error) {
          return c.json({ ok: false, error: toErrorMessage(error) }, 400);
        }
      },
    }),
    registerApiRoute('/drawless/rooms/:roomId/coworker/status', {
      method: 'GET',
      // status 只暴露轻量生命周期状态，不返回完整 tldraw document。
      requiresAuth: false,
      handler: async (c) => {
        const roomId = c.req.param('roomId');
        try {
          return c.json(coworkerRoomRegistry.getStatus(roomId));
        } catch (error) {
          return c.json({ ok: false, error: toErrorMessage(error) }, 400);
        }
      },
    }),
    registerApiRoute('/drawless/rooms/:roomId/coworker/conversation/stream', {
      method: 'POST',
      // 当前阶段用于本地 server/coworker 联调；生产环境需要换成 server 签名或内部鉴权。
      requiresAuth: false,
      handler: async (c) => {
        const roomId = c.req.param('roomId');
        const body = await readJsonBody(c.req);
        const request = coworkerConversationStreamRequestSchema.safeParse({
          ...(body && typeof body === 'object' ? body : {}),
          roomId,
        });
        if (!request.success) {
          return c.json(
            {
              ok: false,
              error: request.error.issues[0]?.message ?? 'Invalid coworker conversation request.',
            },
            400
          );
        }

        try {
          const result = await coworkerRoomRegistry.streamConversation(request.data);
          return new Response(encodeTextStream(result.textStream), {
            headers: {
              'content-type': 'text/plain; charset=utf-8',
              'cache-control': 'no-cache',
            },
          });
        } catch (error) {
          return c.json({ ok: false, error: toErrorMessage(error) }, 400);
        }
      },
    }),
    registerApiRoute('/drawless/rooms/:roomId/coworker/stop', {
      method: 'DELETE',
      // stop 会关闭 coworker 的 WebSocket client，用于释放 room 内的 AI 同事身份。
      requiresAuth: false,
      handler: async (c) => {
        const roomId = c.req.param('roomId');
        try {
          return c.json(coworkerRoomRegistry.stop(roomId));
        } catch (error) {
          return c.json({ ok: false, error: toErrorMessage(error) }, 400);
        }
      },
    }),
  ];
}

async function readJsonBody(request: { json: () => Promise<unknown> }) {
  try {
    return await request.json();
  } catch {
    // 空 body 或非 JSON body 交给 schema 返回统一的参数错误。
    return {};
  }
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function encodeTextStream(stream: TextStreamLike) {
  const reader = stream.getReader();
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) {
        controller.close();
        return;
      }

      if (value) {
        controller.enqueue(encoder.encode(value));
      }
    },
    async cancel(reason) {
      // 浏览器或 server 断开连接时，把取消信号继续传给 Mastra 的文本流。
      await reader.cancel(reason);
    },
  });
}
