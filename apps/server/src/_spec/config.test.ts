import { describe, expect, it } from "vitest";

import { loadServerConfig } from "../config.js";

describe("server config", () => {
  it("loads conservative local defaults", () => {
    expect(loadServerConfig({})).toMatchObject({
      host: "127.0.0.1",
      port: 3001,
      syncRoute: "/sync"
    });
  });

  it("normalizes sync route and rejects wildcard origins", () => {
    expect(loadServerConfig({ SYNC_ROUTE: "draw" }).syncRoute).toBe("/draw");
    expect(() => loadServerConfig({ ALLOWED_ORIGINS: "*" })).toThrow(
      "ALLOWED_ORIGINS"
    );
  });
});
