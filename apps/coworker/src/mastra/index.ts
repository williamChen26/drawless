
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { DuckDBStore } from "@mastra/duckdb";
import { MastraCompositeStore } from '@mastra/core/storage';
import { Observability, MastraStorageExporter, MastraPlatformExporter, SensitiveDataFilter } from '@mastra/observability';
import { drawlessCoworker } from './agents/drawless-coworker';
import { DrawlessCoworkerRoomRegistry } from './collaboration/coworker-room-registry';
import { createCoworkerRoomApiRoutes } from './routes/coworker-room-routes';
import { setCanvasContextCollector } from './tools/canvas-context-tool';
import { setCanvasEditExecutor } from './tools/canvas-edit-tool';

export const mastra = new Mastra({
  agents: { drawlessCoworker },
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    default: new LibSQLStore({
      id: "mastra-storage",
      url: "file:./mastra.db",
    }),
    domains: {
      observability: await new DuckDBStore().getStore('observability'),
    }
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new MastraStorageExporter(), // 将 observability events 持久化到 Mastra Storage。
          new MastraPlatformExporter(), // 配置 MASTRA_PLATFORM_ACCESS_TOKEN 后发送到 Mastra Platform。
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(), // 脱敏密码、token、key 等敏感字段。
        ],
      },
    },
  }),
});

const registeredDrawlessCoworker = mastra.getAgentById('drawless-coworker');
const coworkerRoomRegistry = new DrawlessCoworkerRoomRegistry(registeredDrawlessCoworker);
setCanvasContextCollector((request) => coworkerRoomRegistry.collectCanvasContext(request));
setCanvasEditExecutor((request) => coworkerRoomRegistry.applyCanvasEdit(request));

mastra.setServer({
  apiRoutes: createCoworkerRoomApiRoutes(coworkerRoomRegistry),
});
