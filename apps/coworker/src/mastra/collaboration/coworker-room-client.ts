import {
  TLSyncClient,
  type TLPresenceMode,
} from '@tldraw/sync-core';
import {
  InstancePresenceRecordType,
  atom,
  createTLStore,
  type TLInstancePresence,
  type TLPageId,
  type TLRecord,
  type TLShapeId,
  type TLStore,
} from 'tldraw';
import { NodeWebSocketSyncAdapter } from './node-sync-socket';

import {
  DRAWLESS_COWORKER_DISPLAY_NAME,
  createDrawlessCoworkerSessionId,
  parseDrawlessRoomId,
  type DrawlessCanvasEditRequest,
  type DrawlessCanvasEditResult,
  type DrawlessCoworkerIdentity,
  type DrawlessCoworkerRoomSnapshotSummary,
  type DrawlessRoomId,
  type DrawlessSessionId,
} from '@drawless/shared';
import {
  performCanvasEditToStore,
  createUnavailableCanvasEditResult,
  type CanvasEditPresencePatch,
} from '../tools/canvas-edit-executor';

export type DrawlessCoworkerRoomClientOptions = {
  /** coworker 要进入的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** drawless server 的 HTTP 或 WebSocket 基础地址。 */
  serverUrl: string;
  /** 后端统一的协同路由前缀。 */
  syncRoute?: string | undefined;
  /** server 签发的当前房间访问凭据。 */
  accessToken?: string | undefined;
  /** coworker 当前运行实例 ID；不传时自动生成。 */
  instanceId?: string;
  /** coworker 在协同身份中使用的展示名称。 */
  displayName?: string;
  /** coworker 在协同身份中使用的展示颜色。 */
  color?: string;
  /** 连接和 hydration 生命周期变化的回调。 */
  onConnectionChange?: (status: 'starting' | 'online' | 'offline' | 'error') => void;
  /** 每次 hydration 完成后的回调。 */
  onLoad?: (snapshot: DrawlessCoworkerRoomSnapshot) => void;
  /** sync 协议报告不可恢复错误时的回调。 */
  onSyncError?: (reason: string) => void;
  /** 本地 TLStore 观察到远端文档变化时的回调。 */
  onRemoteChange?: (snapshot: DrawlessCoworkerRoomSnapshot, changedRecordIds: string[]) => void;
  /** coworker 观察到用户 cursor chat 时的回调。 */
  onCursorChat?: (event: DrawlessCoworkerCursorChatEvent) => void;
};

export type DrawlessCoworkerRoomSnapshot = DrawlessCoworkerRoomSnapshotSummary;

export type DrawlessCoworkerCursorChatEvent = {
  /** cursor chat 所属的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 发送 cursor chat 的协作者 userId。 */
  userId: string;
  /** 发送 cursor chat 的协作者名称。 */
  userName: string;
  /** cursor chat 文本。 */
  message: string;
  /** cursor chat 所在 page ID。 */
  currentPageId: string;
  /** cursor chat 对应的 cursor 位置。 */
  cursor: { x: number; y: number } | null;
  /** coworker 观察到这条消息的时间。 */
  observedAt: string;
};

export type DrawlessCoworkerRoomClient = {
  /** coworker 的稳定协同身份。 */
  identity: DrawlessCoworkerIdentity;
  /** coworker 本地同步后的 tldraw store。 */
  store: TLStore;
  /** 等待当前连接周期从 sync room 加载完成。 */
  waitUntilLoaded: () => Promise<DrawlessCoworkerRoomSnapshot>;
  /** 获取当前 store 中的所有 records。 */
  getRecords: () => TLRecord[];
  /** 获取当前 store 的轻量统计快照。 */
  getSnapshot: () => DrawlessCoworkerRoomSnapshot;
  /** 通过 coworker presence 发送一条 cursor chat。 */
  sendCursorChat: (message: string, cursor?: { x: number; y: number }) => void;
  /** 通过 coworker 本地 TLStore 应用受控画布编辑。 */
  applyCanvasEdit: (request: DrawlessCanvasEditRequest, signal?: AbortSignal) => Promise<DrawlessCanvasEditResult>;
  /** 关闭 sync client 和 WebSocket adapter。 */
  close: () => void;
};

