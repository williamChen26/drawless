import { describe, expect, it } from "vitest";

import { loadServerConfig } from "../../config.js";
import { createServerApp } from "../app.js";

describe("server app", () => {
  it("exposes health and ready payloads for the sync backend", async () => {
    const { app } = await createServerApp({
      config: loadServerConfig({ ALLOWED_ORIGINS: "http://127.0.0.1:3000" })
    });

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({
      ok: true,
      service: "@drawless/server",
      syncRoute: "/sync/:roomId"
    });

    const ready = await app.inject({ method: "GET", url: "/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({
      ok: true,
      ready: true,
      rooms: { roomCount: 0, roomIds: [] },
      storage: { kind: "process-local-memory", durable: false }
    });

    await app.close();
  });
});
