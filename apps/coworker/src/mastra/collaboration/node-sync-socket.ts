import { JsonChunkAssembler, type TLPersistentClientSocket, type TLSocketStatusChangeEvent } from '@tldraw/sync-core';
import WebSocket from 'ws';

/** Node 传输适配器；重连、过期连接隔离与服务端写入确认都只属于这一层。 */
export class NodeWebSocketSyncAdapter implements TLPersistentClientSocket<object, object> {
  connectionStatus: 'error' | 'offline' | 'online' = 'offline';
  private socket: WebSocket | null = null;
  private assembler = new JsonChunkAssembler();
  private retry: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private closed = false;
  private revision = 0;
  private readonly statusListeners = new Set<(event: TLSocketStatusChangeEvent) => void>();
  private readonly messageListeners = new Set<(message: object) => void>();
  private readonly writeListeners = new Set<() => void>();
  private readonly pending = new Map<number, { revision: number; ids: string[] }>();
  private readonly acknowledged = new Map<string, { revision: number; committed: boolean }>();

  constructor(private readonly getUri: () => string) {}

  getDocumentRevision() { return this.revision; }

  sendMessage(message: object) {
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error('协同连接未就绪。');
    const event = message as Record<string, unknown>;
    if (event.type === 'push' && event.diff && typeof event.diff === 'object' && typeof event.clientClock === 'number') {
      this.pending.set(event.clientClock, { revision: ++this.revision, ids: Object.keys(event.diff) });
    }
    this.socket.send(JSON.stringify(message));
  }

  onReceiveMessage(callback: (message: object) => void) {
    this.messageListeners.add(callback);
    return () => { this.messageListeners.delete(callback); };
  }

  onStatusChange(callback: (event: TLSocketStatusChangeEvent) => void) {
    this.statusListeners.add(callback);
    return () => { this.statusListeners.delete(callback); };
  }

  /** 等待本次实际变更对应的 push_result，不能把本地 store.put 当成成功交付。 */
  waitForRecords(ids: string[], afterRevision: number, signal: AbortSignal, timeoutMs = 8_000) {
    if (ids.length === 0) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      let finished = false;
      const finish = (error?: Error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        this.writeListeners.delete(check);
        signal.removeEventListener('abort', check);
        if (error) reject(error); else resolve();
      };
      const check = () => {
        if (signal.aborted || this.closed || this.connectionStatus !== 'online') {
          finish(new Error('连接中断或操作已停止，无法确认画布写入。'));
          return;
        }
        const results = ids.map(id => this.acknowledged.get(id));
        if (results.some(result => result && result.revision > afterRevision && !result.committed)) {
          finish(new Error('服务器没有完整接受画布修改，请根据最新画布重新生成计划。'));
        } else if (results.every(result => result && result.revision > afterRevision && result.committed)) {
          finish();
        }
      };
      const timer = setTimeout(() => finish(new Error('等待服务器确认画布写入超时，结果尚未确认。')), timeoutMs);
      this.writeListeners.add(check);
      signal.addEventListener('abort', check, { once: true });
      check();
    });
  }

  restart() {
    if (this.closed) return;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    const previous = this.socket;
    this.socket = null;
    previous?.terminate();
    this.pending.clear();
    this.acknowledged.clear();
    this.assembler = new JsonChunkAssembler();
    this.setStatus({ status: 'offline' });
    const socket = new WebSocket(this.getUri(), { handshakeTimeout: 8_000, maxPayload: 8 * 1024 * 1024 });
    this.socket = socket;
    socket.on('open', () => {
      if (this.socket !== socket || this.closed) return;
      this.attempts = 0;
      this.setStatus({ status: 'online' });
    });
    socket.on('message', data => {
      if (this.socket !== socket || this.closed) return;
      try {
        const text = Array.isArray(data) ? Buffer.concat(data).toString('utf8') : data.toString();
        const result = this.assembler.handleMessage(text);
        if (!result) return;
        if ('error' in result) throw result.error;
        for (const listener of this.messageListeners) listener(result.data);
        this.recordAcknowledgements(result.data);
      } catch {
        this.closeWithError('收到无效的协同消息。');
      }
    });
    socket.on('close', (code, reason) => {
      if (this.socket !== socket || this.closed) return;
      if (code === 4099) {
        this.closeWithError(reason.toString() || '协同连接被拒绝。');
        return;
      }
      this.scheduleReconnect();
    });
    socket.on('unexpected-response', (_request, response) => {
      response.resume();
      if (this.socket !== socket || this.closed) return;
      if (response.statusCode === 401 || response.statusCode === 403) this.closeWithError('协同连接凭据无效或已过期。');
      else { socket.terminate(); this.scheduleReconnect(); }
    });
    socket.on('error', () => {
      if (this.socket !== socket || this.closed) return;
      // 普通网络错误可恢复，不能交给 TLSyncClient 的永久 error 分支。
      this.setStatus({ status: 'offline' });
    });
  }

  close() {
    this.closed = true;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    const socket = this.socket;
    this.socket = null;
    socket?.terminate();
    if (this.connectionStatus !== 'error') this.setStatus({ status: 'offline' });
    this.notifyWrites();
    this.pending.clear();
    this.acknowledged.clear();
    this.statusListeners.clear();
    this.messageListeners.clear();
  }

  private closeWithError(reason: string) {
    this.setStatus({ status: 'error', reason });
    this.close();
  }

  private scheduleReconnect() {
    this.setStatus({ status: 'offline' });
    if (this.closed || this.retry) return;
    const delay = Math.min(10_000, 250 * 2 ** Math.min(this.attempts++, 6));
    this.retry = setTimeout(() => this.restart(), delay);
    this.retry.unref?.();
  }

  private recordAcknowledgements(message: object) {
    const event = message as Record<string, unknown>;
    if (event.type === 'data' && Array.isArray(event.data)) {
      for (const item of event.data) if (item && typeof item === 'object') this.recordAcknowledgements(item);
    }
    if (event.type !== 'push_result' || typeof event.clientClock !== 'number') return;
    const pending = this.pending.get(event.clientClock);
    if (!pending) return;
    this.pending.delete(event.clientClock);
    for (const id of pending.ids) {
      this.acknowledged.delete(id);
      this.acknowledged.set(id, { revision: pending.revision, committed: event.action === 'commit' });
    }
    // 只保留近期确认，避免长期房间按历史 record ID 无限增长。
    while (this.acknowledged.size > 2_000) this.acknowledged.delete(this.acknowledged.keys().next().value!);
    this.notifyWrites();
  }

  private notifyWrites() { for (const callback of this.writeListeners) callback(); }

  private setStatus(event: TLSocketStatusChangeEvent) {
    if (this.connectionStatus === event.status) return;
    this.connectionStatus = event.status;
    for (const listener of this.statusListeners) listener(event);
    this.notifyWrites();
  }
}
