import {
  loadFeedbackServerConfig,
  loadServerConfig
} from "./config.js";
import { createGithubFeedbackClient } from "./feedback/github-feedback-client.js";
import { createServerApp } from "./http/app.js";

const config = loadServerConfig();
const feedbackConfig = loadFeedbackServerConfig();
const { app } = await createServerApp({
  config,
  feedbackClient: feedbackConfig.enabled
    ? createGithubFeedbackClient(feedbackConfig)
    : null,
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
      feedback: feedbackConfig.enabled,
      storage: "process-local-memory",
      durable: false
    },
    "Drawless sync backend started"
  );
} catch (error) {
  app.log.error(error, "Failed to start sync backend");
  process.exitCode = 1;
}
