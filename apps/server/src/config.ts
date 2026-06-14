import {
  DRAWLESS_SYNC_ROUTE,
  type DrawlessServerConfig
} from "@drawless/shared";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 3001;
export const DEFAULT_COWORKER_BASE_URL = "http://127.0.0.1:4111";
export const DEFAULT_COWORKER_REQUEST_TIMEOUT_MS = 10_000;
export const DEFAULT_ALLOWED_ORIGINS = [
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3100",
  "http://localhost:3000",
  "http://localhost:3100"
];

export type ServerEnv = Partial<
  Record<
    | "HOST"
    | "PORT"
    | "SYNC_ROUTE"
    | "ALLOWED_ORIGINS"
    | "COWORKER_ENABLED"
    | "COWORKER_BASE_URL"
    | "COWORKER_REQUEST_TIMEOUT_MS"
    | "SERVER_PUBLIC_URL",
    string
  >
>;

export function loadServerConfig(
  env: ServerEnv = process.env
): DrawlessServerConfig {
  const host = parseHost(env.HOST);
  const port = parsePort(env.PORT);
  const coworkerEnabled = parseBoolean(env.COWORKER_ENABLED, false);

  return {
    host,
    port,
    syncRoute: parseSyncRoute(env.SYNC_ROUTE),
    allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS),
    coworker: {
      enabled: coworkerEnabled,
      baseUrl:
        parseOptionalServiceUrl(env.COWORKER_BASE_URL) ??
        (coworkerEnabled ? DEFAULT_COWORKER_BASE_URL : null),
      serverUrl:
        parseOptionalServiceUrl(env.SERVER_PUBLIC_URL) ??
        createDefaultServerUrl(host, port),
      requestTimeoutMs: parsePositiveInteger(
        env.COWORKER_REQUEST_TIMEOUT_MS,
        DEFAULT_COWORKER_REQUEST_TIMEOUT_MS,
        "COWORKER_REQUEST_TIMEOUT_MS"
      )
    }
  };
}

export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: readonly string[]
): boolean {
  if (!origin) {
    return true;
  }

  return allowedOrigins.includes(origin);
}

function parseHost(value: string | undefined): string {
  return value?.trim() || DEFAULT_HOST;
}

function parsePort(value: string | undefined): number {
  if (!value?.trim()) {
    return DEFAULT_PORT;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return port;
}

function parseSyncRoute(value: string | undefined): string {
  const route = value?.trim() || DRAWLESS_SYNC_ROUTE;
  const normalized = route.startsWith("/") ? route : `/${route}`;
  const withoutTrailingSlash =
    normalized.length > 1 ? normalized.replace(/\/+$/u, "") : normalized;

  if (!/^\/[A-Za-z0-9/_-]+$/u.test(withoutTrailingSlash)) {
    throw new Error(
      "SYNC_ROUTE must be an absolute route containing letters, numbers, underscores, and hyphens."
    );
  }

  return withoutTrailingSlash;
}

function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [...DEFAULT_ALLOWED_ORIGINS];
  }

  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0 || origins.includes("*")) {
    throw new Error("ALLOWED_ORIGINS must list explicit origins, not '*'.");
  }

  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("unsupported protocol");
      }
      if (parsed.origin !== origin) {
        throw new Error("origin must not include paths or query strings");
      }
    } catch {
      throw new Error(`ALLOWED_ORIGINS contains an invalid origin: ${origin}`);
    }
  }

  return origins;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value?.trim()) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error("COWORKER_ENABLED must be true or false.");
}

function parseOptionalServiceUrl(value: string | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  const url = value.trim();
  try {
    const parsed = new URL(url);
    if (!["http:", "https:", "ws:", "wss:"].includes(parsed.protocol)) {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new Error(`Service url is invalid: ${url}`);
  }

  return url.replace(/\/+$/u, "");
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string
): number {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 500 || parsed > 60_000) {
    throw new Error(`${name} must be an integer between 500 and 60000.`);
  }

  return parsed;
}

function createDefaultServerUrl(host: string, port: number) {
  // 0.0.0.0 适合监听，但 coworker 作为客户端连接时需要可拨号地址。
  const reachableHost = host === "0.0.0.0" ? DEFAULT_HOST : host;
  return `http://${reachableHost}:${port}`;
}
