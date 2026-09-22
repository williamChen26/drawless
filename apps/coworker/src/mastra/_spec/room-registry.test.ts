import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadableStream } from 'node:stream/web';
import { DrawlessCoworkerRoomRegistry } from '../collaboration/coworker-room-registry';
import { assertRoomAuthority } from '../collaboration/room-authority';
import type { DrawlessCursorChatReplyAgent, DrawlessAgentStreamOutput } from '../collaboration/cursor-chat-reply-handler';

vi.mock('../collaboration/coworker-room-client', () => ({
  createDrawlessCoworkerRoomClient: (options: { roomId: string }) => ({
    identity: { roomId: options.roomId },
    waitUntilLoaded: async () => ({ shapeCount: 0 }),
    close() {}, getSnapshot: () => ({ shapeCount: 0 }),
  }),
}));
const registries: DrawlessCoworkerRoomRegistry[] = [];
afterEach(() => { for (const registry of registries.splice(0)) { registry.stop('alpha'); registry.stop('beta'); } });
function output(runId: string): DrawlessAgentStreamOutput {
  return { runId, textStream: new ReadableStream({ start(controller) { controller.close(); } }),
    fullStream: (async function* () { yield { type: 'tool-call-approval', runId, payload: { toolCallId: 'edit-1' } }; })() };
}

describe('room 与审批绑定', () => {
  it('工具上下文绑定房间，跨房间审批和重复审批不能恢复模型', async () => {
    const stream = vi.fn<DrawlessCursorChatReplyAgent['stream']>(async (_prompt, options) => {
      expect(() => assertRoomAuthority(options?.requestContext, 'alpha')).not.toThrow();
      expect(() => assertRoomAuthority(options?.requestContext, 'beta')).toThrow();
      return output('run-alpha');
    });
    const approve = vi.fn<DrawlessCursorChatReplyAgent['approveToolCall']>(async request => {
      expect(() => assertRoomAuthority(request.requestContext, 'alpha', true)).not.toThrow();
      return { ...output('run-alpha'), fullStream: (async function* () {})() };
    });
    const registry = new DrawlessCoworkerRoomRegistry({ stream, approveToolCall: approve, declineToolCall: approve });
    registries.push(registry);
    for (const id of ['alpha', 'beta']) await registry.start(id, { serverUrl: 'http://127.0.0.1:3001', waitUntilLoaded: true, timeoutMs: 500, sendIntroCursorChat: false });
    const first = await registry.streamConversation({ roomId: 'alpha', message: 'test' });
    for await (const _ of first.fullStream!) {}
    const approval = { runId: 'run-alpha', toolCallId: 'edit-1' };
    await expect(registry.approveConversationToolCall('beta', approval)).rejects.toThrow('房间');
    expect(approve).not.toHaveBeenCalled();
    const busy = await registry.streamConversation({ roomId: 'alpha', message: 'another task' });
    await expect(registry.approveConversationToolCall('alpha', approval)).rejects.toThrow('正在处理');
    busy.cancel?.();
    const resumed = await registry.approveConversationToolCall('alpha', approval);
    for await (const _ of resumed.fullStream!) {}
    await expect(registry.approveConversationToolCall('alpha', approval)).rejects.toThrow();
    expect(approve).toHaveBeenCalledTimes(1);
  });
  it('stop 取消未完成模型调用', async () => {
    let signal: AbortSignal | undefined;
    const registry = new DrawlessCoworkerRoomRegistry({
      stream: async (_prompt, options) => { signal = options?.abortSignal; return output('run-alpha'); },
      approveToolCall: async () => output('unused'), declineToolCall: async () => output('unused'),
    });
    registries.push(registry);
    await registry.start('alpha', { serverUrl: 'http://127.0.0.1:3001', waitUntilLoaded: true, timeoutMs: 500, sendIntroCursorChat: false });
    await registry.streamConversation({ roomId: 'alpha', message: 'test' });
    registry.stop('alpha');
    expect(signal?.aborted).toBe(true);
  });
});
