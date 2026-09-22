import { createRoomRequestContext, renewRoomRequestContext } from './room-authority';
import { validateSyncTarget } from '../runtime-security';
import type { DrawlessAgentStreamOutput } from './cursor-chat-reply-handler';
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
} from '@drawless/shared';
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
  /** 当前 room 的空闲回收 timer。 */
  idleTimer: ReturnType<typeof setTimeout> | null;
  /** 房间停止时取消所有进行中的模型调用。 */
  lifetime: AbortController;
  /** 每个房间最多进行一个 AI 调用。 */
  busy: boolean;
  /** 当前房间生命周期的对话隔离标识。 */
  conversationEpoch: string;
};

/**
 * 管理 coworker 在各个 room 中的常驻 sync client。
 *
 * 这里是 coworker 进程内状态，不是画布事实源；真正的画布事实仍然只存在于 tldraw document / TLStore。
 */
export class DrawlessCoworkerRoomRegistry {
  // key 使用 roomId，保证每个 room 在当前 coworker 进程中最多只有一个常驻 client。
  private readonly entries = new Map<DrawlessRoomId, CoworkerRoomEntry>();

  private readonly approvals = new Map<string, { roomId: string; toolCallId: string; expires: number; context: ReturnType<typeof createRoomRequestContext> }>();

  constructor(private readonly cursorChatReplyAgent: DrawlessCursorChatReplyAgent) {}

