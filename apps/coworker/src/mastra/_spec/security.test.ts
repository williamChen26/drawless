import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it } from 'vitest';
import { createRoomRequestContext, assertRoomAuthority } from '../collaboration/room-authority';
import { isControlRequestAllowed, loadRuntimeSecurity, validateSyncTarget } from '../runtime-security';

describe('runtime 权限', () => {
  it('工具只能访问受信上下文中的房间，写入需要审批', () => {
    const abort = new AbortController();
    const context = createRoomRequestContext('alpha', abort.signal);
    expect(() => assertRoomAuthority(context, 'alpha')).not.toThrow();
    expect(() => assertRoomAuthority(context, 'beta')).toThrow();
    expect(() => assertRoomAuthority(context, 'alpha', true)).toThrow();
    const fake = new RequestContext();
    fake.set('drawlessAuthority', { roomId: 'alpha', signal: abort.signal, canWrite: true });
    expect(() => assertRoomAuthority(fake, 'alpha', true)).toThrow();
    const approved = createRoomRequestContext('alpha', abort.signal, true);
    expect(() => assertRoomAuthority(approved, 'alpha', true)).not.toThrow();
    abort.abort();
    expect(() => assertRoomAuthority(approved, 'alpha', true)).toThrow();
  });
  it('runtime 拒绝错误凭据和浏览器 Origin，公开监听必须有密钥', () => {
    expect(() => loadRuntimeSecurity({ HOST: '0.0.0.0' })).toThrow();
    expect(isControlRequestAllowed('Bearer token', 'token')).toBe(true);
    expect(isControlRequestAllowed('Bearer wrong', 'token')).toBe(false);
    expect(isControlRequestAllowed(undefined, undefined, 'https://evil.example')).toBe(false);
  });
  it('拒绝任意外连地址、凭据和协议', () => {
    expect(() => validateSyncTarget('ws://127.0.0.1:3001', 'http://127.0.0.1:3001')).not.toThrow();
    for (const url of ['http://169.254.169.254', 'http://127.0.0.1:9999', 'http://user:pass@127.0.0.1:3001', 'file:///etc/passwd']) {
      expect(() => validateSyncTarget(url, 'http://127.0.0.1:3001')).toThrow();
    }
  });
});
