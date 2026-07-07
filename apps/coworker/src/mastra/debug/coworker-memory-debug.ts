import type { DrawlessCoworkerRoomRegistry } from '../collaboration/coworker-room-registry';

type ActiveHandleInspector = {
  _getActiveHandles?: () => unknown[];
};

export function createCoworkerMemoryDebugSnapshot(registry: DrawlessCoworkerRoomRegistry) {
  const memory = process.memoryUsage();
  const rooms = registry.getDebugSnapshot();

  return {
    capturedAt: new Date().toISOString(),
    memory,
    memoryMb: {
      rss: bytesToMb(memory.rss),
      heapTotal: bytesToMb(memory.heapTotal),
      heapUsed: bytesToMb(memory.heapUsed),
      external: bytesToMb(memory.external),
      arrayBuffers: bytesToMb(memory.arrayBuffers),
    },
    rooms,
    env: {
      nodeEnv: process.env.NODE_ENV ?? null,
      coworkerMemoryDebugEnabled: isCoworkerMemoryDebugEnabled(),
      hasCoworkerMemoryDebugToken: Boolean(process.env.COWORKER_MEMORY_DEBUG_TOKEN?.trim()),
      coworkerObservabilityEnabled: parseBooleanEnv(
        process.env.COWORKER_OBSERVABILITY_ENABLED,
        false
      ),
      hasMastraPlatformAccessToken: Boolean(process.env.MASTRA_PLATFORM_ACCESS_TOKEN?.trim()),
      coworkerMemoryLogIntervalMs: process.env.COWORKER_MEMORY_LOG_INTERVAL_MS?.trim() || null,
    },
    activeHandles: {
      count: getActiveHandleCount(),
    },
  };
}

export function startCoworkerMemoryDebugLogger(registry: DrawlessCoworkerRoomRegistry) {
  const intervalMs = parsePositiveIntegerEnv(process.env.COWORKER_MEMORY_LOG_INTERVAL_MS, 0);
  if (intervalMs <= 0) {
    return;
  }

  const timer = setInterval(() => {
    const snapshot = createCoworkerMemoryDebugSnapshot(registry);
    console.info('[drawless coworker] memory debug', {
      capturedAt: snapshot.capturedAt,
      memoryMb: snapshot.memoryMb,
      roomCount: snapshot.rooms.count,
      rooms: snapshot.rooms.items.map((room) => ({
        roomId: room.roomId,
        status: room.status,
        recordCount: room.recordCount,
        presenceCount: room.presenceCount,
        updatedAt: room.updatedAt,
      })),
      activeHandles: snapshot.activeHandles.count,
    });
  }, intervalMs);

  timer.unref?.();
}

function bytesToMb(value: number) {
  return Math.round((value / 1024 / 1024) * 10) / 10;
}

function getActiveHandleCount() {
  const inspector = process as typeof process & ActiveHandleInspector;
  return inspector._getActiveHandles?.().length ?? null;
}

export function isCoworkerMemoryDebugEnabled() {
  return parseBooleanEnv(process.env.COWORKER_MEMORY_DEBUG_ENABLED, false);
}

export function isCoworkerMemoryDebugAuthorized(authorization: string | undefined) {
  const token = process.env.COWORKER_MEMORY_DEBUG_TOKEN?.trim();
  if (!token) {
    return true;
  }

  return authorization === `Bearer ${token}`;
}

function parsePositiveIntegerEnv(value: string | undefined, fallback: number) {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBooleanEnv(value: string | undefined, fallback: boolean) {
  if (!value?.trim()) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}
