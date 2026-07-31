import { describe, expect, it } from "vitest";

import {
  loadFeedbackServerConfig,
  loadServerConfig
} from "../config.js";

describe("server config", () => {
  it("loads conservative local defaults", () => {
    expect(loadServerConfig({})).toMatchObject({
      host: "127.0.0.1",
      port: 3001,
      syncRoute: "/sync",
      coworker: {
        enabled: false,
        baseUrl: null,
        serverUrl: "http://127.0.0.1:3001",
        requestTimeoutMs: 10000
      }
    });
  });

  it("normalizes sync route and rejects wildcard origins", () => {
    expect(loadServerConfig({ SYNC_ROUTE: "draw" }).syncRoute).toBe("/draw");
    expect(() => loadServerConfig({ ALLOWED_ORIGINS: "*" })).toThrow(
      "ALLOWED_ORIGINS"
    );
  });

  it("loads coworker control configuration only when explicitly enabled", () => {
    expect(
      loadServerConfig({
        HOST: "0.0.0.0",
        PORT: "3002",
        COWORKER_ENABLED: "true",
        COWORKER_BASE_URL: "http://127.0.0.1:4111/",
        SERVER_PUBLIC_URL: "http://127.0.0.1:3002/",
        COWORKER_REQUEST_TIMEOUT_MS: "12000"
      })
    ).toMatchObject({
      coworker: {
        enabled: true,
        baseUrl: "http://127.0.0.1:4111",
        serverUrl: "http://127.0.0.1:3002",
        requestTimeoutMs: 12000
      }
    });

    expect(() =>
      loadServerConfig({ COWORKER_ENABLED: "sometimes" })
    ).toThrow("COWORKER_ENABLED");
  });

  it("keeps GitHub feedback disabled until a server-only token is configured", () => {
    expect(loadFeedbackServerConfig({})).toEqual({ enabled: false });
    expect(() =>
      loadFeedbackServerConfig({ FEEDBACK_ENABLED: "true" })
    ).toThrow("GITHUB_FEEDBACK_TOKEN");

    expect(
      loadFeedbackServerConfig({
        FEEDBACK_ENABLED: "true",
        GITHUB_FEEDBACK_REPOSITORY:
          "williamChen26/drawless-feedback",
        GITHUB_FEEDBACK_TOKEN: "test-token",
        FEEDBACK_REQUEST_TIMEOUT_MS: "6000"
      })
    ).toEqual({
      enabled: true,
      repository: "williamChen26/drawless-feedback",
      token: "test-token",
      requestTimeoutMs: 6000
    });
  });
});