  async start(
    roomIdInput: string,
    request: DrawlessCoworkerStartRequest
  ): Promise<DrawlessCoworkerRoomStatusResponse> {
    validateSyncTarget(request.serverUrl);
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
    if (existing) {
      this.disposeEntry(roomId, existing);
    }
    if (this.entries.size >= 64) throw new Error("coworker 房间数量已达上限。");
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
      syncRoute: request.syncRoute,
      accessToken: request.accessToken,
      onConnectionChange: (status) => {
        if (!entry) return;
        entry.status = status;
        entry.updatedAt = new Date().toISOString();
      },
      instanceId: request.instanceId,
      displayName: request.displayName,
      color: request.color,
      onLoad: (snapshot) => {
        // 首次 hydration 完成后，coworker 才算真正读到了 room 的画布事实。
        entry.status = 'online';
        entry.snapshot = snapshot;
        entry.lastError = null;
        this.touchEntry(roomId, entry);
        sendIntroCursorChatsOnce();
      },
      onRemoteChange: (snapshot, changedRecordIds) => {
        // 这里只保存轻量统计，不复制完整 tldraw document，避免制造第二套事实源。
        entry.snapshot = snapshot;
        entry.recentlyChangedRecordIds = mergeRecentRecordIds(
          changedRecordIds,
          entry.recentlyChangedRecordIds
        );
        this.touchEntry(roomId, entry);
      },
      onCursorChat: (event) => {
        // cursor chat 不落库，不变成第二套对话事实源；这里只触发一次临时 AI 回复。
        this.touchEntry(roomId, entry);
        if (entry.busy || event.message.length > 4000 || this.activeRunCount() >= 8) return;
        entry.busy = true;
        void replyToCursorChat({ client, event, agent: this.cursorChatReplyAgent,
          threadId: `${roomId}:${entry.conversationEpoch}:cursor`,
          signal: AbortSignal.any([entry.lifetime.signal, AbortSignal.timeout(60_000)]) })
          .finally(() => { entry.busy = false; });
      },
      onSyncError: (reason) => {
        entry.status = 'error';
        entry.lastError = reason;
        this.touchEntry(roomId, entry);
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
      idleTimer: null,
      lifetime: new AbortController(),
      busy: false,
      conversationEpoch: crypto.randomUUID(),
    };
    // 先登记 entry，再等待 hydration；这样 status 路由能立刻看到 starting 状态。
    this.entries.set(roomId, entry);
    this.scheduleIdleCleanup(roomId, entry, COWORKER_ROOM_IDLE_TTL_MS);

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
        reason: 'Drew 尚未进入这个 room，无法读取画布上下文。',
      });
    }
    if (entry.status !== 'online') {
      return createUnavailableCanvasContextSnapshot({
        roomId,
        reason: `Drew 的协同连接当前状态为 ${entry.status}，无法读取画布上下文。`,
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

  async applyCanvasEdit(requestInput: DrawlessCanvasEditRequest, signal?: AbortSignal): Promise<DrawlessCanvasEditResult> {
    const request = canvasEditRequestSchema.parse(requestInput);
    const roomId = parseRoomIdOrThrow(request.roomId);
    const entry = this.entries.get(roomId);
    if (!entry || !entry.client) {
      return createUnavailableCanvasEditResult({
        roomId,
        reason: 'Drew 尚未进入这个 room，无法写入画布。',
      });
    }
    if (entry.status !== 'online') {
      return createUnavailableCanvasEditResult({
        roomId,
        reason: `Drew 的协同连接当前状态为 ${entry.status}，尚未在线，无法写入画布。`,
      });
    }

    const result = await entry.client.applyCanvasEdit(request, signal);
    if (result.applied) {
      entry.snapshot = entry.client.getSnapshot();
      entry.recentlyChangedRecordIds = mergeRecentRecordIds(
        [...result.createdRecordIds, ...result.updatedRecordIds],
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
    return this.runConversation(roomId, options.abortSignal, false, (signal, requestContext) =>
      this.cursorChatReplyAgent.stream(createConversationPrompt(request), {
        activeTools: ['collect-canvas-context', 'edit-canvas'],
        maxSteps: 6,
        abortSignal: signal,
        requestContext,
        memory: { resource: roomId, thread: `${roomId}:${this.entries.get(roomId)!.conversationEpoch}:conversation` },
      })
    );
  }

  async approveConversationToolCall(roomIdInput: string, requestInput: DrawlessCoworkerConversationToolApprovalRequest, signal?: AbortSignal) {
    return this.resumeConversation(roomIdInput, requestInput, true, signal);
  }

  async declineConversationToolCall(roomIdInput: string, requestInput: DrawlessCoworkerConversationToolApprovalRequest, signal?: AbortSignal) {
    return this.resumeConversation(roomIdInput, requestInput, false, signal);
  }

  private async resumeConversation(roomIdInput: string, requestInput: DrawlessCoworkerConversationToolApprovalRequest, approved: boolean, signal?: AbortSignal) {
    const roomId = parseRoomIdOrThrow(roomIdInput);
    const request = coworkerConversationToolApprovalRequestSchema.parse(requestInput);
    const key = `${request.runId}:${request.toolCallId}`;
    const pending = this.approvals.get(key);
    if (!pending || pending.roomId !== roomId || pending.expires <= Date.now()) throw new Error('审批不存在、房间不匹配或已过期。');
    return this.runConversation(roomId, signal, approved, (abortSignal, requestContext) => {
      // 先取得房间运行槽，再原子消费；繁忙/离线拒绝不会使仍可重试的审批丢失。
      this.approvals.delete(key);
      const resume = { ...request, abortSignal, requestContext };
      return approved ? this.cursorChatReplyAgent.approveToolCall(resume) : this.cursorChatReplyAgent.declineToolCall(resume);
    }, pending.context);
  }

  private activeRunCount() {
    return [...this.entries.values()].filter((entry) => entry.busy).length;
  }

  private async runConversation(roomId: string, signal: AbortSignal | undefined, canWrite: boolean,
    run: (signal: AbortSignal, context: ReturnType<typeof createRoomRequestContext>) => Promise<DrawlessAgentStreamOutput>, contextToResume?: ReturnType<typeof createRoomRequestContext>) {
    const entry = this.entries.get(roomId);
    if (!entry || entry.status !== 'online') throw new Error('房间尚未在线。');
    if (entry.busy || this.activeRunCount() >= 8) throw new Error('AI 正在处理请求，请稍后重试。');
    entry.busy = true;
    this.touchEntry(roomId, entry);
    const controller = new AbortController();
    const combined = AbortSignal.any([controller.signal, entry.lifetime.signal, AbortSignal.timeout(120_000), ...(signal ? [signal] : [])]);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      controller.abort();
      entry.busy = false;
    };
    try {
      combined.throwIfAborted();
      const context = contextToResume ? renewRoomRequestContext(contextToResume, roomId, combined, canWrite) : createRoomRequestContext(roomId, combined, canWrite);
      const result = await run(combined, context);
      for (const [key, pending] of this.approvals) if (pending.expires <= Date.now()) this.approvals.delete(key);
      const approvals = this.approvals;
      const fullStream = result.fullStream;
      return {
        ...result,
        cancel: release,
        ...(fullStream ? { fullStream: (async function* () {
          try {
            for await (const chunk of fullStream) {
              combined.throwIfAborted();
              if (chunk && typeof chunk === 'object' && 'type' in chunk && chunk.type === 'tool-call-approval') {
                const event = chunk as { runId?: string; payload?: { runId?: string; toolCallId?: string; id?: string } };
                const runId = event.runId ?? event.payload?.runId ?? result.runId;
                const toolCallId = event.payload?.toolCallId ?? event.payload?.id;
                if (runId && toolCallId && approvals.size < 1000) approvals.set(`${runId}:${toolCallId}`, { roomId, toolCallId, expires: Date.now() + 30 * 60_000, context });
              }
              yield chunk;
            }
          } finally { release(); }
        })() } : {}),
      };
    } catch (error) { release(); throw error; }
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

    this.disposeEntry(roomId, entry);
    entry.status = 'stopped';
    entry.updatedAt = new Date().toISOString();

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
      this.touchEntry(entry.client.identity.roomId, entry);
    } catch (error) {
      entry.lastError = error instanceof Error ? error.message : String(error);
      if (entry.status === 'starting') {
        // 启动超时说明本次常驻 client 没有完成可用生命周期，立即释放，避免失败房间长期占用内存。
        entry.status = 'error';
        this.disposeEntry(entry.client.identity.roomId, entry);
      } else {
        entry.status = 'error';
        this.touchEntry(entry.client.identity.roomId, entry);
      }
    }
  }

  private touchEntry(roomId: DrawlessRoomId, entry: CoworkerRoomEntry) {
    entry.updatedAt = new Date().toISOString();
    this.scheduleIdleCleanup(roomId, entry, COWORKER_ROOM_IDLE_TTL_MS);
  }

  private scheduleIdleCleanup(
    roomId: DrawlessRoomId,
    entry: CoworkerRoomEntry,
    timeoutMs: number
  ) {
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
    }

    entry.idleTimer = setTimeout(() => {
      if (this.entries.get(roomId) !== entry) {
        return;
      }
      console.info(`[drawless coworker] stop idle room ${roomId}`);
      this.disposeEntry(roomId, entry);
    }, timeoutMs);
    entry.idleTimer.unref?.();
  }

  private disposeEntry(roomId: DrawlessRoomId, entry: CoworkerRoomEntry) {
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = null;
    }
    entry.lifetime.abort();
    for (const [key, pending] of this.approvals) if (pending.roomId === roomId) this.approvals.delete(key);
    entry.client.close();
    // stop 后释放本地引用；下一次 start 会以新的 sync client 重新进入 room。
    if (this.entries.get(roomId) === entry) {
      this.entries.delete(roomId);
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
  '你好，我是 Drew，已经来到画布。',
  '在光标旁可以和我短聊。',
  '点我的人物可以交代工作。',
];
// 入场提示依赖 tldraw 的 presence overlay；稍微延迟能让 web 端先渲染出 coworker 光标。
const INTRO_CURSOR_CHAT_INITIAL_DELAY_MS = 800;
// 每条消息展示约 2 秒，间隔略长一点，避免上一条自动清空 timer 影响下一条。
const INTRO_CURSOR_CHAT_INTERVAL_MS = 2400;
// 默认把入场光标放在首屏画布内，避开左上工具栏和右侧样式面板。
const INTRO_CURSOR_CHAT_CURSOR = { x: 220, y: 180 };
// coworker 是协同验证壳层，长时间无人触发时自动离开，避免每个 room 永久持有 TLStore。
const COWORKER_ROOM_IDLE_TTL_MS = 30 * 60 * 1000;

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
    '你是 Drew，正在 Drawless 的 tldraw 画布里，以画布搭档身份通过 conversation chat 和用户长对话。',
    '这是长对话通道，不是 cursor chat。你可以给完整分析、步骤、建议和需要确认的问题。',
    '当用户问题涉及当前画布内容、选区、结构、连线、frame/group、最近变化或“这里/这个”时，先调用 collect-canvas-context。',
    '当用户明确要求你在画布上创建、移动、改文字、调整尺寸或连线，且必要信息已经足够时，必须在同一次回应中调用 edit-canvas；这个工具会等待用户在产品审批单中确认后才真正写入画布。',
    '不能只用正文描述“创建计划”并询问是否确认；文字计划不能替代 edit-canvas 的结构化审批。只有缺失信息会实质改变结果时才先澄清。',
    'edit-canvas 的 operations 必须是小步、明确、可审核的计划；不要一次性生成大量对象。',
    'edit-canvas 会由 coworker runtime 按受控步骤写入画布；operations 必须小步、明确、可审核。',
    '创建连线时，优先用 create_arrow 的 startBinding / endBinding 绑定 shape；连接同一次请求里刚创建的 shape 时，用 create_shape 的 operationId 作为 binding target。',
    'binding target 使用 operationId 时必须完全省略 shapeId 字段，绝不能把可选 shapeId 写成空字符串。',
    '创建流程、状态或备注类对象时，可以用 styleRole 表达语义化视觉角色，例如 start、step、decision、success、error、note；不要编造 color、fill、size 等底层样式字段。',
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
