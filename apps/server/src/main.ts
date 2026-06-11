import { loadServerConfig } from "./config.js";
import { createServerApp } from "./http/app.js";

const config = loadServerConfig();
const { app } = await createServerApp({
  config,
  logger: true
});

try {
  const address = await app.listen({
    host: config.host,
    port: config.port
  });
  app.log.info(
    {
      address,
      health: `http://${config.host}:${config.port}/health`,
      ready: `http://${config.host}:${config.port}/ready`,
      sync: `ws://${config.host}:${config.port}${config.syncRoute}/:roomId?sessionId=:sessionId`,
      storage: "process-local-memory",
      durable: false
    },
    "Drawless sync backend started"
  );
} catch (error) {
  app.log.error(error, "Failed to start sync backend");
  process.exitCode = 1;
}