export function createDrawlessCoworkerRoomClient(
  options: DrawlessCoworkerRoomClientOptions
): DrawlessCoworkerRoomClient {
  // coworker 的 sessionId 需要稳定、可识别，后续排查同一 room 多个 coworker 实例时会用到。
  const roomId = parseRoomIdOrThrow(options.roomId);
  const instanceId = options.instanceId?.trim() || createInstanceId();
  const sessionId = createDrawlessCoworkerSessionId({ roomId, instanceId });
  const identity: DrawlessCoworkerIdentity = {
    roomId,
    sessionId,
    displayName: options.displayName?.trim() || DRAWLESS_COWORKER_DISPLAY_NAME,
    color: options.color?.trim() || '#2563eb',
    instanceId,
  };
  let load = createDeferred<DrawlessCoworkerRoomSnapshot>();
  let hydrated = false;
  let closed = false;
  let queuedEdits = 0;
  const lifetime = new AbortController();
  const socketStatus = atom<'online' | 'offline'>('drawless-coworker-socket-status', 'offline');
  const collaborationMode = atom<'readonly' | 'readwrite'>(
    'drawless-coworker-collaboration-mode',
    'readonly'
  );
  const presence = atom<TLInstancePresence | null>('drawless-coworker-presence', null);
  const presenceMode = atom<TLPresenceMode>('drawless-coworker-presence-mode', 'full');
  // 已经处理过的用户 cursor chat。这里只保留最近窗口，避免长期运行时按历史消息无限增长。
  const handledCursorChats = new Set<string>();
  // 按远端 presence id 做防抖。用户输入 cursor chat 时，chatMessage 会随着打字不断变化；
  // 这里等输入稳定一小会儿，再交给上层决定是否回复。
  const pendingCursorChatTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // coworker 自己发出的 cursor chat 也要自动清空，否则气泡会长时间停留在画布上。
  let clearCursorChatTimer: ReturnType<typeof setTimeout> | null = null;
  // 写画布操作按 room 串行执行，避免两个 tool call 同时推动同一个 coworker 光标。
  let editQueue: Promise<unknown> = Promise.resolve();

  installNodeRuntimeAdapters();

  const store = createTLStore({
    id: `drawless-coworker:${roomId}:${instanceId}`,
    collaboration: {
      // 默认只读；真正执行 edit-canvas 工具时才会临时切到 readwrite。
      status: socketStatus,
      mode: collaborationMode,
    },
  });
  // coworker 必须提供自己的 instance_presence，web 端才会把它当作真实协作者展示。
  // chatMessage 初始为空；后续收到用户 cursor chat 后，只更新这个 presence。
  presence.set(createCoworkerPresence({
    identity,
    store,
    chatMessage: '',
    cursor: { x: 0, y: 0 },
  }));
  const socket = new NodeWebSocketSyncAdapter(() =>
    createSyncRoomUri({
      serverUrl: options.serverUrl,
      syncRoute: options.syncRoute,
      accessToken: options.accessToken,
      roomId,
      sessionId,
    })
  );
  const client = new TLSyncClient<TLRecord, TLStore>({
    store,
    socket,
    // TLSyncClient 的泛型按 TLRecord 约束；TLInstancePresence 本身也是 TLRecord。
    // 这里保持 coworker 内部使用更具体的 TLInstancePresence，传给 sync client 时收窄为 TLRecord。
    presence: presence as unknown as ReturnType<typeof atom<TLRecord | null>>,
    presenceMode,
    onLoad: () => {},
    onAfterConnect: () => {
      hydrated = true;
      socketStatus.set('online');
      options.onConnectionChange?.('online');
      const snapshot = createRoomSnapshot({ roomId, sessionId, store });
      options.onLoad?.(snapshot);
      load.resolve(snapshot);
    },
    onSyncError: (reason) => {
      hydrated = false;
      options.onConnectionChange?.('error');
      options.onSyncError?.(reason);
      load.reject(new Error(reason));
    },
  });
  // TLSyncClient 会监听 socket 状态；这里额外同步到 TLStore collaboration props，
  // 方便后续如果要把 coworker 状态暴露给 Mastra 或 server 控制面。
  const unlistenStatus = socket.onStatusChange((event) => {
    if (event.status !== 'online') {
      if (hydrated) load = createDeferred<DrawlessCoworkerRoomSnapshot>();
      hydrated = false;
      socketStatus.set('offline');
      options.onConnectionChange?.(event.status);
    } else if (!hydrated) {
      options.onConnectionChange?.('starting');
    }
  });
  // 只监听 remote document 变化，避免把 coworker 自己的本地临时状态误当成用户画布操作。
  const unlistenStore = store.listen(
    ({ source, changes }) => {
      if (source !== 'remote') {
        return;
      }
      options.onRemoteChange?.(
        createRoomSnapshot({ roomId, sessionId, store }),
        getChangedRecordIds(changes)
      );
    },
    { source: 'remote', scope: 'document' }
  );
  const unlistenPresence = store.listen(
    ({ changes }) => {
      // 远端用户的 cursor chat 会以 instance_presence diff 的形式进入本地 TLStore。
      // 只看 added/updated 即可；removed 表示协作者离线或 presence 被清理，不需要回复。
      for (const record of [
        ...Object.values(changes.added),
        ...Object.values(changes.updated).map(([, next]) => next),
      ]) {
        if (!isRemotePresence(record, identity)) {
          continue;
        }

        scheduleCursorChatObservation({
          roomId,
          presenceRecord: record,
          timers: pendingCursorChatTimers,
          handledCursorChats,
          onCursorChat: options.onCursorChat,
        });
      }
    },
    { source: 'remote', scope: 'presence' }
  );
  // 先让 TLSyncClient 注册监听器，再真正打开 WebSocket，避免错过首次 online 事件。
  socket.restart();

  return {
    identity,
    store,
    waitUntilLoaded: () => load.promise,
    getRecords: () => store.allRecords(),
    getSnapshot: () => createRoomSnapshot({ roomId, sessionId, store }),
    sendCursorChat: (message, cursor) => {
      // 暴露一个小的手动发送入口，后续接入 AI 或自定义 API 时可以复用同一条 presence 写入路径。
      if (closed || !hydrated) return;
      publishCoworkerCursorChat({
        identity,
        localPresence: presence,
        message,
        cursor,
        getClearTimer: () => clearCursorChatTimer,
        setClearTimer: (timer) => {
          clearCursorChatTimer = timer;
        },
      });
    },
    applyCanvasEdit: (request, signal) => {
      if (queuedEdits >= 4) return Promise.resolve(createUnavailableCanvasEditResult({ roomId, reason: '当前房间的编辑队列已满。' }));
      queuedEdits += 1;
      const runEdit = async () => {
        const assertCanWrite = () => {
          signal?.throwIfAborted();
          if (closed || lifetime.signal.aborted || !hydrated || socket.connectionStatus !== 'online') throw new Error('Drew 尚未完成同步，无法写入画布。');
          if (request.roomId !== roomId) throw new Error('编辑计划与协同房间不一致。');
        };
        const previousMode = collaborationMode.get();
        let localResult: DrawlessCanvasEditResult | null = null;
        try {
          assertCanWrite();
          const before = new Map(request.operations.flatMap(operation => 'shapeId' in operation
            ? [[operation.shapeId, JSON.stringify(store.get(operation.shapeId as TLShapeId))] as const] : []));
          const baseline = socket.getDocumentRevision();
          collaborationMode.set('readwrite');
          localResult = await performCanvasEditToStore({
            store, request, fallbackPageId: findCurrentPageId(store, identity.sessionId), assertCanWrite,
            presence: { updatePresence: (patch: CanvasEditPresencePatch) => updateCoworkerPresence({ identity, localPresence: presence, patch }) },
          });
          assertCanWrite();
          const changedIds = [...localResult.createdRecordIds, ...localResult.updatedRecordIds].filter(id =>
            before.get(id) !== JSON.stringify(store.get(id as TLShapeId)));
          await socket.waitForRecords(changedIds, baseline, signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal);
          return localResult;
        } catch (error) {
          return {
            ...(localResult ?? createUnavailableCanvasEditResult({ roomId, reason: '没有修改画布。' })),
            applied: false,
            warnings: [error instanceof Error ? error.message : '无法确认画布修改。'],
            summary: localResult?.applied ? '部分修改可能已经提交，但尚未得到服务器确认，请检查画布后再决定下一步。' : '没有提交画布修改。',
          };
        } finally {
          collaborationMode.set(previousMode);
          queuedEdits -= 1;
        }
      };
      const result = editQueue.then(runEdit, runEdit);
      editQueue = result.then(() => undefined, () => undefined);
      return result;
    },
    close: () => {
      if (closed) return;
      closed = true;
      hydrated = false;
      lifetime.abort();
      load.reject(new Error('房间连接已关闭。'));
      unlistenStore();
      unlistenPresence();
      unlistenStatus();
      // 关闭 room client 时清掉所有 timer，避免 stop 后还有延迟回复写入已经关闭的 presence。
      for (const timer of pendingCursorChatTimers.values()) {
        clearTimeout(timer);
      }
      if (clearCursorChatTimer) {
        clearTimeout(clearCursorChatTimer);
      }
      client.close();
      socket.close();
    },
  };
}

