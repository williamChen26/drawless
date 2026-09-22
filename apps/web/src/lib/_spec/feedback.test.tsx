import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { FeedbackDialog } from "../../components/feedback-dialog";
import { submitDrawlessFeedback } from "../feedback";

describe("drawless feedback", () => {
  it("submits feedback to the configured drawless server", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({ ok: true, issueNumber: 31 }),
        { status: 201 }
      )
    );

    await expect(
      submitDrawlessFeedback({
        serverUrl: "wss://server.example/base/",
        fetcher,
        request: {
          submissionId: "11111111-1111-4111-8111-111111111111",
          category: "suggestion",
          message: "希望反馈成功后保留一个可复制的编号。",
          surface: "canvas"
        }
      })
    ).resolves.toEqual({ ok: true, issueNumber: 31 });

    const [resource, init] = fetcher.mock.calls[0] ?? [];
    expect(String(resource)).toBe(
      "https://server.example/base/feedback"
    );
    expect(JSON.parse(String(init?.body))).toMatchObject({
      category: "suggestion",
      website: ""
    });
  });

  it("renders an in-app form with an explicit public-data warning", () => {
    const html = renderToStaticMarkup(<FeedbackDialog />);

    expect(html).toContain(">反馈</button>");
    expect(html).toContain("<dialog");
    expect(html).toContain("告诉我哪里可以更好");
    expect(html).toContain("反馈会保存为公开 GitHub Issue");
    expect(html).toContain("提交反馈");
  });
});
