import {
  canvasEditRequestSchema,
  canvasContextRequestSchema,
  coworkerConversationToolApprovalRequestSchema,
  coworkerConversationStreamRequestSchema,
  parseDrawlessRoomId,
  type DrawlessCanvasEditRequest,
  type DrawlessCanvasEditResult,
  type DrawlessCanvasContextRequest,
  type DrawlessCanvasContextSnapshot,
  type DrawlessCoworkerConversationToolApprovalRequest,
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
import { createUnavailableCanvasEditResult } from '../tools/canvas-edit-executor';

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
      if (request.sendIntroCursorChat && existing.status === 'online') {
        // 已在线的 coworker 复用原 presence 发入场提示，避免创建第二个光标身份。
        void sendIntroCursorChats(existing.client);
      }
      return this.createStatusResponse(roomId, existing);
    }

    // error/stopped entry 不复用，避免一个坏连接继续占着 room 生命周期。
    existing?.client.close();
    const now = new Date().toISOString();
    let entry!: CoworkerRoomEntry;
    let introCursorChatSent = false;
    const sendIntroCursorChatsOnce = () => {
      if (!request.sendIntroCursorChat || introCursorChatSent) {
        return;
      }
      introCursorChatSent = true;
      // onLoad 和 waitUntilLoaded 都可能观察到 online；这里统一做一次性保护。
      void sendIntroCursorChats(client);
    };
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
        sendIntroCursorChatsOnce();
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

    if (entry.status === 'online') {
      sendIntroCursorChatsOnce();
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

  async applyCanvasEdit(requestInput: DrawlessCanvasEditRequest): Promise<DrawlessCanvasEditResult> {
    const request = canvasEditRequestSchema.parse(requestInput);
    const roomId = parseRoomIdOrThrow(request.roomId);
    const entry = this.entries.get(roomId);
    if (!entry || !entry.client) {
      return createUnavailableCanvasEditResult({
        roomId,
        reason: 'coworker 尚未进入这个 room，无法写入画布。',
      });
    }
    if (entry.status !== 'online') {
      return createUnavailableCanvasEditResult({
        roomId,
        reason: `coworker room client 当前状态为 ${entry.status}，尚未在线，无法写入画布。`,
      });
    }

    const result = await entry.client.applyCanvasEdit(request);
    if (result.applied) {
      entry.snapshot = entry.client.getSnapshot();
      entry.recentlyChangedRecordIds = mergeRecentRecordIds(
        [...result.createdRecordIds, ...result.updatedRecordIds, ...result.deletedRecordIds],
        entry.recentlyChangedRecordIds
      );
      entry.updatedAt = new Date().toISOString();
    }

    return result;
  }

  async streamConversation(
    requestInput: DrawlessCoworkerConversationStreamRequest,
    options: { abortSignal?: AbortSignal | undefined } = {}
  ) {
    const request = coworkerConversationStreamRequestSchema.parse(requestInput);
    const roomId = parseRoomIdOrThrow(request.roomId);

    return this.cursorChatReplyAgent.stream(createConversationPrompt(request), {
      activeTools: ['collect-canvas-context', 'edit-canvas'],
      maxSteps: 6,
      abortSignal: options.abortSignal,
      memory: {
        resource: roomId,
        thread: `${roomId}:conversation`,
      },
    });
  }

  async approveConversationToolCall(
    roomIdInput: string,
    requestInput: DrawlessCoworkerConversationToolApprovalRequest
  ) {
    parseRoomIdOrThrow(roomIdInput);
    const request = coworkerConversationToolApprovalRequestSchema.parse(requestInput);
    return this.cursorChatReplyAgent.approveToolCall({
      runId: request.runId,
      toolCallId: request.toolCallId,
    });
  }

  async declineConversationToolCall(
    roomIdInput: string,
    requestInput: DrawlessCoworkerConversationToolApprovalRequest
  ) {
    parseRoomIdOrThrow(roomIdInput);
    const request = coworkerConversationToolApprovalRequestSchema.parse(requestInput);
    return this.cursorChatReplyAgent.declineToolCall({
      runId: request.runId,
      toolCallId: request.toolCallId,
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

const INTRO_CURSOR_CHAT_MESSAGES = [
  '你好，我已进入画布。',
  '可在cursor chat短聊。',
  '点“对话”可派任务。',
];
// 入场提示依赖 tldraw 的 presence overlay；稍微延迟能让 web 端先渲染出 coworker 光标。
const INTRO_CURSOR_CHAT_INITIAL_DELAY_MS = 800;
// 每条消息展示约 2 秒，间隔略长一点，避免上一条自动清空 timer 影响下一条。
const INTRO_CURSOR_CHAT_INTERVAL_MS = 2400;
// 默认把入场光标放在首屏画布内，避开左上工具栏和右侧样式面板。
const INTRO_CURSOR_CHAT_CURSOR = { x: 220, y: 180 };

async function sendIntroCursorChats(client: DrawlessCoworkerRoomClient) {
  // 首次入场时稍等一拍，给 web 端协作者列表和 presence overlay 留出渲染时间。
  await wait(INTRO_CURSOR_CHAT_INITIAL_DELAY_MS);
  for (const [index, message] of INTRO_CURSOR_CHAT_MESSAGES.entries()) {
    client.sendCursorChat(message, {
      x: INTRO_CURSOR_CHAT_CURSOR.x,
      y: INTRO_CURSOR_CHAT_CURSOR.y + index * 24,
    });
    await wait(INTRO_CURSOR_CHAT_INTERVAL_MS);
  }
}

function createConversationPrompt(request: DrawlessCoworkerConversationStreamRequest) {
  const viewportLines = request.viewport
    ? [
        `用户当前可视 page：${request.viewport.currentPageId ?? '未知'}`,
        `用户当前可视区 bounds：x=${Math.round(request.viewport.viewportBounds.x)}, y=${Math.round(request.viewport.viewportBounds.y)}, w=${Math.round(request.viewport.viewportBounds.w)}, h=${Math.round(request.viewport.viewportBounds.h)}`,
        `用户当前可视区中心：x=${Math.round(request.viewport.viewportCenter.x)}, y=${Math.round(request.viewport.viewportCenter.y)}, zoom=${Number(request.viewport.zoom.toFixed(3))}`,
        '调用 edit-canvas 创建新对象时，currentPageId 优先使用用户当前可视 page；没有明确目标位置时，把对象放在用户当前可视区中心附近，避免画到用户看不到的位置。',
      ]
    : ['本次 conversation 没有收到用户可视区上下文；创建对象前优先调用 collect-canvas-context，并尽量围绕已有对象或当前 page 布局。'];

  return [
    '你正在 drawless 的 tldraw 画布里，以 coworker 身份通过 conversation chat 和用户长对话。',
    '这是长对话通道，不是 cursor chat。你可以给完整分析、步骤、建议和需要确认的问题。',
    '当用户问题涉及当前画布内容、选区、结构、连线、frame/group、最近变化或“这里/这个”时，先调用 collect-canvas-context。',
    '当用户明确要求你在画布上创建、移动、改文字、调整尺寸或连线时，可以调用 edit-canvas；这个工具会等待用户确认后才真正写入画布。',
    'edit-canvas 的 operations 必须是小步、明确、可审核的计划；不要一次性生成大量对象。',
    'edit-canvas 默认使用 performed 执行节奏，coworker 会像真实协作者一样移动光标并分步写入；只有用户要求快速批量处理时才设置 executionMode 为 instant。',
    '创建连线时，优先用 create_arrow 的 startBinding / endBinding 绑定 shape；连接同一次请求里刚创建的 shape 时，用 create_shape 的 operationId 作为 binding target。',
    'edit-canvas 返回结果前，不要声称已经修改画布；如果工具返回 warnings，要如实告知。',
    ...viewportLines,
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

function wait(timeoutMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
}
