import {
  JsonChunkAssembler,
  TLSyncClient,
  type TLPersistentClientSocket,
  type TLPresenceMode,
  type TLSocketStatusChangeEvent,
} from '@tldraw/sync-core';
import { atom, createTLStore, type TLRecord, type TLStore } from 'tldraw';
import WebSocket from 'ws';

import {
  createDrawlessCoworkerSessionId,
  parseDrawlessRoomId,
  type DrawlessCoworkerIdentity,
  type DrawlessCoworkerRoomSnapshotSummary,
  type DrawlessRoomId,
  type DrawlessSessionId,
} from '../../../../../packages/shared/src/index';

export type DrawlessCoworkerRoomClientOptions = {
  /** coworker 要进入的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** drawless server 的 HTTP 或 WebSocket 基础地址。 */
  serverUrl: string;
  /** coworker 当前运行实例 ID；不传时自动生成。 */
  instanceId?: string;
  /** coworker 在协同身份中使用的展示名称。 */
  displayName?: string;
  /** coworker 在协同身份中使用的展示颜色。 */
  color?: string;
  /** 首次从 sync room 完成加载后的回调。 */
  onLoad?: (snapshot: DrawlessCoworkerRoomSnapshot) => void;
  /** sync 协议报告不可恢复错误时的回调。 */
  onSyncError?: (reason: string) => void;
  /** 本地 TLStore 观察到远端文档变化时的回调。 */
  onRemoteChange?: (snapshot: DrawlessCoworkerRoomSnapshot) => void;
};

export type DrawlessCoworkerRoomSnapshot = DrawlessCoworkerRoomSnapshotSummary;

export type DrawlessCoworkerRoomClient = {
  /** coworker 的稳定协同身份。 */
  identity: DrawlessCoworkerIdentity;
  /** coworker 本地同步后的 tldraw store。 */
  store: TLStore;
  /** 等待首次从 sync room 加载完成。 */
  waitUntilLoaded: () => Promise<DrawlessCoworkerRoomSnapshot>;
  /** 获取当前 store 中的所有 records。 */
  getRecords: () => TLRecord[];
  /** 获取当前 store 的轻量统计快照。 */
  getSnapshot: () => DrawlessCoworkerRoomSnapshot;
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
    displayName: options.displayName?.trim() || 'Drawless Coworker',
    color: options.color?.trim() || '#2563eb',
    instanceId,
  };
  const load = createDeferred<DrawlessCoworkerRoomSnapshot>();
  const socketStatus = atom<'online' | 'offline'>('drawless-coworker-socket-status', 'offline');
  const collaborationMode = atom<'readonly' | 'readwrite'>(
    'drawless-coworker-collaboration-mode',
    'readonly'
  );
  // 这个 PoC 只验证 coworker 能通过 sync 协议进入 room 并读取 document。
  // presence 先保持为 null，避免在 UI 里展示一个还没有交互能力的协作者光标。
  const presence = atom<TLRecord | null>('drawless-coworker-presence', null);
  const presenceMode = atom<TLPresenceMode>('drawless-coworker-presence-mode', 'solo');

  installNodeRuntimeAdapters();

  const store = createTLStore({
    id: `drawless-coworker:${roomId}:${instanceId}`,
    collaboration: {
      // collaboration 状态只反映连接状态；当前不会授权 coworker 直接写画布。
      status: socketStatus,
      mode: collaborationMode,
    },
  });
  const socket = new NodeWebSocketSyncAdapter(() =>
    createSyncRoomUri({
      serverUrl: options.serverUrl,
      roomId,
      sessionId,
    })
  );
  const client = new TLSyncClient<TLRecord, TLStore>({
    store,
    socket,
    presence,
    presenceMode,
    onLoad: () => {
      const snapshot = createRoomSnapshot({ roomId, sessionId, store });
      options.onLoad?.(snapshot);
      load.resolve(snapshot);
    },
    onSyncError: (reason) => {
      options.onSyncError?.(reason);
      load.reject(new Error(reason));
    },
  });
  // TLSyncClient 会监听 socket 状态；这里额外同步到 TLStore collaboration props，
  // 方便后续如果要把 coworker 状态暴露给 Mastra 或 server 控制面。
  const unlistenStatus = socket.onStatusChange((event) => {
    socketStatus.set(event.status === 'online' ? 'online' : 'offline');
  });
  // 只监听 remote document 变化，避免把 coworker 自己的本地临时状态误当成用户画布操作。
  const unlistenStore = store.listen(
    ({ source }) => {
      if (source !== 'remote') {
        return;
      }
      options.onRemoteChange?.(createRoomSnapshot({ roomId, sessionId, store }));
    },
    { source: 'remote', scope: 'document' }
  );
  // 先让 TLSyncClient 注册监听器，再真正打开 WebSocket，避免错过首次 online 事件。
  socket.restart();

  return {
    identity,
    store,
    waitUntilLoaded: () => load.promise,
    getRecords: () => store.allRecords(),
    getSnapshot: () => createRoomSnapshot({ roomId, sessionId, store }),
    close: () => {
      unlistenStore();
      unlistenStatus();
      client.close();
      socket.close();
    },
  };
}

