
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { DuckDBStore } from "@mastra/duckdb";
import { MastraCompositeStore } from '@mastra/core/storage';
import { Observability, MastraStorageExporter, MastraPlatformExporter, SensitiveDataFilter } from '@mastra/observability';
import { drawlessCoworker } from './agents/drawless-coworker';
import { coworkerRoomApiRoutes } from './routes/coworker-room-routes';

export const mastra = new Mastra({
  agents: { drawlessCoworker },
  server: {
    apiRoutes: coworkerRoomApiRoutes,
  },
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
