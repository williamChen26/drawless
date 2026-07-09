
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { MastraCompositeStore } from '@mastra/core/storage';
import { drawlessCoworker } from './agents/drawless-coworker';
import { DrawlessCoworkerRoomRegistry } from './collaboration/coworker-room-registry';
import { createCoworkerRoomApiRoutes } from './routes/coworker-room-routes';
import { setCanvasContextCollector } from './tools/canvas-context-tool';
import { setCanvasEditExecutor } from './tools/canvas-edit-tool';

const coworkerObservabilityEnabled = parseBooleanEnv(
  process.env.COWORKER_OBSERVABILITY_ENABLED,
  false
);
const storage = await createCoworkerStorage(coworkerObservabilityEnabled);
const observability = coworkerObservabilityEnabled ? await createCoworkerObservability() : null;

export const mastra = new Mastra({
  agents: { drawlessCoworker },
  storage,
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  ...(observability ? { observability } : {}),
});

const registeredDrawlessCoworker = mastra.getAgentById('drawless-coworker');
const coworkerRoomRegistry = new DrawlessCoworkerRoomRegistry(registeredDrawlessCoworker);
setCanvasContextCollector((request) => coworkerRoomRegistry.collectCanvasContext(request));
setCanvasEditExecutor((request) => coworkerRoomRegistry.applyCanvasEdit(request));

mastra.setServer({
  apiRoutes: createCoworkerRoomApiRoutes(coworkerRoomRegistry),
});

function createDefaultStorage() {
  return new LibSQLStore({
    id: 'mastra-storage',
    url: 'file:./mastra.db',
  });
}

async function createCoworkerStorage(enableObservability: boolean) {
  if (!enableObservability) {
    return createDefaultStorage();
  }

  const { DuckDBStore } = await import('@mastra/duckdb');
  return new MastraCompositeStore({
    id: 'composite-storage',
    default: createDefaultStorage(),
    domains: {
      observability: await new DuckDBStore().getStore('observability'),
    },
  });
}

async function createCoworkerObservability() {
  const {
    Observability,
    MastraPlatformExporter,
    MastraStorageExporter,
    SensitiveDataFilter,
  } = await import('@mastra/observability');
  const exporters = [new MastraStorageExporter()];
  if (process.env.MASTRA_PLATFORM_ACCESS_TOKEN?.trim()) {
    // 只有明确配置 platform token 时才启用远端 exporter，避免本地或部署环境空转重试。
    exporters.push(new MastraPlatformExporter());
  }

  return new Observability({
    configs: {
      default: {
        serviceName: 'drawless-coworker',
        exporters,
        spanOutputProcessors: [
          new SensitiveDataFilter(), // 脱敏密码、token、key 等敏感字段。
        ],
      },
    },
  });
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
