import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CoworkerAvatarEntry } from "../../components/coworker-avatar-entry";
import { CoworkerActivityLog } from "../../components/coworker-activity-log";

describe("coworker conversation components", () => {
  it("keeps the avatar entry accessible while its image stays decorative", () => {
    const html = renderToStaticMarkup(
      <CoworkerAvatarEntry
        expanded={false}
        frameSrc="/coworker/avatar/frame-01.webp"
        lifecycleState="idle"
        mode="idle"
        onFocusChange={vi.fn()}
        onHoverChange={vi.fn()}
        onToggle={vi.fn()}
        panelId="coworker-panel"
      />
    );

    expect(html).toContain('aria-controls="coworker-panel"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="找 Drew"');
    expect(html).toContain('alt=""');
  });

  it("keeps the coworker available while an approval awaits a decision", () => {
    const html = renderToStaticMarkup(
      <CoworkerAvatarEntry
        attentionLabel="等你确认"
        expanded={false}
        frameSrc="/coworker/avatar/pointing-right-v1.webp"
        lifecycleState="online"
        mode="awaiting-approval"
        onFocusChange={vi.fn()}
        onHoverChange={vi.fn()}
        onToggle={vi.fn()}
        panelId="coworker-panel"
      />
    );

    expect(html).toContain('aria-label="找 Drew，等你确认"');
    expect(html).toContain("等你确认");
    expect(html).not.toContain("disabled");
  });

  it("does not present a recovered approval as fabricated user dialogue", () => {
    const html = renderToStaticMarkup(
      <CoworkerActivityLog
        id="activity"
        onClose={vi.fn()}
        turns={[
          {
            id: "recovered",
            userText: null,
            status: "awaiting_approval",
            blocks: []
          }
        ]}
      />
    );

    expect(html).toContain("Drew 提交了工作计划");
    expect(html).not.toContain("<blockquote>");
    expect(html).not.toContain("<span>你</span>");
  });
});