function scheduleCursorChatObservation(input: {
  roomId: DrawlessRoomId;
  presenceRecord: TLInstancePresence;
  timers: Map<string, ReturnType<typeof setTimeout>>;
  handledCursorChats: Set<string>;
  onCursorChat?: (event: DrawlessCoworkerCursorChatEvent) => void;
}) {
  const message = input.presenceRecord.chatMessage.trim();
  if (!message) {
    // 空字符串通常表示 cursor chat 已被 tldraw 自动清空。
    return;
  }

  const chatKey = `${input.presenceRecord.id}:${message}`;
  if (input.handledCursorChats.has(chatKey)) {
    // 同一个协作者、同一段文本只回复一次。
    return;
  }

  const existingTimer = input.timers.get(input.presenceRecord.id);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // cursor chat 会随着用户输入不断更新；稍微等一下，避免用户每敲一个字 coworker 都回复。
  const timer = setTimeout(() => {
    input.timers.delete(input.presenceRecord.id);
    rememberCursorChat(input.handledCursorChats, chatKey);
    // room client 只负责把 tldraw presence 变化翻译成观察事件。
    // 是否回复、如何回复交给上层 AI handler，避免协同传输层夹带业务策略。
    input.onCursorChat?.({
      roomId: input.roomId,
      userId: input.presenceRecord.userId,
      userName: input.presenceRecord.userName,
      message,
      currentPageId: input.presenceRecord.currentPageId,
      cursor: input.presenceRecord.cursor
        ? { x: input.presenceRecord.cursor.x, y: input.presenceRecord.cursor.y }
        : null,
      observedAt: new Date().toISOString(),
    });
  }, 3000);

  input.timers.set(input.presenceRecord.id, timer);
}

