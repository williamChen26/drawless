import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LiquidGlassProvider } from "@drawless/ui";

import { CoworkerAgentGlyph } from "../../components/coworker-agent-glyph";
import { CoworkerAvatarEntry } from "../../components/coworker-avatar-entry";
import { CoworkerActivityLog } from "../../components/coworker-activity-log";

describe("coworker conversation components", () => {
  it("keeps the avatar entry accessible while its glyph stays decorative", () => {
    const html = renderToStaticMarkup(
      <CoworkerAvatarEntry
        expanded={false}
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
    expect(html).toContain("coworker-agent-glyph");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-state="idle"');
    expect(html).toContain("drawless-liquid-glass--control");
    expect(html).toContain("drawless-liquid-glass--quiet");
    expect(html).toContain("coworker-avatar__base");
    expect(html).toContain("coworker-avatar__status");
  });

  it("keeps the coworker available while an approval awaits a decision", () => {
    const html = renderToStaticMarkup(
      <CoworkerAvatarEntry
        attentionLabel="等你确认"
        expanded={false}
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
    expect(html).toContain("coworker-avatar__status");
    expect(html).toContain('data-state="awaiting-approval"');
    expect(html).not.toContain("disabled");
  });

  it("keeps the contrast shadow attached to the living cursor instead of adding a backdrop", () => {
    const html = renderToStaticMarkup(<CoworkerAgentGlyph mode="idle" />);

    expect(html).toContain("coworker-agent-glyph__ink-shadow");
    expect(html).toContain("coworker-agent-glyph__orb-shadow");
    expect(html).not.toContain("coworker-agent-glyph__backdrop");
  });

  it("keeps listening and approval signals tied to their visible modes", () => {
    const idle = renderToStaticMarkup(<CoworkerAgentGlyph mode="idle" />);
    const listening = renderToStaticMarkup(
      <CoworkerAgentGlyph mode="listening" />
    );
    const awaitingApproval = renderToStaticMarkup(
      <CoworkerAgentGlyph mode="awaiting-approval" />
    );

    expect(idle).not.toContain("M182 89 C204 98 204 123 182 132");
    expect(listening).toContain("M182 89 C204 98 204 123 182 132");
    expect(awaitingApproval).toContain("M170 29 C176 12 200 12 206 29");
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

  it("teaches the purpose of an empty collaboration log", () => {
    const html = renderToStaticMarkup(
      <CoworkerActivityLog id="activity" onClose={vi.fn()} turns={[]} />
    );

    expect(html).toContain("这个房间里的对话和工作记录");
    expect(html).toContain(
      "找 Drew 聊聊或交代工作后，这里会留下往来。"
    );
  });

  it("shares one progressive liquid-glass filter across semantic surfaces", () => {
    const html = renderToStaticMarkup(
      <LiquidGlassProvider>
        <CoworkerActivityLog
          id="activity"
          onClose={vi.fn()}
          turns={[
            {
              id: "turn-1",
              userText: "帮我整理登录流程",
              status: "done",
              blocks: [
                {
                  id: "text-1",
                  kind: "text",
                  status: "done",
                  text: "已经按失败和成功两条路径整理好了。",
                  textId: "text-1"
                }
              ]
            }
          ]}
        />
      </LiquidGlassProvider>
    );

    expect(html.match(/<filter/g)).toHaveLength(1);
    expect(html).toContain("drawless-liquid-glass--panel");
    expect(html).toContain("drawless-liquid-glass--control");
    expect(html).toContain("drawless-liquid-glass--accent");
    expect(html).toContain('data-liquid-refraction="fallback"');
  });

  it("keeps the closed activity drawer mounted without leaving it interactive", () => {
    const html = renderToStaticMarkup(
      <CoworkerActivityLog
        id="activity"
        onClose={vi.fn()}
        open={false}
        turns={[]}
      />
    );

    expect(html).toContain('data-open="false"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("inert");
  });
});
