import { describe, expect, it, vi } from 'vitest';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import type { LanguageModel } from '@mastra/core/llm';
import { LibSQLStore } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { canvasEditTool, setCanvasEditExecutor } from '../tools/canvas-edit-tool';
import { DrawlessCoworkerRoomRegistry } from '../collaboration/coworker-room-registry';

vi.mock('../collaboration/coworker-room-client', () => ({
  createDrawlessCoworkerRoomClient: (options: { roomId: string }) => ({
    identity: { roomId: options.roomId },
    waitUntilLoaded: async () => ({ shapeCount: 0 }), close() {},
  }),
}));

it('真实 Mastra 暂停和恢复时保留受信房间能力，批准前不执行工具', async () => {
  let calls = 0;
  // 本地确定性 provider：只发出一个工具调用，不联网、不使用 API key。
  const model: LanguageModel = {
    specificationVersion: 'v2', provider: 'drawless-test', modelId: 'approval-test', supportedUrls: {},
    doGenerate: async () => { throw new Error('仅测试流式接口'); },
    doStream: async () => ({ stream: new ReadableStream({ start(controller) {
      controller.enqueue({ type: 'stream-start', warnings: [] });
      if (calls++ === 0) {
        controller.enqueue({ type: 'tool-call', toolCallId: 'edit-1', toolName: 'edit-canvas', input: JSON.stringify({
          roomId: 'alpha', intent: 'test', operations: [{ operationId: 'create', kind: 'create_shape', shapeKind: 'rectangle', bounds: { x: 0, y: 0, w: 100, h: 80 } }],
        }) });
        controller.enqueue({ type: 'finish', finishReason: 'tool-calls', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } });
      } else {
        controller.enqueue({ type: 'text-start', id: 'text-1' });
        controller.enqueue({ type: 'text-delta', id: 'text-1', delta: 'done' });
        controller.enqueue({ type: 'text-end', id: 'text-1' });
        controller.enqueue({ type: 'finish', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } });
      }
      controller.close();
    } }) }),
  };
  const execute = vi.fn(async () => ({ roomId: 'alpha', applied: true, summary: '完成', createdRecordIds: ['shape:test'], updatedRecordIds: [], warnings: [] }));
  setCanvasEditExecutor(execute);
  const agent = new Agent({ id: 'approval-test', name: 'test', instructions: 'test', model, memory: new Memory(), tools: { 'edit-canvas': canvasEditTool } });
  const mastra = new Mastra({ agents: { agent }, storage: new LibSQLStore({ id: 'test', url: ':memory:' }), logger: false });
  const registry = new DrawlessCoworkerRoomRegistry(mastra.getAgentById('approval-test'));
  try {
    await registry.start('alpha', { serverUrl: 'http://127.0.0.1:3001', waitUntilLoaded: true, timeoutMs: 500, sendIntroCursorChat: false });
    const initial = await registry.streamConversation({ roomId: 'alpha', message: 'test' });
    const events: unknown[] = [];
    for await (const event of initial.fullStream!) events.push(event);
    expect(events.some(event => (event as { type: string }).type === 'tool-call-approval'), JSON.stringify(events)).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    const resumed = await registry.approveConversationToolCall('alpha', { runId: initial.runId!, toolCallId: 'edit-1' });
    const resumedEvents: unknown[] = [];
    for await (const event of resumed.fullStream!) resumedEvents.push(event);
    expect(execute, JSON.stringify(resumedEvents)).toHaveBeenCalledTimes(1);
    await expect(registry.approveConversationToolCall('alpha', { runId: initial.runId!, toolCallId: 'edit-1' })).rejects.toThrow();
  } finally {
    registry.stop('alpha');
    await mastra.getStorage()?.close();
  }
}, 15000);
