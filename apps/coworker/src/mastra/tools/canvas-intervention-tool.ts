import { createTool } from '@mastra/core/tools';
import {
  canvasSemanticGraphSchema,
  canvasSummarySchema,
  coworkerInterventionDraftSchema,
  type DrawlessCanvasOperationDraft,
  type DrawlessCanvasSemanticGraph,
  type DrawlessCanvasSummary,
  type DrawlessCoworkerInterventionDraft,
  type DrawlessRoomId,
} from '../../../../../packages/shared/src/index';
import { z } from 'zod';

const requestKindSchema = z.enum([
  'inspiration',
  'advice',
  'canvas_operation',
  'diagnosis',
  'next_steps',
]);

const interventionStyleSchema = z.enum(['quiet', 'active', 'direct']);

export const canvasInterventionTool = createTool({
  id: 'draft-canvas-intervention',
  description:
    'Draft a safe collaboration response from a validated drawless canvas summary and semantic graph. This tool does not mutate the real canvas.',
  inputSchema: z.object({
    roomId: z.string().optional().describe('当前协同房间标识；缺省时优先从画布摘要或语义图推断'),
    currentUserIntent: z.string().optional().describe('用户当前表达的目标或问题'),
    canvasSummary: canvasSummarySchema.optional().describe('从 tldraw document 派生出的画布摘要'),
    canvasSemanticGraph: canvasSemanticGraphSchema
      .optional()
      .describe('从 tldraw document 派生出的节点、连线和区域语义图'),
    requestKind: requestKindSchema.default('advice').describe('用户期望 coworker 介入的方式'),
    interventionStyle: interventionStyleSchema.default('active').describe('coworker 回复和介入的主动程度'),
  }),
  outputSchema: coworkerInterventionDraftSchema,
  execute: async ({
    roomId,
    currentUserIntent,
    canvasSummary,
    canvasSemanticGraph,
    requestKind = 'advice',
    interventionStyle = 'active',
  }): Promise<DrawlessCoworkerInterventionDraft> => {
    // 工具输入来自外部观察链路，先收敛到 shared 契约，再生成 coworker 介入草案。
    const resolvedRoomId = resolveRoomId({
      roomId,
      canvasSummary,
      canvasSemanticGraph,
    });
    const contextRead = describeContext({
      canvasSummary,
      canvasSemanticGraph,
    });
    const operationDrafts = createOperationDrafts({
      requestKind,
      currentUserIntent,
      hasCanvasContext: Boolean(canvasSummary || canvasSemanticGraph),
      canvasSemanticGraph,
    });

    // 输出也经过 shared schema 校验，避免 Mastra 工具返回和后续 server 契约漂移。
    return coworkerInterventionDraftSchema.parse({
      draftId: createDraftId(resolvedRoomId),
      roomId: resolvedRoomId,
      createdAt: new Date().toISOString(),
      level: requestKind === 'canvas_operation' ? 'propose_action' : 'suggest',
      kind: operationDrafts.length > 0 ? 'operation_draft' : 'message',
      message: createSuggestedResponse({
        currentUserIntent,
        contextRead,
        hasCanvasContext: Boolean(canvasSummary || canvasSemanticGraph),
        interventionStyle,
        requestKind,
      }),
      operationDrafts,
    });
  },
});

function resolveRoomId(input: {
  roomId?: string;
  canvasSummary?: DrawlessCanvasSummary;
  canvasSemanticGraph?: DrawlessCanvasSemanticGraph;
}): DrawlessRoomId {
  return (
    input.roomId?.trim() ||
    input.canvasSummary?.roomId ||
    input.canvasSemanticGraph?.roomId ||
    'unbound-room'
  );
}

