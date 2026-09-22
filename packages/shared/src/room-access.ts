/** 房间分享凭据有效期；持有链接的人拥有该房间编辑权限。 */
export const ROOM_ACCESS_TTL_SECONDS = 7 * 24 * 60 * 60;

const encoder = new TextEncoder();

/** 只在受信服务端调用；签名密钥不能进入 NEXT_PUBLIC 环境变量。 */
export async function createRoomAccessToken(roomId: string, secret: string, now = Date.now()) {
  assertRoomAccessSecret(secret);
  const expires = Math.floor(now / 1000) + ROOM_ACCESS_TTL_SECONDS;
  const payload = `v1.${expires}`;
  const signature = await crypto.subtle.sign('HMAC', await importKey(secret), encoder.encode(`${roomId}.${payload}`));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

/** 同时验证房间绑定、签名和有效期，不依赖浏览器 Origin 作为身份认证。 */
export async function verifyRoomAccessToken(roomId: string, token: string | undefined, secret: string, now = Date.now()) {
  if (!token || token.length > 256) return false;
  const match = /^v1\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const expires = Number(match[1]);
  const seconds = Math.floor(now / 1000);
  if (expires <= seconds || expires > seconds + ROOM_ACCESS_TTL_SECONDS) return false;
  try {
    const signature = Uint8Array.from(atob(match[2]!.replace(/-/g, '+').replace(/_/g, '/') + '='), (char) => char.charCodeAt(0));
    return await crypto.subtle.verify('HMAC', await importKey(secret), signature, encoder.encode(`${roomId}.v1.${expires}`));
  } catch {
    return false;
  }
}

export function assertRoomAccessSecret(secret: string) {
  if (secret.length < 32) throw new Error('DRAWLESS_ROOM_ACCESS_SECRET 至少需要 32 个字符。');
}

function importKey(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function toBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
