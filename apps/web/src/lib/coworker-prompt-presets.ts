export type CoworkerPromptPreset = {
  /** 前端稳定标识，只用于列表渲染和本地交互。 */
  id: string;
  /** 水滴入口中展示的简短能力名称。 */
  title: string;
  /** 点击后原样递给 Drew 的完整用户要求。 */
  message: string;
};

export type CoworkerPromptPresetMode = "empty-canvas" | "canvas-context";

const EMPTY_CANVAS_PROMPT_GROUPS: CoworkerPromptPreset[][] = [
  [
    {
      id: "empty-login-flow",
      title: "画一个登录流程",
      message:
        "在画布空白处画一个包含登录、校验、成功和失败分支的用户登录流程。"
    },
    {
      id: "empty-product-map",
      title: "梳理一个产品问题",
      message:
        "在画布空白处画一张「用户问题—产品方案—下一步」产品梳理图。"
    },
    {
      id: "empty-decision-flow",
      title: "搭一个基础流程",
      message:
        "在画布空白处画一个包含开始、步骤、判断和结束的基础流程。"
    }
  ],
  [
    {
      id: "empty-idea-directions",
      title: "一起找三个方向",
      message:
        "先问我正在解决的问题，再给出三个适合放上画布继续讨论的方向。"
    },
    {
      id: "empty-project-kickoff",
      title: "搭一个项目启动图",
      message:
        "在画布上搭一个包含目标、参与者、关键步骤和风险的项目启动图。"
    },
    {
      id: "empty-decision-template",
      title: "做一个决策模板",
      message:
        "在画布上做一个包含备选方案、判断标准和下一步的决策模板。"
    }
  ],
  [
    {
      id: "empty-user-journey",
      title: "画一段用户旅程",
      message:
        "在画布空白处画一段包含触发、行动、阻碍和结果的基础用户旅程。"
    },
    {
      id: "empty-risk-map",
      title: "搭一个风险清单",
      message:
        "在画布上创建一个包含风险、影响和应对动作的简明结构。"
    },
    {
      id: "empty-week-plan",
      title: "排一个本周计划",
      message:
        "在画布上整理一份包含重点、步骤和完成标志的本周计划。"
    }
  ]
];

const CANVAS_CONTEXT_PROMPT_GROUPS: CoworkerPromptPreset[][] = [
  [
    {
      id: "context-read-canvas",
      title: "看懂这块画布",
      message:
        "看看这块画布，告诉我它现在在表达什么，以及还缺什么。"
    },
    {
      id: "context-organize-selection",
      title: "理顺选中的步骤",
      message:
        "把我选中的步骤排得更清楚，并补上缺失的连接。"
    },
    {
      id: "context-next-step",
      title: "找到下一步",
      message:
        "根据当前画布，建议我下一步最值得先推进什么。"
    }
  ],
  [
    {
      id: "context-find-problems",
      title: "找出不清楚的地方",
      message:
        "找出当前流程里最不清楚的三个地方，并告诉我怎么改。"
    },
    {
      id: "context-trim-copy",
      title: "精简选中的文字",
      message:
        "把我选中的文字改得更短、更清楚，保留原意。"
    },
    {
      id: "context-basic-flow",
      title: "补一段基础流程",
      message:
        "在画布空白处画一个从开始到结束的基础流程；如果关键信息不够，先问我。"
    }
  ],
  [
    {
      id: "context-check-connections",
      title: "检查步骤连接",
      message:
        "检查画布里的箭头和步骤关系，指出不合理或遗漏的连接。"
    },
    {
      id: "context-organize-ideas",
      title: "整理零散想法",
      message:
        "把画布上的零散想法整理成「问题—方案—下一步」。"
    },
    {
      id: "context-add-exceptions",
      title: "补上异常分支",
      message:
        "给当前流程补上可能遗漏的异常分支，并清楚标注。"
    }
  ]
];

/**
 * Prompt 只是在场入口文案，不建立新的 AI 能力契约。
 */
export function getCoworkerPromptPresetGroups(
  mode: CoworkerPromptPresetMode
) {
  return mode === "empty-canvas"
    ? EMPTY_CANVAS_PROMPT_GROUPS
    : CANVAS_CONTEXT_PROMPT_GROUPS;
}
