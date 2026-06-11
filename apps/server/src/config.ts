import {
  DRAWLESS_SYNC_ROUTE,
  type DrawlessServerConfig
} from "@drawless/shared";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 3001;
export const DEFAULT_ALLOWED_ORIGINS = [
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3100",
  "http://localhost:3000",
  "http://localhost:3100"
];

export type ServerEnv = Partial<
  Record<"HOST" | "PORT" | "SYNC_ROUTE" | "ALLOWED_ORIGINS", string>
>;

export function loadServerConfig(
  env: ServerEnv = process.env
): DrawlessServerConfig {
  return {
    host: parseHost(env.HOST),
    port: parsePort(env.PORT),
    syncRoute: parseSyncRoute(env.SYNC_ROUTE),
    allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS)
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
