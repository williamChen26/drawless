import {
  canvasContextRequestSchema,
  coworkerConversationStreamRequestSchema,
  parseDrawlessRoomId,
  type DrawlessCanvasContextRequest,
  type DrawlessCanvasContextSnapshot,
  type DrawlessCoworkerConversationStreamRequest,
  type DrawlessCoworkerRoomSessionStatus,
  type DrawlessCoworkerRoomSnapshotSummary,
  type DrawlessCoworkerRoomStatusResponse,
  type DrawlessCoworkerStartRequest,
  type DrawlessCoworkerStopResponse,
  type DrawlessRoomId,
} from '../../../../../packages/shared/src/index';
import {
  createDrawlessCoworkerRoomClient,
  type DrawlessCoworkerRoomClient,
} from './coworker-room-client';
import {
  replyToCursorChat,
  type DrawlessCursorChatReplyAgent,
} from './cursor-chat-reply-handler';
import {
  createCanvasContextSnapshot,
  createUnavailableCanvasContextSnapshot,
} from '../tools/canvas-context-reader';

type CoworkerRoomEntry = {
  /** 当前 room 对应的 coworker sync client。 */
  client: DrawlessCoworkerRoomClient;
  /** 当前 room client 的生命周期状态。 */
  status: DrawlessCoworkerRoomSessionStatus;
  /** 最近一次轻量 store 快照。 */
  snapshot: DrawlessCoworkerRoomSnapshotSummary | null;
  /** 最近一次启动或同步错误。 */
  lastError: string | null;
  /** 最近从远端 document 变化中观察到的 record ID。 */
  recentlyChangedRecordIds: string[];
  /** 当前 room client 的启动时间。 */
  startedAt: string;
  /** 当前 room client 最近一次状态更新时间。 */
  updatedAt: string;
};

/**
 * 管理 coworker 在各个 room 中的常驻 sync client。
 *
 * 这里是 coworker 进程内状态，不是画布事实源；真正的画布事实仍然只存在于 tldraw document / TLStore。
 */
export class DrawlessCoworkerRoomRegistry {
  // key 使用 roomId，保证每个 room 在当前 coworker 进程中最多只有一个常驻 client。
  private readonly entries = new Map<DrawlessRoomId, CoworkerRoomEntry>();

  constructor(private readonly cursorChatReplyAgent: DrawlessCursorChatReplyAgent) {}

  async start(
    roomIdInput: string,
    request: DrawlessCoworkerStartRequest
  ): Promise<DrawlessCoworkerRoomStatusResponse> {
    const roomId = parseRoomIdOrThrow(roomIdInput);
    const existing = this.entries.get(roomId);
    if (existing && existing.status !== 'error' && existing.status !== 'stopped') {
      // start 是幂等控制面：server 重试或用户重复点击时，不创建第二个 coworker 身份。
      await this.waitForExistingIfNeeded(existing, request);
      return this.createStatusResponse(roomId, existing);
    }

    // error/stopped entry 不复用，避免一个坏连接继续占着 room 生命周期。
    existing?.client.close();
    const now = new Date().toISOString();
    let entry!: CoworkerRoomEntry;
    const client = createDrawlessCoworkerRoomClient({
      roomId,
      serverUrl: request.serverUrl,
      instanceId: request.instanceId,
      displayName: request.displayName,
      color: request.color,
      onLoad: (snapshot) => {
        // 首次 hydration 完成后，coworker 才算真正读到了 room 的画布事实。
        entry.status = 'online';
        entry.snapshot = snapshot;
        entry.lastError = null;
        entry.updatedAt = new Date().toISOString();
      },
      onRemoteChange: (snapshot, changedRecordIds) => {
        // 这里只保存轻量统计，不复制完整 tldraw document，避免制造第二套事实源。
        entry.status = entry.status === 'error' ? entry.status : 'online';
        entry.snapshot = snapshot;
        entry.recentlyChangedRecordIds = mergeRecentRecordIds(
          changedRecordIds,
          entry.recentlyChangedRecordIds
        );
        entry.updatedAt = new Date().toISOString();
      },
      onCursorChat: (event) => {
        // cursor chat 不落库，不变成第二套对话事实源；这里只触发一次临时 AI 回复。
        entry.updatedAt = new Date().toISOString();
        console.info(
          `[drawless coworker] observed cursor chat in ${roomId} from ${event.userName}: ${event.message}`
        );
        void replyToCursorChat({ client, event, agent: this.cursorChatReplyAgent })
          .then(() => {
            entry.updatedAt = new Date().toISOString();
          })
          .catch((error) => {
            console.warn('[drawless coworker] cursor chat reply failed', error);
          });
      },
      onSyncError: (reason) => {
        entry.status = 'error';
        entry.lastError = reason;
        entry.updatedAt = new Date().toISOString();
      },
    });

    entry = {
      client,
      status: 'starting',
      snapshot: null,
      lastError: null,
      recentlyChangedRecordIds: [],
      startedAt: now,
      updatedAt: now,
    };
    // 先登记 entry，再等待 hydration；这样 status 路由能立刻看到 starting 状态。
    this.entries.set(roomId, entry);

    if (request.waitUntilLoaded) {
      await this.waitForExistingIfNeeded(entry, request);
    }

    return this.createStatusResponse(roomId, entry);
  }

