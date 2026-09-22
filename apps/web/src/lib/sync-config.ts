import { getRoomAccessToken } from "./room-access";
import {
  DRAWLESS_SYNC_ROUTE,
  parseDrawlessRoomId,
  parseDrawlessSessionId,
  type DrawlessSyncConfig
} from "@drawless/shared";

const DEFAULT_SYNC_SERVER_URL = "ws://127.0.0.1:3001";
const SYNC_ROUTE_PATH = process.env.NEXT_PUBLIC_DRAWLESS_SYNC_ROUTE || DRAWLESS_SYNC_ROUTE;

export type SyncConfigErrorCode =
  | "INVALID_SERVER_URL"
  | "HOSTED_DEMO_SYNC_URL"
  | "INVALID_ROOM_ID"
  | "INVALID_SESSION_ID";

export type SyncConfigError = {
  code: SyncConfigErrorCode;
  message: string;
};

export type SyncConfigResult =
  | {
      ok: true;
      value: DrawlessSyncConfig;
    }
  | {
      ok: false;
      error: SyncConfigError;
    };

export type SyncConfigInput = {
  serverUrl?: string | null | undefined;
  roomId?: string | null | undefined;
  deviceId: string;
  tabId: string;
};

export function resolveSyncConfig(input: SyncConfigInput): SyncConfigResult {
  const serverUrl = input.serverUrl?.trim() || DEFAULT_SYNC_SERVER_URL;
  const roomValidation = parseDrawlessRoomId(input.roomId);
  if (!roomValidation.ok) {
    return {
      ok: false,
      error: { code: "INVALID_ROOM_ID", message: roomValidation.reason }
    };
  }

  const sessionId = buildSyncSessionId(input.deviceId, input.tabId);
  const sessionValidation = parseDrawlessSessionId(sessionId);
  if (!sessionValidation.ok) {
    return {
      ok: false,
      error: { code: "INVALID_SESSION_ID", message: sessionValidation.reason }
    };
  }

  const roomUri = buildSyncRoomUri({
    serverUrl,
    roomId: roomValidation.value
  });
  if (!roomUri.ok) {
    return roomUri;
  }

  return {
    ok: true,
    value: {
      roomId: roomValidation.value,
      roomUri: roomUri.value,
      sessionId
    }
  };
}

function buildSyncSessionId(deviceId: string, tabId: string) {
  return `${deviceId}:${tabId}`;
}

function buildSyncRoomUri(input: {
  serverUrl: string;
  roomId: string;
}): { ok: true; value: string } | { ok: false; error: SyncConfigError } {
  const roomValidation = parseDrawlessRoomId(input.roomId);
  if (!roomValidation.ok) {
    return {
      ok: false,
      error: { code: "INVALID_ROOM_ID", message: roomValidation.reason }
    };
  }

  let url: URL;
  try {
    url = new URL(input.serverUrl);
  } catch {
    return {
      ok: false,
      error: {
        code: "INVALID_SERVER_URL",
        message: "Sync server URL must be an absolute HTTP(S) or WS(S) URL."
      }
    };
  }

  if (url.protocol === "http:") {
    url.protocol = "ws:";
  } else if (url.protocol === "https:") {
    url.protocol = "wss:";
  } else if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    return {
      ok: false,
      error: {
        code: "INVALID_SERVER_URL",
        message: "Sync server URL must use http, https, ws, or wss."
      }
    };
  }

  if (isHostedDemoSyncHost(url.hostname)) {
    return {
      ok: false,
      error: {
        code: "HOSTED_DEMO_SYNC_URL",
        message: "Drawless must use its own sync backend, not the hosted tldraw demo."
      }
    };
  }

  url.pathname = joinUrlPath(url.pathname, SYNC_ROUTE_PATH, roomValidation.value);
  url.search = "";
  url.hash = "";
  const accessToken = getRoomAccessToken();
  if (accessToken) url.searchParams.set("accessToken", accessToken);

  return { ok: true, value: url.toString() };
}

function joinUrlPath(...parts: string[]) {
  return parts
    .flatMap((part) => part.split("/"))
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/")
    .replace(/^/u, "/");
}

function isHostedDemoSyncHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "demo.tldraw.xyz" || normalized.endsWith(".demo.tldraw.xyz");
}
