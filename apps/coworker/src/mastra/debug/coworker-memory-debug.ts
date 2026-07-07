import { readFileSync } from 'node:fs';
import v8 from 'node:v8';

import type { DrawlessCoworkerRoomRegistry } from '../collaboration/coworker-room-registry';

type ActiveHandleInspector = {
  _getActiveHandles?: () => unknown[];
};

const PROC_STATUS_KEYS = new Set([
  'VmPeak',
  'VmSize',
  'VmLck',
  'VmPin',
  'VmHWM',
  'VmRSS',
  'RssAnon',
  'RssFile',
  'RssShmem',
  'VmData',
  'VmStk',
  'VmExe',
  'VmLib',
  'VmPTE',
  'VmSwap',
  'HugetlbPages',
  'Threads',
]);

const PROC_SMAPS_ROLLUP_KEYS = new Set([
  'Rss',
  'Pss',
  'Pss_Dirty',
  'Shared_Clean',
  'Shared_Dirty',
  'Private_Clean',
  'Private_Dirty',
  'Referenced',
  'Anonymous',
  'KSM',
  'LazyFree',
  'AnonHugePages',
  'ShmemPmdMapped',
  'FilePmdMapped',
  'Shared_Hugetlb',
  'Private_Hugetlb',
  'Swap',
  'SwapPss',
  'Locked',
]);

export function createCoworkerMemoryDebugSnapshot(registry: DrawlessCoworkerRoomRegistry) {
  const memory = process.memoryUsage();
  const rooms = registry.getDebugSnapshot();
  const resourceUsage = process.resourceUsage();

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
      coworkerAgentMemoryEnabled: parseBooleanEnv(
        process.env.COWORKER_AGENT_MEMORY_ENABLED,
        true
      ),
      coworkerStorageMode: parseCoworkerStorageMode(process.env.COWORKER_STORAGE_MODE),
      coworkerObservabilityEnabled: parseBooleanEnv(
        process.env.COWORKER_OBSERVABILITY_ENABLED,
        false
      ),
      hasMastraPlatformAccessToken: Boolean(process.env.MASTRA_PLATFORM_ACCESS_TOKEN?.trim()),
      coworkerMemoryLogIntervalMs: process.env.COWORKER_MEMORY_LOG_INTERVAL_MS?.trim() || null,
    },
    v8: {
      heapStatistics: v8.getHeapStatistics(),
      heapStatisticsMb: bytesRecordToMb(v8.getHeapStatistics()),
      heapSpaces: v8.getHeapSpaceStatistics().map((space) => ({
        ...space,
        spaceSizeMb: bytesToMb(space.space_size),
        spaceUsedSizeMb: bytesToMb(space.space_used_size),
        spaceAvailableSizeMb: bytesToMb(space.space_available_size),
        physicalSpaceSizeMb: bytesToMb(space.physical_space_size),
      })),
    },
    resourceUsage: {
      ...resourceUsage,
      maxRSSMb: kbToMb(resourceUsage.maxRSS),
    },
    proc: {
      status: readProcNumericFile('/proc/self/status', PROC_STATUS_KEYS),
      smapsRollup: readProcNumericFile('/proc/self/smaps_rollup', PROC_SMAPS_ROLLUP_KEYS),
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
      procStatusMb: snapshot.proc.status.valuesMb,
      procSmapsRollupMb: snapshot.proc.smapsRollup.valuesMb,
      resourceMaxRSSMb: snapshot.resourceUsage.maxRSSMb,
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

function kbToMb(value: number) {
  return Math.round((value / 1024) * 10) / 10;
}

function bytesRecordToMb(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => typeof value === 'number')
      .map(([key, value]) => [key, bytesToMb(value as number)])
  );
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

function parseCoworkerStorageMode(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'memory' || normalized === 'disabled') {
    return normalized;
  }

  return 'file';
}

function readProcNumericFile(path: string, allowedKeys: Set<string>) {
  try {
    const content = readFileSync(path, 'utf8');
    return parseProcNumericFile(content, allowedKeys);
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : String(error),
      values: {},
      valuesMb: {},
      units: {},
    };
  }
}

function parseProcNumericFile(content: string, allowedKeys: Set<string>) {
  const values: Record<string, number> = {};
  const valuesMb: Record<string, number> = {};
  const units: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const parsed = parseProcNumericLine(line);
    if (!parsed || !allowedKeys.has(parsed.key)) {
      continue;
    }

    values[parsed.key] = parsed.value;
    units[parsed.key] = parsed.unit;
    if (parsed.unit === 'kB') {
      valuesMb[parsed.key] = kbToMb(parsed.value);
    }
  }

  return {
    available: true,
    values,
    valuesMb,
    units,
  };
}

function parseProcNumericLine(line: string) {
  const match = /^([^:]+):\s+(\d+)(?:\s+(kB))?\s*$/i.exec(line);
  if (!match) {
    return null;
  }

  return {
    key: match[1],
    value: Number(match[2]),
    unit: match[3] ?? 'count',
  };
}