  getStatus(roomIdInput: string): DrawlessCoworkerRoomStatusResponse {
    const roomId = parseRoomIdOrThrow(roomIdInput);
    return this.createStatusResponse(roomId, this.entries.get(roomId) ?? null);
  }

  collectCanvasContext(
    requestInput: DrawlessCanvasContextRequest
  ): DrawlessCanvasContextSnapshot {
    const request = canvasContextRequestSchema.parse(requestInput);
    const roomId = parseRoomIdOrThrow(request.roomId);
    const entry = this.entries.get(roomId);
    if (!entry || !entry.client) {
      return createUnavailableCanvasContextSnapshot({
        roomId,
        reason: 'coworker 尚未进入这个 room，无法读取画布上下文。',
      });
    }
    if (entry.status === 'error' || entry.status === 'stopped') {
      return createUnavailableCanvasContextSnapshot({
        roomId,
        reason: `coworker room client 当前状态为 ${entry.status}，无法读取画布上下文。`,
      });
    }

    return createCanvasContextSnapshot({
      roomId,
      actorSessionId: entry.client.identity.sessionId,
      records: entry.client.getRecords(),
      recentlyChangedRecordIds: entry.recentlyChangedRecordIds,
      request,
    });
  }

  async streamConversation(requestInput: DrawlessCoworkerConversationStreamRequest) {
    const request = coworkerConversationStreamRequestSchema.parse(requestInput);
    const roomId = parseRoomIdOrThrow(request.roomId);

    return this.cursorChatReplyAgent.stream(createConversationPrompt(request), {
      activeTools: ['collect-canvas-context'],
      maxSteps: 6,
      memory: {
        resource: roomId,
        thread: `${roomId}:conversation`,
      },
    });
  }

  stop(roomIdInput: string): DrawlessCoworkerStopResponse {
    const roomId = parseRoomIdOrThrow(roomIdInput);
    const entry = this.entries.get(roomId);
    if (!entry) {
      return {
        roomId,
        stopped: false,
        status: 'not_started',
      };
    }

    entry.client.close();
    entry.status = 'stopped';
    entry.updatedAt = new Date().toISOString();
    // stop 后释放本地引用；下一次 start 会以新的 sync client 重新进入 room。
    this.entries.delete(roomId);

    return {
      roomId,
      stopped: true,
      status: 'stopped',
    };
  }

  private async waitForExistingIfNeeded(
    entry: CoworkerRoomEntry,
    request: DrawlessCoworkerStartRequest
  ) {
    if (!request.waitUntilLoaded || entry.status === 'online') {
      return;
    }

    try {
      entry.snapshot = await withTimeout(
        entry.client.waitUntilLoaded(),
        request.timeoutMs,
        `Coworker did not finish room hydration within ${request.timeoutMs}ms.`
      );
      entry.status = 'online';
      entry.lastError = null;
      entry.updatedAt = new Date().toISOString();
    } catch (error) {
      // 超时不立刻销毁 client；它可能仍会在稍后完成加载，状态会由回调继续修正。
      entry.lastError = error instanceof Error ? error.message : String(error);
      if (entry.status !== 'starting') {
        entry.status = 'error';
      }
      entry.updatedAt = new Date().toISOString();
    }
  }

  private createStatusResponse(
    roomId: DrawlessRoomId,
    entry: CoworkerRoomEntry | null
  ): DrawlessCoworkerRoomStatusResponse {
    if (!entry) {
      return {
        roomId,
        active: false,
        status: 'not_started',
        identity: null,
        snapshot: null,
        lastError: null,
        startedAt: null,
        updatedAt: null,
      };
    }

    return {
      roomId,
      // error/stopped/not_started 都不算可用 session，server 可以据此决定是否重试 start。
      active: ['starting', 'online', 'offline'].includes(entry.status),
      status: entry.status,
      identity: entry.client.identity,
      snapshot: entry.snapshot,
      lastError: entry.lastError,
      startedAt: entry.startedAt,
      updatedAt: entry.updatedAt,
    };
  }
}

function createConversationPrompt(request: DrawlessCoworkerConversationStreamRequest) {
  return [
    '你正在 drawless 的 tldraw 画布里，以 coworker 身份通过 conversation chat 和用户长对话。',
    '这是长对话通道，不是 cursor chat。你可以给完整分析、步骤、建议和需要确认的问题。',
    '当用户问题涉及当前画布内容、选区、结构、连线、frame/group、最近变化或“这里/这个”时，先调用 collect-canvas-context。',
    '当前阶段你只能只读观察和回复，不要声称已经修改画布，也不要输出已执行画布操作。',
    '',
    `房间：${request.roomId}`,
    `用户 conversation chat：${request.message}`,
  ].join('\n');
}

function mergeRecentRecordIds(nextIds: string[], existingIds: string[]) {
  // 最近变化只保留一个短窗口，避免把历史事件误当成长期画布事实。
  return [...new Set([...nextIds, ...existingIds].map((id) => id.trim()).filter(Boolean))].slice(
    0,
    40
  );
}

function parseRoomIdOrThrow(roomId: string) {
  const result = parseDrawlessRoomId(roomId);
  if (!result.ok) {
    throw new Error(result.reason);
  }

  return result.value;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}
