import { createCanvasContextSnapshot } from '../tools/canvas-context-reader';
import { describe, expect, it } from 'vitest';
import { createTLStore, PageRecordType, type TLPageId, type TLShape, type TLShapeId } from 'tldraw';
import type { DrawlessCanvasEditOperation } from '@drawless/shared';
import { performCanvasEditToStore } from '../tools/canvas-edit-executor';

const pageId = 'page:test' as TLPageId;
const create: DrawlessCanvasEditOperation = { operationId: 'create', kind: 'create_shape', shapeKind: 'rectangle', bounds: { x: 0, y: 0, w: 100, h: 100 } };
function setup() {
  const store = createTLStore();
  store.put([PageRecordType.create({ id: pageId, name: 'test', index: 'a1' as never })]);
  const edit = (operations: DrawlessCanvasEditOperation[], extra = {}) => performCanvasEditToStore({ store, fallbackPageId: pageId, request: { roomId: 'alpha', currentPageId: pageId, intent: 'test', operations }, ...extra });
  return { store, edit };
}

describe('画布受控编辑', () => {
  it('presence 等待期间的远端 meta 修改不被旧 shape 覆盖', async () => {
    const { store, edit } = setup();
    const created = await edit([create]);
    const id = created.createdRecordIds[0] as TLShapeId;
    const result = await edit([{ operationId: 'move', kind: 'move_shape', shapeId: id, point: { x: 40, y: 60 } }], {
      presence: { updatePresence: async () => { const shape = store.get(id) as TLShape; store.put([{ ...shape, meta: { remote: 'keep' } }]); } }
    });
    expect(result.applied).toBe(true);
    expect(store.get(id)).toMatchObject({ x: 40, y: 60, meta: { remote: 'keep' } });
  });
  it('保护已锁定对象及其祖先', async () => {
    const { store, edit } = setup();
    const a = await edit([create]);
    const b = await edit([create]);
    const parentId = a.createdRecordIds[0] as TLShapeId;
    const childId = b.createdRecordIds[0] as TLShapeId;
    store.put([{ ...(store.get(parentId) as TLShape), isLocked: true }, { ...(store.get(childId) as TLShape), parentId }]);
    const result = await edit([{ operationId: 'move', kind: 'move_shape', shapeId: childId, point: { x: 40, y: 60 } }]);
    expect(result.applied).toBe(false);
    expect((store.get(childId) as TLShape).x).toBe(0);
  });
  it('已删除 page 不能悄悄降级到其他 page，取消后不提交', async () => {
    const { store, edit } = setup();
    const deleted = await edit([create], { request: { roomId: 'alpha', currentPageId: 'page:gone', intent: 'test', operations: [create] } });
    expect(deleted.applied).toBe(false);
    const abort = new AbortController();
    await expect(edit([create], { presence: { updatePresence: () => abort.abort() }, assertCanWrite: () => abort.signal.throwIfAborted() })).rejects.toThrow();
    expect(store.allRecords().filter(record => record.typeName === 'shape')).toHaveLength(0);
  });
  it('拒绝跨页箭头绑定，但允许同页 frame 内的目标', async () => {
    const { store, edit } = setup();
    const created = await edit([create]);
    const targetId = created.createdRecordIds[0] as TLShapeId;
    const secondPage = 'page:other' as TLPageId;
    store.put([PageRecordType.create({ id: secondPage, name: 'other', index: 'a2' as never })]);
    const arrow: DrawlessCanvasEditOperation = { operationId: 'arrow', kind: 'create_arrow', from: { x: 0, y: 0 }, to: { x: 100, y: 100 }, endBinding: { shapeId: targetId } };
    const moved = await edit([arrow], { presence: { updatePresence: () => store.put([{ ...(store.get(targetId) as TLShape), parentId: secondPage }]) } });
    expect(moved.warnings.join('')).toContain('当前 page');
    expect(store.allRecords().filter(record => record.typeName === 'binding')).toHaveLength(0);
    const shape = store.get(targetId) as TLShape;
    const frame = { ...shape, id: 'shape:frame' as TLShapeId, parentId: pageId, type: 'frame', props: { w: 400, h: 300, name: 'frame', color: 'black' } };
    store.put([frame as TLShape, { ...shape, parentId: frame.id }]);
    const nested = await edit([arrow]);
    expect(nested.warnings).toEqual([]);
    expect(store.allRecords().filter(record => record.typeName === 'binding')).toHaveLength(1);
  });
  it('读取含循环父引用的协同文档不会阻塞 runtime', async () => {
    const { store, edit } = setup();
    const created = await edit([create]);
    const id = created.createdRecordIds[0] as TLShapeId;
    store.put([{ ...(store.get(id) as TLShape), parentId: id }]);
    const snapshot = createCanvasContextSnapshot({ roomId: 'alpha', actorSessionId: 'coworker:alpha:test', records: store.allRecords(), recentlyChangedRecordIds: [], request: { roomId: 'alpha', currentPageId: pageId, cursor: { x: 0, y: 0 } } });
    expect(snapshot.available).toBe(true);
    expect(snapshot.focus.nearbyRecordIds).not.toContain(id);
  });
  it('部分失败如实返回警告', async () => {
    const { edit } = setup();
    const result = await edit([create, { operationId: 'missing', kind: 'move_shape', shapeId: 'shape:missing', point: { x: 10, y: 10 } }]);
    expect(result.applied).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.summary).toContain('部分');
  });
});
