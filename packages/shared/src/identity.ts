import { z } from "zod";

export const ROOM_ID_MAX_LENGTH = 80;
export const SESSION_ID_MAX_LENGTH = 128;
export const roomIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
export const sessionIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;

/**
 * 可协作画布的房间 ID。它会出现在 URL、WebSocket 路径和后端房间注册表中。
 */
export type DrawlessRoomId = string;

/**
 * 单个浏览器标签页连接 tldraw 协同房间时使用的会话 ID。
 */
export type DrawlessSessionId = string;

export const roomIdSchema = z
  .string()
  .trim()
  .min(1, "Room id cannot be empty.")
  .max(ROOM_ID_MAX_LENGTH, `Room id cannot exceed ${ROOM_ID_MAX_LENGTH} characters.`)
  .regex(
    roomIdPattern,
    "Room id may only contain letters, numbers, dots, underscores, and hyphens."
  );

export const sessionIdSchema = z
  .string()
  .trim()
  .min(1, "Session id cannot be empty.")
  .max(
    SESSION_ID_MAX_LENGTH,
    `Session id cannot exceed ${SESSION_ID_MAX_LENGTH} characters.`
  )
  .regex(
    sessionIdPattern,
    "Session id may only contain letters, numbers, dots, underscores, hyphens, and colons."
  );

export function parseDrawlessRoomId(
  input: unknown
): { ok: true; value: DrawlessRoomId } | { ok: false; reason: string } {
  const result = roomIdSchema.safeParse(input);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, reason: result.error.issues[0]?.message ?? "Invalid room id." };
}

export function parseDrawlessSessionId(
  input: unknown
): { ok: true; value: DrawlessSessionId } | { ok: false; reason: string } {
  const result = sessionIdSchema.safeParse(input);
  return result.success
    ? { ok: true, value: result.data }
    : {
        ok: false,
        reason: result.error.issues[0]?.message ?? "Invalid session id."
      };
}
