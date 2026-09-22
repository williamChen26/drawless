import { describe, expect, it } from 'vitest';
import { createRoomAccessToken, verifyRoomAccessToken, ROOM_ACCESS_TTL_SECONDS } from '../room-access.js';

const secret = 'test-only-room-secret-'.repeat(3);
describe('房间分享签名', () => {
  it('绑定房间，拒绝篡改、过期和错误密钥', async () => {
    const now = Date.now();
    const token = await createRoomAccessToken('alpha', secret, now);
    expect(await verifyRoomAccessToken('alpha', token, secret, now)).toBe(true);
    expect(await verifyRoomAccessToken('beta', token, secret, now)).toBe(false);
    expect(await verifyRoomAccessToken('alpha', token, secret + 'other', now)).toBe(false);
    expect(await verifyRoomAccessToken('alpha', token.slice(0, -2) + 'AA', secret, now)).toBe(false);
    expect(await verifyRoomAccessToken('alpha', token, secret, now + ROOM_ACCESS_TTL_SECONDS * 1000)).toBe(false);
    expect(await verifyRoomAccessToken('alpha', undefined, secret)).toBe(false);
  });
  it('拒绝短密钥', async () => { await expect(createRoomAccessToken('alpha', 'short')).rejects.toThrow(); });
});
