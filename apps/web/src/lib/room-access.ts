/** 分享凭据保留在 URL fragment，避免随网页请求或 Referer 泄露。 */
export function getRoomAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.hash.slice(1)).get('access');
}

export function roomAccessHeaders(): Record<string, string> {
  const token = getRoomAccessToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}
