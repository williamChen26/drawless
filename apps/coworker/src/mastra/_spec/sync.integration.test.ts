import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { TLSocketRoom } from '@tldraw/sync-core';
import { WebSocketServer } from 'ws';
import { createDrawlessCoworkerRoomClient, type DrawlessCoworkerRoomClient } from '../collaboration/coworker-room-client';
import type { DrawlessCanvasEditRequest } from '@drawless/shared';

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const request: DrawlessCanvasEditRequest = { roomId: 'alpha', intent: 'test', operations: [{ operationId: 'create', kind: 'create_shape', shapeKind: 'rectangle', bounds: { x: 10, y: 20, w: 100, h: 60 } }] };

async function setup() {
  const room = new TLSocketRoom({});
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(wss, 'listening');
  const address = wss.address();
  if (!address || typeof address === 'string') throw new Error('缺少测试地址');
  wss.on('connection', (socket, incoming) => {
    const url = new URL(incoming.url!, 'http://localhost');
    room.handleSocketConnect({ sessionId: url.searchParams.get('sessionId')!, socket });
  });
  cleanups.push(async () => { room.close(); for (const socket of wss.clients) socket.terminate(); await new Promise<void>((resolve) => wss.close(() => resolve())); });
  const clients: DrawlessCoworkerRoomClient[] = [];
  const connect = (instanceId: string, onConnectionChange?: (status: string) => void) => {
    const client = createDrawlessCoworkerRoomClient({ roomId: 'alpha', serverUrl: `http://127.0.0.1:${address.port}`, instanceId, onConnectionChange });
    clients.push(client); cleanups.push(() => client.close()); return client;
  };
  return { connect, wss };
}

async function until(check: () => boolean, timeoutMs = 6000) {
  const until = Date.now() + timeoutMs;
  while (!check()) { if (Date.now() > until) throw new Error('等待协同状态超时'); await new Promise(resolve => setTimeout(resolve, 20)); }
}

describe('真实协同传输（不调用模型）', () => {
  it('服务端确认后报告成功，并在第二个客户端收到同一 shape', async () => {
    const { connect } = await setup();
    const writer = connect('writer'); const observer = connect('observer');
    await Promise.all([writer.waitUntilLoaded(), observer.waitUntilLoaded()]);
    const result = await writer.applyCanvasEdit(request);
    expect(result.applied, result.summary + result.warnings.join(',')).toBe(true);
    const id = result.createdRecordIds[0];
    await until(() => observer.getRecords().some(record => record.id === id));
    expect(observer.getRecords().find(record => record.id === id)).toMatchObject({ typeName: 'shape', x: 10, y: 20 });
  }, 12000);
  it('普通断线后自动 hydration；离线、关闭和取消时拒绝新写入', async () => {
    const { connect, wss } = await setup();
    const states: string[] = [];
    const client = connect('writer', state => states.push(state));
    await client.waitUntilLoaded();
    for (const socket of wss.clients) socket.terminate();
    await until(() => states.at(-1) === 'offline');
    expect((await client.applyCanvasEdit(request)).applied).toBe(false);
    await until(() => states.filter(state => state === 'online').length === 2);
    expect((await client.applyCanvasEdit(request)).applied).toBe(true);
    const abort = new AbortController(); abort.abort();
    const count = client.getSnapshot().shapeCount;
    expect((await client.applyCanvasEdit(request, abort.signal)).applied).toBe(false);
    expect(client.getSnapshot().shapeCount).toBe(count);
    client.close();
    expect((await client.applyCanvasEdit(request)).applied).toBe(false);
  }, 15000);
});
