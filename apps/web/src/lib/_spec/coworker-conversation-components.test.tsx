import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CoworkerAvatarEntry } from "../../components/coworker-avatar-entry";

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
    expect(html).toContain('aria-label="和 Coworker 一起工作"');
    expect(html).toContain('alt=""');
  });

  it("locks the composer entry while an approval sheet owns the stage", () => {
    const html = renderToStaticMarkup(
      <CoworkerAvatarEntry
        disabled
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

    expect(html).toContain('aria-label="请先处理 Coworker 的确认单"');
    expect(html).toContain("disabled");
  });
});
