import { afterEach, describe, expect, it } from 'vitest';
import { createRoomAccessToken } from '@drawless/shared';
import { loadServerConfig } from '../../config.js';
import { createServerApp } from '../app.js';

const secret = 'test-only-room-secret-'.repeat(3);
const apps: Awaited<ReturnType<typeof createServerApp>>['app'][] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

describe('房间 HTTP 与 WebSocket 权限边界', () => {
  it('公开部署不能省略凭据', () => {
    expect(() => loadServerConfig({ HOST: '0.0.0.0' })).toThrow('DRAWLESS_ROOM_ACCESS_SECRET');
    expect(() => loadServerConfig({ NODE_ENV: 'production' })).toThrow('DRAWLESS_ROOM_ACCESS_SECRET');
    expect(() => loadServerConfig({ HOST: '0.0.0.0', DRAWLESS_ROOM_ACCESS_SECRET: secret, COWORKER_ENABLED: 'true' })).toThrow('COWORKER_CONTROL_TOKEN');
  });
  it('允许有效同房凭据，拒绝匿名、跨房间和不受信 Origin', async () => {
    const { app } = await createServerApp({ config: loadServerConfig({ DRAWLESS_ROOM_ACCESS_SECRET: secret }) });
    apps.push(app);
    const token = await createRoomAccessToken('alpha', secret);
    const url = '/rooms/alpha/coworker/approvals';
    expect((await app.inject({ url })).statusCode).toBe(401);
    expect((await app.inject({ url, headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(200);
    expect((await app.inject({ url: '/rooms/beta/coworker/approvals', headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(401);
    expect((await app.inject({ url, headers: { authorization: `Bearer ${token}`, origin: 'https://evil.example' } })).statusCode).toBe(403);
    expect((await app.inject({ url: '/sync/alpha?sessionId=guest:tab' })).statusCode).toBe(401);
    const ready = await app.inject({ url: '/ready' });
    expect(ready.json().rooms).toEqual({ roomCount: 0 });
  });
});