const HANDLED_CURSOR_CHAT_LIMIT = 200;

function rememberCursorChat(handledCursorChats: Set<string>, chatKey: string) {
  handledCursorChats.add(chatKey);
  while (handledCursorChats.size > HANDLED_CURSOR_CHAT_LIMIT) {
    const oldest = handledCursorChats.values().next().value as string | undefined;
    if (!oldest) {
      break;
    }
    handledCursorChats.delete(oldest);
  }
}

function publishCoworkerCursorChat(input: {
  identity: DrawlessCoworkerIdentity;
  localPresence: ReturnType<typeof atom<TLInstancePresence | null>>;
  message: string;
  cursor?: { x: number; y: number };
  getClearTimer: () => ReturnType<typeof setTimeout> | null;
  setClearTimer: (timer: ReturnType<typeof setTimeout> | null) => void;
}) {
  const currentPresence = input.localPresence.get();
  if (!currentPresence) {
    return;
  }

  const chatMessage = input.message.trim();
  if (!chatMessage) {
    return;
  }

  const clearTimer = input.getClearTimer();
  if (clearTimer) {
    // 如果 coworker 连续发出两条 cursor chat，上一条的清空 timer 不应该把新消息提前清掉。
    clearTimeout(clearTimer);
  }

  // 更新 presence signal 后，TLSyncClient 会把 presence diff 推送给 sync room。
  // 这里没有写 tldraw document，所以不会改动画布事实源。
  input.localPresence.set({
    ...currentPresence,
    cursor: input.cursor
      ? { x: input.cursor.x, y: input.cursor.y, type: 'default', rotation: 0 }
      : currentPresence.cursor,
    chatMessage,
    lastActivityTimestamp: Date.now(),
  });

  // tldraw cursor chat 是临时现场消息；PoC 里按官方行为附近的节奏自动清空。
  input.setClearTimer(
    setTimeout(() => {
      const latestPresence = input.localPresence.get();
      if (!latestPresence || latestPresence.userId !== input.identity.sessionId) {
        return;
      }
      input.localPresence.set({
        ...latestPresence,
        chatMessage: '',
        lastActivityTimestamp: Date.now(),
      });
      input.setClearTimer(null);
    }, 2_000)
  );
}

