import { RequestContext } from '@mastra/core/request-context';

// 能力对象只能由当前进程创建，HTTP JSON 或模型参数不能伪造。
const authorities = new WeakSet<object>();
// class 保持能力对象引用；Mastra 合并普通对象时会复制属性，不能用可序列化的 plain object 承载身份。
class RoomAuthority {
  constructor(readonly roomId: string, public signal: AbortSignal, public canWrite: boolean) {}
}

export function createRoomRequestContext(roomId: string, signal: AbortSignal, canWrite = false) {
  const authority = new RoomAuthority(roomId, signal, canWrite);
  authorities.add(authority);
  const context = new RequestContext();
  context.set('drawlessAuthority', authority);
  return context;
}

export function assertRoomAuthority(context: RequestContext | undefined, roomId: string, write = false) {
  const authority = context?.get('drawlessAuthority') as RoomAuthority | undefined;
  if (!authority || !authorities.has(authority) || authority.roomId !== roomId || (write && !authority.canWrite)) {
    throw new Error('当前请求没有该房间的工具权限。');
  }
  authority.signal.throwIfAborted();
  return authority.signal;
}

/** Mastra 恢复暂停工具时可能复用原工具闭包，必须在同一能力对象上换入本次取消信号和写权限。 */
export function renewRoomRequestContext(context: RequestContext, roomId: string, signal: AbortSignal, canWrite: boolean) {
  const authority = context.get('drawlessAuthority') as RoomAuthority | undefined;
  if (!authority || !authorities.has(authority) || authority.roomId !== roomId) throw new Error('审批上下文不属于当前房间。');
  authority.signal = signal;
  authority.canWrite = canWrite;
  return context;
}
