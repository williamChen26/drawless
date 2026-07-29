import { describe, expect, it } from "vitest";

import { getCoworkerPromptPresetGroups } from "../coworker-prompt-presets";

describe("coworker prompt presets", () => {
  it("keeps three stable pages with three prompts on every page", () => {
    for (const mode of ["empty-canvas", "canvas-context"] as const) {
      const groups = getCoworkerPromptPresetGroups(mode);
      expect(groups).toHaveLength(3);
      expect(groups.every((group) => group.length === 3)).toBe(true);
      expect(new Set(groups.flatMap((group) => group.map(({ id }) => id))).size)
        .toBe(9);
    }
  });

  it("offers creation-first prompts on an empty canvas and contextual prompts otherwise", () => {
    const emptyCanvasFirstGroup =
      getCoworkerPromptPresetGroups("empty-canvas")[0] ?? [];
    const canvasContextFirstGroup =
      getCoworkerPromptPresetGroups("canvas-context")[0] ?? [];

    expect(emptyCanvasFirstGroup.map(({ title }) => title)).toEqual([
      "画一个登录流程",
      "梳理一个产品问题",
      "搭一个基础流程"
    ]);
    expect(canvasContextFirstGroup.map(({ title }) => title)).toEqual([
      "看懂这块画布",
      "理顺选中的步骤",
      "找到下一步"
    ]);
  });
});
