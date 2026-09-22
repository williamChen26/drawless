import { describe, expect, it, vi } from "vitest";

import { createGithubFeedbackClient } from "../github-feedback-client.js";

describe("GitHub feedback client", () => {
  it("creates a sanitized public issue with server-owned metadata", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ number: 17 }), {
        status: 201,
        headers: { "content-type": "application/json" }
      })
    );
    const client = createGithubFeedbackClient(
      {
        enabled: true,
        repository: "williamChen26/drawless-feedback",
        token: "server-only-token",
        requestTimeoutMs: 5000
      },
      {
        fetcher,
        now: () => new Date("2026-07-30T08:00:00.000Z")
      }
    );

    await expect(
      client.createIssue({
        submissionId: "11111111-1111-4111-8111-111111111111",
        category: "bug",
        message: "连接失败时请联系 @maintainer\n![追踪图片](https://example.com/a.png)",
        surface: "canvas"
      })
    ).resolves.toEqual({ issueNumber: 17 });

    const [resource, init] = fetcher.mock.calls[0] ?? [];
    expect(String(resource)).toBe(
      "https://api.github.com/repos/williamChen26/drawless-feedback/issues"
    );
    expect(init?.method).toBe("POST");
    expect(
      new Headers(init?.headers).get("authorization")
    ).toBe("Bearer server-only-token");

    const body = JSON.parse(String(init?.body)) as {
      title: string;
      body: string;
      labels: string[];
    };
    expect(body.title).toContain("[问题]");
    expect(body.labels).toEqual(["bug"]);
    expect(body.body).toContain("@\u200Bmaintainer");
    expect(body.body).toContain("\\![追踪图片]");
    expect(body.body).not.toContain("server-only-token");
    expect(body.body).not.toContain("submissionId");
  });
});