function describeContext(input: {
  canvasSummary?: DrawlessCanvasSummary;
  canvasSemanticGraph?: DrawlessCanvasSemanticGraph;
}) {
  const summary = input.canvasSummary;
  const graph = input.canvasSemanticGraph;
  if (!summary && !graph) {
    return '还没有收到真实画布摘要或语义图，不能判断画布上的具体内容。';
  }

  // summary 负责快速说明整体状态，semantic graph 负责补充节点、连接、区域等结构关系。
  const graphText = graph
    ? `语义图包含 ${graph.nodes.length} 个节点、${graph.edges.length} 条连接、${graph.regions.length} 个区域。`
    : '暂未收到语义图。';
  const focusText = summary
    ? `当前选中 ${summary.focus.selectedRecordIds.length} 个对象，最近变化 ${summary.focus.recentlyChangedRecordIds.length} 个对象。`
    : '暂未收到焦点上下文。';
  const edgePreview =
    graph && graph.edges.length > 0
      ? `连接预览：${graph.edges
          .slice(0, 3)
          .map((edge) => `${edge.fromId ?? '?'} -> ${edge.toId ?? '?'}`)
          .join('；')}。`
      : '暂未识别到连接关系。';

  return [summary?.summary, graphText, focusText, edgePreview].filter(Boolean).join(' ');
}

function createOperationDrafts(input: {
  requestKind: z.infer<typeof requestKindSchema>;
  currentUserIntent?: string;
  hasCanvasContext: boolean;
  canvasSemanticGraph?: DrawlessCanvasSemanticGraph;
}): DrawlessCanvasOperationDraft[] {
  if (input.requestKind !== 'canvas_operation') {
    return [];
  }

  // 当前阶段只产生需要确认的操作草案，不把任何操作直接写回 tldraw document。
  const focusDescription = describeOperationTarget(input.canvasSemanticGraph);

  return [
    {
      operationType: 'create_note',
      intent: input.currentUserIntent || '协助用户推进当前画布任务',
      targetDescription: input.hasCanvasContext ? focusDescription : '待接入 server 后由画布上下文确定',
      rationale: input.hasCanvasContext
        ? '先以可确认的 note 草案介入，避免在缺少用户确认时直接改动画布事实源。'
        : '当前缺少真实画布上下文，只能提出操作草案，不能执行画布修改。',
      requiresUserConfirmation: true,
    },
  ];
}

function describeOperationTarget(graph: DrawlessCanvasSemanticGraph | undefined) {
  const selectedRegion = graph?.regions[0];
  if (selectedRegion) {
    return selectedRegion.title
      ? `${selectedRegion.title} 区域附近`
      : `${selectedRegion.id} 区域附近`;
  }

  const selectedNode = graph?.nodes[0];
  if (selectedNode) {
    return selectedNode.text ? `${selectedNode.text} 附近` : `${selectedNode.id} 附近`;
  }

  return '用户当前关注的画布区域';
}

function createSuggestedResponse(input: {
  currentUserIntent?: string;
  contextRead: string;
  hasCanvasContext: boolean;
  interventionStyle: z.infer<typeof interventionStyleSchema>;
  requestKind: z.infer<typeof requestKindSchema>;
}) {
  const intentText = input.currentUserIntent
    ? `我理解你现在想要：${input.currentUserIntent}`
    : '我会先确认你当前想推进的目标。';

  if (!input.hasCanvasContext) {
    return `${intentText} 目前我还没有真实画布摘要或语义图，所以不会编造画布内容；可以先帮你拆目标，等接入协同数据后再给具体建议或操作草案。`;
  }

  if (input.requestKind === 'canvas_operation') {
    return `${intentText} 基于当前画布观察：${input.contextRead} 我会先给出可确认的画布操作草案；真正执行时应通过 drawless server 的协同链路写回 tldraw document。`;
  }

  if (input.interventionStyle === 'quiet') {
    return `${intentText} 基于当前画布观察：${input.contextRead} 我会保持低打扰，只在发现明显卡点、结构机会或用户明确求助时介入。`;
  }

  if (input.interventionStyle === 'direct') {
    return `${intentText} 基于当前画布观察：${input.contextRead} 我会直接给出下一步建议，并把可能的画布改动整理成可确认的操作草案。`;
  }

  return `${intentText} 基于当前画布观察：${input.contextRead} 我会像同事一样给出灵感、建议和下一步行动。`;
}

function createDraftId(roomId: DrawlessRoomId) {
  const randomPart =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `draft:${roomId}:${randomPart}`;
}