function updateCoworkerPresence(input: {
  identity: DrawlessCoworkerIdentity;
  localPresence: ReturnType<typeof atom<TLInstancePresence | null>>;
  patch: CanvasEditPresencePatch;
}) {
  const currentPresence = input.localPresence.get();
  if (!currentPresence || currentPresence.userId !== input.identity.sessionId) {
    return;
  }

  input.localPresence.set({
    ...currentPresence,
    currentPageId: (input.patch.currentPageId ?? currentPresence.currentPageId) as TLPageId,
    cursor:
      input.patch.cursor === undefined
        ? currentPresence.cursor
        : input.patch.cursor
          ? {
              x: input.patch.cursor.x,
              y: input.patch.cursor.y,
              type: 'default',
              rotation: 0,
            }
          : null,
    selectedShapeIds:
      input.patch.selectedShapeIds === undefined
        ? currentPresence.selectedShapeIds
        : input.patch.selectedShapeIds.map((shapeId) => shapeId as TLShapeId),
    chatMessage:
      input.patch.chatMessage === undefined ? currentPresence.chatMessage : input.patch.chatMessage,
    lastActivityTimestamp: Date.now(),
  });
}

function createCoworkerPresence(input: {
  identity: DrawlessCoworkerIdentity;
  store: TLStore;
  chatMessage: string;
  cursor: { x: number; y: number };
}): TLInstancePresence {
  // InstancePresenceRecordType 会补齐 tldraw presence 的默认字段，并做运行时结构校验。
  return InstancePresenceRecordType.create({
    id: InstancePresenceRecordType.createId(input.identity.sessionId),
    userId: input.identity.sessionId,
    userName: input.identity.displayName,
    color: input.identity.color,
    currentPageId: findCurrentPageId(input.store),
    cursor: {
      x: input.cursor.x,
      y: input.cursor.y,
      type: 'default',
      rotation: 0,
    },
    chatMessage: input.chatMessage,
    meta: {
      role: 'coworker',
      roomId: input.identity.roomId,
      instanceId: input.identity.instanceId,
    },
  });
}

function isRemotePresence(
  record: TLRecord,
  identity: DrawlessCoworkerIdentity
): record is TLInstancePresence {
  // 只处理其他协作者的 instance_presence，避免 coworker 看到自己发出的 chat 后自问自答。
  return (
    record.typeName === 'instance_presence' &&
    'userId' in record &&
    record.userId !== identity.sessionId &&
    'chatMessage' in record
  );
}

