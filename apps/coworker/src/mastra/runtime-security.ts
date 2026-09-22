import { timingSafeEqual } from 'node:crypto';

export function loadRuntimeSecurity(env: NodeJS.ProcessEnv = process.env) {
  const host = env.HOST?.trim() || '127.0.0.1';
  const token = env.COWORKER_CONTROL_TOKEN?.trim();
  if ((env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '::1'].includes(host)) && (!token || token.length < 32)) {
    throw new Error('公开部署 runtime 必须配置至少 32 字符的 COWORKER_CONTROL_TOKEN。');
  }
  return { host, token };
}

export function isControlRequestAllowed(authorization: string | undefined, token: string | undefined, origin?: string) {
  // runtime 仅面向 server，不提供浏览器跨域访问能力。
  if (origin) return false;
  if (!token) return true;
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(authorization ?? '');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function validateSyncTarget(serverUrl: string, expected = process.env.DRAWLESS_SYNC_SERVER_URL || 'http://127.0.0.1:3001') {
  const normalize = (value: string) => {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) throw new Error('协同地址不能包含凭据或查询参数。');
    if (url.protocol === 'ws:') url.protocol = 'http:';
    if (url.protocol === 'wss:') url.protocol = 'https:';
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('协同地址协议无效。');
    return url.toString().replace(/\/+$/, '');
  };
  if (normalize(serverUrl) !== normalize(expected)) throw new Error('协同地址不在 runtime 的允许列表内。');
}
