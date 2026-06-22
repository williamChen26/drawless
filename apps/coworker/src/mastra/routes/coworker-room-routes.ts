import { registerApiRoute } from '@mastra/core/server';

import {
  coworkerConversationToolApprovalRequestSchema,
  coworkerConversationStreamRequestSchema,
  coworkerStartRequestSchema,
} from '../../../../../packages/shared/src/index';
import type { DrawlessCoworkerRoomRegistry } from '../collaboration/coworker-room-registry';
import type { DrawlessAgentStreamOutput } from '../collaboration/cursor-chat-reply-handler';

type TextStreamReader = {
  read(): Promise<{ value?: string; done: boolean }>;
  cancel(reason?: unknown): Promise<unknown>;
};

type TextStreamLike = {
  getReader(): TextStreamReader;
};

type AgentStreamOutput = {
  textStream: TextStreamLike;
  fullStream?: AsyncIterable<unknown> | undefined;
} & Pick<DrawlessAgentStreamOutput, 'runId'>;

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
          const result = await coworkerRoomRegistry.streamConversation(request.data, {
            abortSignal: c.req.raw.signal,
          });
          return createConversationStreamResponse(result);
        } catch (error) {
          return c.json({ ok: false, error: toErrorMessage(error) }, 400);
        }
      },
    }),
    registerApiRoute(
      '/drawless/rooms/:roomId/coworker/conversation/:runId/tool-calls/:toolCallId/approve',
      {
        method: 'POST',
        // 当前阶段用于本地 server/coworker 联调；生产环境需要换成 server 签名或内部鉴权。
        requiresAuth: false,
        handler: async (c) => {
          const roomId = c.req.param('roomId');
          const request = coworkerConversationToolApprovalRequestSchema.safeParse({
            runId: c.req.param('runId'),
            toolCallId: c.req.param('toolCallId'),
          });
          if (!request.success) {
            return c.json(
              {
                ok: false,
                error:
                  request.error.issues[0]?.message ??
                  'Invalid coworker conversation approval request.',
              },
              400
            );
          }

          try {
            const result = await coworkerRoomRegistry.approveConversationToolCall(
              roomId,
              request.data
            );
            return createConversationStreamResponse(result);
          } catch (error) {
            return c.json({ ok: false, error: toErrorMessage(error) }, 400);
          }
        },
      }
    ),
    registerApiRoute(
      '/drawless/rooms/:roomId/coworker/conversation/:runId/tool-calls/:toolCallId/decline',
      {
        method: 'POST',
        // 当前阶段用于本地 server/coworker 联调；生产环境需要换成 server 签名或内部鉴权。
        requiresAuth: false,
        handler: async (c) => {
          const roomId = c.req.param('roomId');
          const request = coworkerConversationToolApprovalRequestSchema.safeParse({
            runId: c.req.param('runId'),
            toolCallId: c.req.param('toolCallId'),
          });
          if (!request.success) {
            return c.json(
              {
                ok: false,
                error:
                  request.error.issues[0]?.message ??
                  'Invalid coworker conversation approval request.',
              },
              400
            );
          }

          try {
            const result = await coworkerRoomRegistry.declineConversationToolCall(
              roomId,
              request.data
            );
            return createConversationStreamResponse(result);
          } catch (error) {
            return c.json({ ok: false, error: toErrorMessage(error) }, 400);
          }
        },
      }
    ),
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

function createConversationStreamResponse(result: AgentStreamOutput) {
  return new Response(createConversationSseStream({ result }), {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  });
}

function createConversationSseStream(input: {
  /** Mastra agent 返回的流式结果。 */
  result: AgentStreamOutput;
}) {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (chunk: unknown) => {
        controller.enqueue(encoder.encode(encodeSseChunk(chunk)));
      };

      try {
        if (input.result.fullStream) {
          for await (const chunk of input.result.fullStream) {
            emit(chunk);
          }
        } else {
          await streamTextFallback(input.result.textStream, (text) => {
            emit({
              type: 'text-delta',
              text,
            });
          });
        }
      } catch (error) {
        emit({
          type: 'error',
          error: serializeUnknown(error),
        });
      } finally {
        controller.close();
      }
    },
  });
}

function encodeSseChunk(chunk: unknown) {
  const type = getStringField(chunk, 'type') ?? 'message';
  return `event: ${type}\ndata: ${JSON.stringify(chunk ?? null)}\n\n`;
}

async function streamTextFallback(stream: TextStreamLike, onText: (text: string) => void) {
  const reader = stream.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        onText(value);
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

function getStringField(input: unknown, key: string) {
  if (!input || typeof input !== 'object' || !(key in input)) {
    return null;
  }

  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

function serializeUnknown(input: unknown) {
  if (input instanceof Error) {
    return {
      name: input.name,
      message: input.message,
      stack: input.stack,
    };
  }

  try {
    JSON.stringify(input);
    return input;
  } catch {
    return String(input);
  }
}