function findCurrentPageId(store: TLStore, excludeSessionId?: DrawlessSessionId): TLPageId {
  // TLInstancePresence 必须带 currentPageId。Node 侧没有 Editor 实例，
  // 所以从 store records 中尽量推断当前 page。
  const remotePresenceRecord = store.allRecords().find((record) => {
    return (
      record.typeName === 'instance_presence' &&
      'userId' in record &&
      record.userId !== excludeSessionId &&
      'currentPageId' in record &&
      typeof record.currentPageId === 'string'
    );
  });
  if (remotePresenceRecord && 'currentPageId' in remotePresenceRecord) {
    return remotePresenceRecord.currentPageId as TLPageId;
  }

  const instanceRecord = store.allRecords().find((record) => record.id === 'instance:instance');
  if (
    instanceRecord &&
    'currentPageId' in instanceRecord &&
    typeof instanceRecord.currentPageId === 'string'
  ) {
    return instanceRecord.currentPageId as TLPageId;
  }

  const pageRecord = store.allRecords().find((record) => record.typeName === 'page');
  if (pageRecord) {
    return pageRecord.id as TLPageId;
  }

  // createTLStore 默认会有 page:page；这里作为兜底，避免极端空 store 下无法创建 presence。
  return 'page:page' as TLPageId;
}

export function createSyncRoomUri(input: {
  /** drawless server 的 HTTP 或 WebSocket 基础地址。 */
  serverUrl: string;
  /** 自定义协同路由前缀。 */
  syncRoute?: string | undefined;
  /** 当前房间访问凭据。 */
  accessToken?: string | undefined;
  /** 要连接的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 当前客户端使用的 session ID。 */
  sessionId: DrawlessSessionId;
}) {
  const url = new URL(input.serverUrl);
  // serverUrl 允许传 http(s) 或 ws(s)，这里统一转换成 WebSocket 协议。
  url.protocol = url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:';
  url.pathname = joinUrlPath(url.pathname, input.syncRoute ?? '/sync', encodeURIComponent(input.roomId));
  url.search = '';
  url.hash = '';
  url.searchParams.set('sessionId', input.sessionId);
  if (input.accessToken) url.searchParams.set('accessToken', input.accessToken);

  return url.toString();
}

function parseRoomIdOrThrow(roomId: DrawlessRoomId) {
  const result = parseDrawlessRoomId(roomId);
  if (!result.ok) {
    throw new Error(result.reason);
  }

  return result.value;
}

function createRoomSnapshot(input: {
  roomId: DrawlessRoomId;
  sessionId: DrawlessSessionId;
  store: TLStore;
}): DrawlessCoworkerRoomSnapshot {
  const records = input.store.allRecords();

  // 这里返回的是轻量统计，不复制完整 document；真正的画布事实仍保留在 TLStore 中。
  return {
    roomId: input.roomId,
    sessionId: input.sessionId,
    recordCount: records.length,
    documentRecordCount: records.filter((record) => input.store.scopedTypes.document.has(record.typeName))
      .length,
    shapeCount: records.filter((record) => record.typeName === 'shape').length,
    presenceCount: records.filter((record) => input.store.scopedTypes.presence.has(record.typeName))
      .length,
    capturedAt: new Date().toISOString(),
  };
}

function getChangedRecordIds(changes: {
  added: Record<string, TLRecord>;
  updated: Record<string, [TLRecord, TLRecord]>;
  removed: Record<string, TLRecord>;
}) {
  return [
    ...Object.keys(changes.added),
    ...Object.keys(changes.updated),
    ...Object.keys(changes.removed),
  ];
}

function joinUrlPath(...parts: string[]) {
  return `/${parts
    .flatMap((part) => part.split('/'))
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/')}`;
}

function installNodeRuntimeAdapters() {
  const globalObject = globalThis as Record<string, unknown>;
  if (!globalObject.WebSocket) {
    // sync-core 客户端按浏览器环境设计，Node 里需要显式提供 WebSocket 构造器。
    globalObject.WebSocket = WebSocket;
  }
  if (!globalObject.requestAnimationFrame) {
    // tldraw store 的调度器依赖 requestAnimationFrame；Node PoC 用 setTimeout 模拟一帧。
    globalObject.requestAnimationFrame = (callback: FrameRequestCallback) =>
      setTimeout(() => callback(Date.now()), 16) as unknown as number;
  }
  if (!globalObject.cancelAnimationFrame) {
    globalObject.cancelAnimationFrame = (handle: number) => {
      clearTimeout(handle);
    };
  }
}

function createInstanceId() {
  return `instance-${crypto.randomUUID()}`;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  // 不等待 hydration 的调用方也不能产生未处理的 Promise rejection。
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
}