// sync-core 公开了 TLPersistentClientSocket 接口，但没有公开浏览器版 ClientWebSocketAdapter。
// coworker 运行在 Node 中，所以这里实现一个最小 adapter：只负责连接、JSON 收发、重连和状态通知。
class NodeWebSocketSyncAdapter implements TLPersistentClientSocket<object, object> {
  connectionStatus: 'error' | 'offline' | 'online' = 'offline';

  private socket: WebSocket | null = null;
  private readonly assembler = new JsonChunkAssembler();
  private readonly statusListeners = new Set<(event: TLSocketStatusChangeEvent) => void>();
  private readonly messageListeners = new Set<(message: object) => void>();

  constructor(private readonly getUri: () => string) {}

  sendMessage(message: object) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Coworker sync socket is not open.');
    }

    // TLSocketRoom 接受普通 JSON 消息；大消息分片不是这个 PoC 的写入方向。
    this.socket.send(JSON.stringify(message));
  }

  onReceiveMessage(callback: (message: object) => void) {
    this.messageListeners.add(callback);
    return () => {
      this.messageListeners.delete(callback);
    };
  }

  onStatusChange(callback: (event: TLSocketStatusChangeEvent) => void) {
    this.statusListeners.add(callback);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  restart() {
    this.socket?.close();
    this.setStatus({ status: 'offline' });

    // WebSocket URI 每次重连时重新计算，后续可以在这里加入一次性 token 或签名。
    const socket = new WebSocket(this.getUri());
    this.socket = socket;
    socket.on('open', () => {
      this.setStatus({ status: 'online' });
    });
    socket.on('message', (data) => {
      this.handleMessage(data);
    });
    socket.on('close', (code, reason) => {
      if (code === 4099) {
        this.setStatus({ status: 'error', reason: reason.toString() || 'UNKNOWN_ERROR' });
        return;
      }

      this.setStatus({ status: 'offline' });
    });
    socket.on('error', (error) => {
      this.setStatus({ status: 'error', reason: error.message });
    });
  }

  close() {
    this.socket?.close();
    this.socket = null;
    this.setStatus({ status: 'offline' });
    this.statusListeners.clear();
    this.messageListeners.clear();
  }

  private handleMessage(data: WebSocket.RawData) {
    const message = Array.isArray(data) ? Buffer.concat(data).toString('utf8') : data.toString();
    // server 可能发送 chunked JSON；JsonChunkAssembler 会等所有分片到齐后再返回完整消息。
    const result = this.assembler.handleMessage(message);
    if (!result) {
      return;
    }
    if ('error' in result) {
      this.setStatus({ status: 'error', reason: result.error.message });
      return;
    }

    for (const listener of this.messageListeners) {
      listener(result.data);
    }
  }

  private setStatus(event: TLSocketStatusChangeEvent) {
    if (this.connectionStatus === event.status) {
      return;
    }

    this.connectionStatus = event.status;
    for (const listener of this.statusListeners) {
      listener(event);
    }
  }
}

export function createSyncRoomUri(input: {
  /** drawless server 的 HTTP 或 WebSocket 基础地址。 */
  serverUrl: string;
  /** 要连接的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 当前客户端使用的 session ID。 */
  sessionId: DrawlessSessionId;
}) {
  const url = new URL(input.serverUrl);
  // serverUrl 允许传 http(s) 或 ws(s)，这里统一转换成 WebSocket 协议。
  url.protocol = url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:';
  url.pathname = joinUrlPath(url.pathname, 'sync', encodeURIComponent(input.roomId));
  url.searchParams.set('sessionId', input.sessionId);

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

  return { promise, resolve, reject };
}
