import {
  createShapeId,
  getIndexAbove,
  sortByIndex,
  toRichText,
  ZERO_INDEX_KEY,
  type IndexKey,
  type TLArrowShape,
  type TLGeoShape,
  type TLPageId,
  type TLRecord,
  type TLShape,
  type TLShapeId,
  type TLStore,
  type TLTextShape,
} from 'tldraw';

import type {
  DrawlessCanvasBounds,
  DrawlessCanvasEditArrowBindingTarget,
  DrawlessCanvasEditCreateArrowOperation,
  DrawlessCanvasEditCreateShapeOperation,
  DrawlessCanvasEditOperation,
  DrawlessCanvasEditRequest,
  DrawlessCanvasEditResult,
  DrawlessCanvasEditStyleRole,
  DrawlessCanvasEditableShapeKind,
  DrawlessCanvasPoint,
  DrawlessRoomId,
} from '../../../../../packages/shared/src/index';

type ApplyCanvasEditInput = {
  /** 要写入的 coworker 本地同步 store。 */
  store: TLStore;
  /** 已经通过 shared schema 校验的画布编辑请求。 */
  request: DrawlessCanvasEditRequest;
  /** coworker 当前推断的 page ID，用于请求没有指定 page 时兜底。 */
  fallbackPageId: TLPageId;
  /** 可选 presence 控制器，用于拟人化执行时移动 coworker 光标。 */
  presence?: CanvasEditPresenceController | undefined;
};

export type CanvasEditPresencePatch = {
  /** coworker 光标要移动到的画布坐标；传 null 表示隐藏光标。 */
  cursor?: DrawlessCanvasPoint | null | undefined;
  /** coworker 当前选中的 shape ID 列表。 */
  selectedShapeIds?: string[] | undefined;
  /** coworker 临时 cursor chat 文案；传空字符串表示清空。 */
  chatMessage?: string | undefined;
  /** coworker 当前所在 page ID。 */
  currentPageId?: string | undefined;
};

export type CanvasEditPresenceController = {
  /** 通过 coworker 的 tldraw presence 推送协作者现场状态。 */
  updatePresence: (patch: CanvasEditPresencePatch) => void | Promise<void>;
};

type CanvasEditOperationResult = {
  /** 本次操作需要写入 TLStore 的 records。 */
  recordsToPut: TLRecord[];
  /** 本次操作新建的 tldraw record ID。 */
  createdRecordIds: string[];
  /** 本次操作更新的 tldraw record ID。 */
  updatedRecordIds: string[];
  /** 本次操作产生的降级或跳过说明。 */
  warnings: string[];
  /** 本次操作新建的 shape ID，用于后续 operationId 引用。 */
  createdShapeId?: TLShapeId | undefined;
};

type CanvasEditApplyContext = {
  /** 要写入的 coworker 本地同步 store。 */
  store: TLStore;
  /** 已经通过 shared schema 校验的画布编辑请求。 */
  request: DrawlessCanvasEditRequest;
  /** 本次请求最终写入的 page ID。 */
  pageId: TLPageId;
  /** 当前 page 的 index 分配器。 */
  nextIndex: () => IndexKey;
  /** 已知可被箭头绑定的 shape ID。 */
  knownShapeIds: Set<string>;
  /** 同一请求中 operationId 到新建 shapeId 的映射。 */
  operationShapeIds: Map<string, TLShapeId>;
};

const MIN_SHAPE_SIZE = 12;
const MAX_SHAPE_SIZE = 4_000;
const DEFAULT_GEO_SIZE = 120;
const DEFAULT_TEXT_WIDTH = 220;
const DEFAULT_SHAPE_SIZE = 'm';
const DEFAULT_ARROW_BINDING_ANCHOR = { x: 0.5, y: 0.5 };
const PERFORMED_FRAME_COUNT = 5;
const PERFORMED_FRAME_DELAY_MS = 70;
const PERFORMED_STEP_DELAY_MS = 120;

export async function performCanvasEditToStore(
  input: ApplyCanvasEditInput
): Promise<DrawlessCanvasEditResult> {
  const context = createApplyContext(input);
  const createdRecordIds: string[] = [];
  const updatedRecordIds = new Set<string>();
  const warnings: string[] = [];

  await input.presence?.updatePresence({
    currentPageId: context.pageId,
    selectedShapeIds: [],
    chatMessage: '我来画一下。',
  });
  await wait(PERFORMED_STEP_DELAY_MS);

  for (const operation of input.request.operations) {
    const result = await performOperation({
      context,
      operation,
      presence: input.presence,
    });

    mergeOperationResult({
      result,
      createdRecordIds,
      updatedRecordIds,
      warnings,
    });
    rememberCreatedShape(context, operation.operationId, result.createdShapeId);

    const writeError = result.warnings.find((warning) => warning.includes('写入 tldraw store 失败'));
    if (writeError) {
      break;
    }

    await wait(PERFORMED_STEP_DELAY_MS);
  }

  await input.presence?.updatePresence({
    selectedShapeIds: [],
    chatMessage: '',
  });

  return createCanvasEditResult({
    request: input.request,
    createdRecordIds,
    updatedRecordIds: [...updatedRecordIds],
    warnings,
  });
}

function createApplyContext(input: ApplyCanvasEditInput): CanvasEditApplyContext {
  const pageId = resolvePageId({
    records: input.store.allRecords(),
    requestedPageId: input.request.currentPageId,
    fallbackPageId: input.fallbackPageId,
  });
  const nextIndex = createIndexAllocator({
    records: input.store.allRecords(),
    parentId: pageId,
  });

  return {
    store: input.store,
    request: input.request,
    pageId,
    nextIndex,
    knownShapeIds: new Set(
      input.store
        .allRecords()
        .filter((record): record is TLShape => record.typeName === 'shape')
        .map((shape) => shape.id)
    ),
    operationShapeIds: new Map(),
  };
}

function mergeOperationResult(input: {
  result: CanvasEditOperationResult;
  createdRecordIds: string[];
  updatedRecordIds: Set<string>;
  warnings: string[];
}) {
  input.warnings.push(...input.result.warnings);
  input.createdRecordIds.push(...input.result.createdRecordIds);
  for (const recordId of input.result.updatedRecordIds) {
    input.updatedRecordIds.add(recordId);
  }
}

function rememberCreatedShape(
  context: CanvasEditApplyContext,
  operationId: string,
  createdShapeId: TLShapeId | undefined
) {
  if (!createdShapeId) {
    return;
  }

  context.operationShapeIds.set(operationId, createdShapeId);
  context.knownShapeIds.add(createdShapeId);
}

async function performOperation(input: {
  context: CanvasEditApplyContext;
  operation: DrawlessCanvasEditOperation;
  presence?: CanvasEditPresenceController | undefined;
}): Promise<CanvasEditOperationResult> {
  switch (input.operation.kind) {
    case 'create_shape':
      return performCreateShapeOperation({
        context: input.context,
        operation: input.operation,
        presence: input.presence,
      });
    case 'create_arrow':
      return performCreateArrowOperation({
        context: input.context,
        operation: input.operation,
        presence: input.presence,
      });
    case 'update_shape_text':
      return performUpdateShapeTextOperation({
        context: input.context,
        operation: input.operation,
        presence: input.presence,
      });
    case 'move_shape':
      return performMoveShapeOperation({
        context: input.context,
        operation: input.operation,
        presence: input.presence,
      });
    case 'resize_shape':
      return performResizeShapeOperation({
        context: input.context,
        operation: input.operation,
        presence: input.presence,
      });
  }
}

function createCanvasEditResult(input: {
  request: DrawlessCanvasEditRequest;
  createdRecordIds: string[];
  updatedRecordIds: string[];
  warnings: string[];
}): DrawlessCanvasEditResult {
  const applied = input.createdRecordIds.length > 0 || input.updatedRecordIds.length > 0;

  return {
    roomId: input.request.roomId,
    applied,
    createdRecordIds: input.createdRecordIds,
    updatedRecordIds: input.updatedRecordIds,
    warnings: input.warnings,
    summary: createResultSummary({
      request: input.request,
      createdRecordIds: input.createdRecordIds,
      updatedRecordIds: input.updatedRecordIds,
      warnings: input.warnings,
    }),
  };
}

export function createUnavailableCanvasEditResult(input: {
  /** 目标协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 无法写入画布的原因。 */
  reason: string;
}): DrawlessCanvasEditResult {
  return {
    roomId: input.roomId,
    applied: false,
    createdRecordIds: [],
    updatedRecordIds: [],
    warnings: [input.reason],
    summary: input.reason,
  };
}

function createShapeOperation(input: {
  request: DrawlessCanvasEditRequest;
  operation: DrawlessCanvasEditCreateShapeOperation;
  pageId: TLPageId;
  index: IndexKey;
}) {
  const shapeId = createShapeId();
  const record =
    input.operation.shapeKind === 'text'
      ? createTextShape({
          id: shapeId,
          request: input.request,
          operation: input.operation,
          pageId: input.pageId,
          index: input.index,
        })
      : createGeoShape({
          id: shapeId,
          request: input.request,
          operation: input.operation,
          pageId: input.pageId,
          index: input.index,
        });

  return {
    recordsToPut: [record],
    createdRecordIds: [record.id],
    updatedRecordIds: [],
    warnings: [],
    createdShapeId: record.id,
  };
}

function createGeoShape(input: {
  id: TLShapeId;
  request: DrawlessCanvasEditRequest;
  operation: DrawlessCanvasEditCreateShapeOperation;
  pageId: TLPageId;
  index: IndexKey;
}): TLGeoShape {
  const bounds = normalizeBounds(input.operation.bounds, {
    w: DEFAULT_GEO_SIZE,
    h: DEFAULT_GEO_SIZE,
  });
  const style = resolveStyleRole(input.operation.styleRole);

  return {
    id: input.id,
    typeName: 'shape',
    type: 'geo',
    x: bounds.x,
    y: bounds.y,
    rotation: 0,
    index: input.index,
    parentId: input.pageId,
    isLocked: false,
    opacity: 1,
    props: {
      geo: mapEditableShapeKindToGeo(input.operation.shapeKind),
      dash: 'draw',
      url: '',
      w: bounds.w,
      h: bounds.h,
      growY: 0,
      scale: 1,
      labelColor: style.color,
      color: style.color,
      fill: style.fill,
      size: DEFAULT_SHAPE_SIZE,
      font: 'draw',
      align: 'middle',
      verticalAlign: 'middle',
      richText: toRichText(input.operation.text ?? ''),
    },
    meta: createDrawlessShapeMeta(input.request, input.operation.operationId),
  };
}

function createTextShape(input: {
  id: TLShapeId;
  request: DrawlessCanvasEditRequest;
  operation: DrawlessCanvasEditCreateShapeOperation;
  pageId: TLPageId;
  index: IndexKey;
}): TLTextShape {
  const bounds = normalizeBounds(input.operation.bounds, {
    w: DEFAULT_TEXT_WIDTH,
    h: MIN_SHAPE_SIZE,
  });
  const style = resolveStyleRole(input.operation.styleRole);

  return {
    id: input.id,
    typeName: 'shape',
    type: 'text',
    x: bounds.x,
    y: bounds.y,
    rotation: 0,
    index: input.index,
    parentId: input.pageId,
    isLocked: false,
    opacity: 1,
    props: {
      color: style.color,
      size: DEFAULT_SHAPE_SIZE,
      font: 'draw',
      textAlign: 'start',
      w: bounds.w,
      richText: toRichText(input.operation.text ?? ''),
      scale: 1,
      autoSize: false,
    },
    meta: createDrawlessShapeMeta(input.request, input.operation.operationId),
  };
}

function createArrowOperation(input: {
  context: CanvasEditApplyContext;
  request: DrawlessCanvasEditRequest;
  operation: DrawlessCanvasEditCreateArrowOperation;
  pageId: TLPageId;
  index: IndexKey;
}): CanvasEditOperationResult {
  const shapeId = createShapeId();
  const from = normalizePoint(input.operation.from);
  const to = normalizePoint(input.operation.to);
  const style = resolveStyleRole(input.operation.styleRole);
  const warnings: string[] = [];
  const record: TLArrowShape = {
    id: shapeId,
    typeName: 'shape',
    type: 'arrow',
    x: from.x,
    y: from.y,
    rotation: 0,
    index: input.index,
    parentId: input.pageId,
    isLocked: false,
    opacity: 1,
    props: {
      kind: 'arc',
      labelColor: style.color,
      color: style.color,
      fill: style.fill,
      dash: 'draw',
      size: DEFAULT_SHAPE_SIZE,
      arrowheadStart: 'none',
      arrowheadEnd: 'arrow',
      font: 'draw',
      start: { x: 0, y: 0 },
      end: { x: to.x - from.x, y: to.y - from.y },
      bend: 0,
      richText: toRichText(input.operation.text ?? ''),
      labelPosition: 0.5,
      scale: 1,
      elbowMidPoint: 0.5,
    },
    meta: createDrawlessShapeMeta(input.request, input.operation.operationId),
  };
  const bindingRecords: TLRecord[] = [];
  const startBinding = createArrowBindingRecord({
    context: input.context,
    request: input.request,
    operation: input.operation,
    arrowId: record.id,
    terminal: 'start',
    target: input.operation.startBinding,
  });
  const endBinding = createArrowBindingRecord({
    context: input.context,
    request: input.request,
    operation: input.operation,
    arrowId: record.id,
    terminal: 'end',
    target: input.operation.endBinding,
  });

  for (const bindingResult of [startBinding, endBinding]) {
    if (bindingResult.warning) {
      warnings.push(bindingResult.warning);
    }
    if (bindingResult.record) {
      bindingRecords.push(bindingResult.record);
    }
  }

  return {
    recordsToPut: [record, ...bindingRecords],
    createdRecordIds: [record.id, ...bindingRecords.map((binding) => binding.id)],
    updatedRecordIds: [],
    warnings,
    createdShapeId: record.id,
  };
}

function createArrowBindingRecord(input: {
  context: CanvasEditApplyContext;
  request: DrawlessCanvasEditRequest;
  operation: DrawlessCanvasEditCreateArrowOperation;
  arrowId: TLShapeId;
  terminal: 'start' | 'end';
  target: DrawlessCanvasEditArrowBindingTarget | undefined;
}): { record: TLRecord | null; warning: string | null } {
  if (!input.target) {
    return { record: null, warning: null };
  }

  const targetShapeId = resolveArrowBindingTargetShapeId({
    context: input.context,
    arrowId: input.arrowId,
    operationId: input.operation.operationId,
    target: input.target,
    terminal: input.terminal,
  });
  if (!targetShapeId.ok) {
    return { record: null, warning: targetShapeId.warning };
  }

  return {
    record: {
      id: createBindingId(),
      typeName: 'binding',
      type: 'arrow',
      fromId: input.arrowId,
      toId: targetShapeId.value,
      props: {
        terminal: input.terminal,
        normalizedAnchor: DEFAULT_ARROW_BINDING_ANCHOR,
        isExact: false,
        isPrecise: true,
        snap: 'edge',
      },
      meta: createDrawlessShapeMeta(input.request, input.operation.operationId),
    } as TLRecord,
    warning: null,
  };
}

function resolveArrowBindingTargetShapeId(input: {
  context: CanvasEditApplyContext;
  arrowId: TLShapeId;
  operationId: string;
  target: DrawlessCanvasEditArrowBindingTarget;
  terminal: 'start' | 'end';
}): { ok: true; value: TLShapeId } | { ok: false; warning: string } {
  const targetId = input.target.shapeId
    ? input.target.shapeId
    : input.target.operationId
      ? input.context.operationShapeIds.get(input.target.operationId)
      : null;

  if (!targetId) {
    return {
      ok: false,
      warning: `${input.operationId}: 箭头 ${input.terminal} 端绑定目标不存在，已降级为坐标端点。`,
    };
  }
  if (targetId === input.arrowId) {
    return {
      ok: false,
      warning: `${input.operationId}: 箭头不能绑定到自身，${input.terminal} 端已降级为坐标端点。`,
    };
  }
  if (!input.context.knownShapeIds.has(targetId)) {
    return {
      ok: false,
      warning: `${input.operationId}: 找不到箭头 ${input.terminal} 端绑定目标 ${targetId}，已降级为坐标端点。`,
    };
  }

  return { ok: true, value: targetId as TLShapeId };
}

function createBindingId() {
  return `binding:drawless-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}` as TLRecord['id'];
}

function updateShapeTextOperation(input: {
  store: TLStore;
  operation: Extract<DrawlessCanvasEditOperation, { kind: 'update_shape_text' }>;
}) {
  const shape = getEditableShape(input.store, input.operation.shapeId);
  if (!shape) {
    return skippedOperation(input.operation.operationId, `找不到 shape：${input.operation.shapeId}`);
  }
  if (!('richText' in shape.props)) {
    return skippedOperation(
      input.operation.operationId,
      `shape 不支持文本更新：${input.operation.shapeId}`
    );
  }

  return {
    recordsToPut: [
      {
        ...shape,
        props: {
          ...shape.props,
          richText: toRichText(input.operation.text),
        },
      } as TLShape,
    ],
    createdRecordIds: [],
    updatedRecordIds: [shape.id],
    warnings: [],
  };
}

function moveShapeOperation(input: {
  store: TLStore;
  operation: Extract<DrawlessCanvasEditOperation, { kind: 'move_shape' }>;
}) {
  const shape = getEditableShape(input.store, input.operation.shapeId);
  if (!shape) {
    return skippedOperation(input.operation.operationId, `找不到 shape：${input.operation.shapeId}`);
  }
  const point = normalizePoint(input.operation.point);

  return {
    recordsToPut: [
      {
        ...shape,
        x: point.x,
        y: point.y,
      },
    ],
    createdRecordIds: [],
    updatedRecordIds: [shape.id],
    warnings: [],
  };
}

function resizeShapeOperation(input: {
  store: TLStore;
  operation: Extract<DrawlessCanvasEditOperation, { kind: 'resize_shape' }>;
}) {
  const shape = getEditableShape(input.store, input.operation.shapeId);
  if (!shape) {
    return skippedOperation(input.operation.operationId, `找不到 shape：${input.operation.shapeId}`);
  }
  if (!('w' in shape.props) || !('h' in shape.props)) {
    return skippedOperation(
      input.operation.operationId,
      `shape 不支持包围盒调整：${input.operation.shapeId}`
    );
  }
  const bounds = normalizeBounds(input.operation.bounds, {
    w: DEFAULT_GEO_SIZE,
    h: DEFAULT_GEO_SIZE,
  });

  return {
    recordsToPut: [
      {
        ...shape,
        x: bounds.x,
        y: bounds.y,
        props: {
          ...shape.props,
          w: bounds.w,
          h: bounds.h,
        },
      } as TLShape,
    ],
    createdRecordIds: [],
    updatedRecordIds: [shape.id],
    warnings: [],
  };
}

async function performCreateShapeOperation(input: {
  context: CanvasEditApplyContext;
  operation: DrawlessCanvasEditCreateShapeOperation;
  presence?: CanvasEditPresenceController | undefined;
}): Promise<CanvasEditOperationResult> {
  const result = createShapeOperation({
    request: input.context.request,
    operation: input.operation,
    pageId: input.context.pageId,
    index: input.context.nextIndex(),
  });
  const finalShape = result.recordsToPut.find(isShapeRecord);
  if (!finalShape) {
    return result;
  }

  const finalShapeWithoutText = setShapeRichText(finalShape, '');
  const initialShape = createInitialShapeFrame(finalShapeWithoutText);
  await input.presence?.updatePresence({
    currentPageId: input.context.pageId,
    cursor: getShapeCenter(initialShape),
    selectedShapeIds: [finalShape.id],
  });

  const initialWriteError = putRecords({
    store: input.context.store,
    operationId: input.operation.operationId,
    records: [initialShape],
  });
  if (initialWriteError) {
    return {
      ...result,
      recordsToPut: [],
      createdRecordIds: [],
      warnings: [...result.warnings, initialWriteError],
    };
  }

  for (let frame = 1; frame <= PERFORMED_FRAME_COUNT; frame += 1) {
    const progress = frame / PERFORMED_FRAME_COUNT;
    const nextShape = interpolateShapeFrame(initialShape, finalShapeWithoutText, progress);
    const writeError = putRecords({
      store: input.context.store,
      operationId: input.operation.operationId,
      records: [nextShape],
    });
    if (writeError) {
      return {
        ...result,
        recordsToPut: [],
        warnings: [...result.warnings, writeError],
      };
    }
    await input.presence?.updatePresence({
      cursor: getShapeCenter(nextShape),
      selectedShapeIds: [finalShape.id],
    });
    await wait(PERFORMED_FRAME_DELAY_MS);
  }

  if (input.operation.text?.trim()) {
    const chunks = createTextChunks(input.operation.text);
    for (const chunk of chunks) {
      const nextShape = setShapeRichText(finalShape, chunk);
      const writeError = putRecords({
        store: input.context.store,
        operationId: input.operation.operationId,
        records: [nextShape],
      });
      if (writeError) {
        return {
          ...result,
          recordsToPut: [],
          warnings: [...result.warnings, writeError],
        };
      }
      await wait(PERFORMED_FRAME_DELAY_MS);
    }
  }

  return { ...result, recordsToPut: [] };
}

async function performCreateArrowOperation(input: {
  context: CanvasEditApplyContext;
  operation: DrawlessCanvasEditCreateArrowOperation;
  presence?: CanvasEditPresenceController | undefined;
}): Promise<CanvasEditOperationResult> {
  const result = createArrowOperation({
    context: input.context,
    request: input.context.request,
    operation: input.operation,
    pageId: input.context.pageId,
    index: input.context.nextIndex(),
  });
  const finalArrow = result.recordsToPut.find(isArrowShapeRecord);
  if (!finalArrow) {
    return result;
  }

  const initialArrow: TLArrowShape = {
    ...finalArrow,
    props: {
      ...finalArrow.props,
      end: { x: 0, y: 0 },
      richText: toRichText(''),
    },
  };
  const startBindingRecords = result.recordsToPut.filter((record) =>
    isArrowBindingRecord(record, 'start')
  );
  const from = normalizePoint(input.operation.from);
  const to = normalizePoint(input.operation.to);

  await input.presence?.updatePresence({
    currentPageId: input.context.pageId,
    cursor: from,
    selectedShapeIds: [finalArrow.id],
  });

  const initialWriteError = putRecords({
    store: input.context.store,
    operationId: input.operation.operationId,
    records: [initialArrow, ...startBindingRecords],
  });
  if (initialWriteError) {
    return {
      ...result,
      recordsToPut: [],
      createdRecordIds: [],
      warnings: [...result.warnings, initialWriteError],
    };
  }

  for (let frame = 1; frame <= PERFORMED_FRAME_COUNT; frame += 1) {
    const progress = frame / PERFORMED_FRAME_COUNT;
    const cursor = interpolatePoint(from, to, progress);
    const nextArrow: TLArrowShape = {
      ...finalArrow,
      props: {
        ...finalArrow.props,
        end: {
          x: finalArrow.props.end.x * progress,
          y: finalArrow.props.end.y * progress,
        },
        richText: toRichText(''),
      },
    };
    const writeError = putRecords({
      store: input.context.store,
      operationId: input.operation.operationId,
      records: [nextArrow],
    });
    if (writeError) {
      return {
        ...result,
        recordsToPut: [],
        warnings: [...result.warnings, writeError],
      };
    }
    await input.presence?.updatePresence({
      cursor,
      selectedShapeIds: [finalArrow.id],
    });
    await wait(PERFORMED_FRAME_DELAY_MS);
  }

  const finalWriteError = putRecords({
    store: input.context.store,
    operationId: input.operation.operationId,
    records: result.recordsToPut,
  });
  if (finalWriteError) {
    return {
      ...result,
      recordsToPut: [],
      warnings: [...result.warnings, finalWriteError],
    };
  }

  if (input.operation.text?.trim()) {
    for (const chunk of createTextChunks(input.operation.text)) {
      const nextArrow = setShapeRichText(finalArrow, chunk);
      const writeError = putRecords({
        store: input.context.store,
        operationId: input.operation.operationId,
        records: [nextArrow],
      });
      if (writeError) {
        return {
          ...result,
          recordsToPut: [],
          warnings: [...result.warnings, writeError],
        };
      }
      await wait(PERFORMED_FRAME_DELAY_MS);
    }
  }

  return { ...result, recordsToPut: [] };
}

async function performUpdateShapeTextOperation(input: {
  context: CanvasEditApplyContext;
  operation: Extract<DrawlessCanvasEditOperation, { kind: 'update_shape_text' }>;
  presence?: CanvasEditPresenceController | undefined;
}): Promise<CanvasEditOperationResult> {
  const result = updateShapeTextOperation({
    store: input.context.store,
    operation: input.operation,
  });
  const finalShape = result.recordsToPut.find(isShapeRecord);
  if (!finalShape) {
    return result;
  }

  await input.presence?.updatePresence({
    cursor: getShapeCenter(finalShape),
    selectedShapeIds: [finalShape.id],
  });
  for (const chunk of createTextChunks(input.operation.text)) {
    const writeError = putRecords({
      store: input.context.store,
      operationId: input.operation.operationId,
      records: [setShapeRichText(finalShape, chunk)],
    });
    if (writeError) {
      return {
        ...result,
        recordsToPut: [],
        warnings: [...result.warnings, writeError],
      };
    }
    await wait(PERFORMED_FRAME_DELAY_MS);
  }

  return { ...result, recordsToPut: [] };
}

async function performMoveShapeOperation(input: {
  context: CanvasEditApplyContext;
  operation: Extract<DrawlessCanvasEditOperation, { kind: 'move_shape' }>;
  presence?: CanvasEditPresenceController | undefined;
}): Promise<CanvasEditOperationResult> {
  const shapeBefore = getEditableShape(input.context.store, input.operation.shapeId);
  const result = moveShapeOperation({
    store: input.context.store,
    operation: input.operation,
  });
  const finalShape = result.recordsToPut.find(isShapeRecord);
  if (!shapeBefore || !finalShape) {
    return result;
  }

  for (let frame = 1; frame <= PERFORMED_FRAME_COUNT; frame += 1) {
    const progress = frame / PERFORMED_FRAME_COUNT;
    const nextShape = {
      ...finalShape,
      x: interpolateNumber(shapeBefore.x, finalShape.x, progress),
      y: interpolateNumber(shapeBefore.y, finalShape.y, progress),
    };
    const writeError = putRecords({
      store: input.context.store,
      operationId: input.operation.operationId,
      records: [nextShape],
    });
    if (writeError) {
      return {
        ...result,
        recordsToPut: [],
        warnings: [...result.warnings, writeError],
      };
    }
    await input.presence?.updatePresence({
      cursor: getShapeCenter(nextShape),
      selectedShapeIds: [finalShape.id],
    });
    await wait(PERFORMED_FRAME_DELAY_MS);
  }

  return { ...result, recordsToPut: [] };
}

async function performResizeShapeOperation(input: {
  context: CanvasEditApplyContext;
  operation: Extract<DrawlessCanvasEditOperation, { kind: 'resize_shape' }>;
  presence?: CanvasEditPresenceController | undefined;
}): Promise<CanvasEditOperationResult> {
  const shapeBefore = getEditableShape(input.context.store, input.operation.shapeId);
  const result = resizeShapeOperation({
    store: input.context.store,
    operation: input.operation,
  });
  const finalShape = result.recordsToPut.find(isShapeRecord);
  if (!shapeBefore || !finalShape) {
    return result;
  }

  for (let frame = 1; frame <= PERFORMED_FRAME_COUNT; frame += 1) {
    const progress = frame / PERFORMED_FRAME_COUNT;
    const nextShape = interpolateShapeFrame(shapeBefore, finalShape, progress);
    const writeError = putRecords({
      store: input.context.store,
      operationId: input.operation.operationId,
      records: [nextShape],
    });
    if (writeError) {
      return {
        ...result,
        recordsToPut: [],
        warnings: [...result.warnings, writeError],
      };
    }
    await input.presence?.updatePresence({
      cursor: getShapeCenter(nextShape),
      selectedShapeIds: [finalShape.id],
    });
    await wait(PERFORMED_FRAME_DELAY_MS);
  }

  return { ...result, recordsToPut: [] };
}

function skippedOperation(operationId: string, reason: string) {
  return {
    recordsToPut: [],
    createdRecordIds: [],
    updatedRecordIds: [],
    warnings: [`${operationId}: ${reason}`],
  };
}

function getEditableShape(store: TLStore, shapeId: string) {
  const record = store.get(shapeId as TLShapeId);
  return isShapeRecord(record) ? record : null;
}

function isShapeRecord(record: TLRecord | undefined): record is TLShape {
  return record?.typeName === 'shape';
}

function isArrowShapeRecord(record: TLRecord | undefined): record is TLArrowShape {
  return record?.typeName === 'shape' && 'type' in record && record.type === 'arrow';
}

function isArrowBindingRecord(record: TLRecord, terminal: 'start' | 'end') {
  if (record.typeName !== 'binding' || !('type' in record) || record.type !== 'arrow') {
    return false;
  }

  const props = 'props' in record ? record.props : null;
  return Boolean(
    props && typeof props === 'object' && 'terminal' in props && props.terminal === terminal
  );
}

function putRecords(input: { store: TLStore; operationId: string; records: TLRecord[] }) {
  try {
    if (input.records.length > 0) {
      input.store.put(input.records);
    }
    return null;
  } catch (error) {
    return `${input.operationId}: 写入 tldraw store 失败：${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}

function createInitialShapeFrame(shape: TLShape): TLShape {
  const size = getShapeSize(shape);
  const center = getShapeCenter(shape);
  const nextSize = {
    w: Math.min(size.w, Math.max(MIN_SHAPE_SIZE, size.w * 0.18)),
    h: Math.min(size.h, Math.max(MIN_SHAPE_SIZE, size.h * 0.18)),
  };

  return resizeShapeFrame(shape, {
    x: center.x - nextSize.w / 2,
    y: center.y - nextSize.h / 2,
    w: nextSize.w,
    h: nextSize.h,
  });
}

function interpolateShapeFrame(from: TLShape, to: TLShape, progress: number): TLShape {
  const fromSize = getShapeSize(from);
  const toSize = getShapeSize(to);

  return resizeShapeFrame(to, {
    x: interpolateNumber(from.x, to.x, progress),
    y: interpolateNumber(from.y, to.y, progress),
    w: interpolateNumber(fromSize.w, toSize.w, progress),
    h: interpolateNumber(fromSize.h, toSize.h, progress),
  });
}

function resizeShapeFrame(
  shape: TLShape,
  bounds: { x: number; y: number; w: number; h: number }
): TLShape {
  const props = { ...shape.props } as Record<string, unknown>;
  if ('w' in props) {
    props.w = bounds.w;
  }
  if ('h' in props) {
    props.h = bounds.h;
  }

  return {
    ...shape,
    x: bounds.x,
    y: bounds.y,
    props: props as TLShape['props'],
  } as TLShape;
}

function setShapeRichText(shape: TLShape, text: string): TLShape {
  if (!('richText' in shape.props)) {
    return shape;
  }

  return {
    ...shape,
    props: {
      ...shape.props,
      richText: toRichText(text),
    },
  } as TLShape;
}

function createTextChunks(text: string) {
  const characters = Array.from(text);
  if (characters.length <= 4) {
    return [text];
  }

  const chunkCount = Math.min(6, Math.max(2, Math.ceil(characters.length / 4)));
  const chunks: string[] = [];
  for (let index = 1; index <= chunkCount; index += 1) {
    const end = Math.ceil((characters.length * index) / chunkCount);
    chunks.push(characters.slice(0, end).join(''));
  }

  return chunks;
}

function getShapeCenter(shape: TLShape): DrawlessCanvasPoint {
  const size = getShapeSize(shape);
  return {
    x: shape.x + size.w / 2,
    y: shape.y + size.h / 2,
  };
}

function getShapeSize(shape: TLShape) {
  const props = shape.props as Record<string, unknown>;
  return {
    w: typeof props.w === 'number' ? props.w : DEFAULT_TEXT_WIDTH,
    h: typeof props.h === 'number' ? props.h : 32,
  };
}

function interpolatePoint(
  from: DrawlessCanvasPoint,
  to: DrawlessCanvasPoint,
  progress: number
): DrawlessCanvasPoint {
  return {
    x: interpolateNumber(from.x, to.x, progress),
    y: interpolateNumber(from.y, to.y, progress),
  };
}

function interpolateNumber(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resolvePageId(input: {
  records: TLRecord[];
  requestedPageId: string | null | undefined;
  fallbackPageId: TLPageId;
}) {
  if (input.requestedPageId) {
    const requestedPage = input.records.find(
      (record) => record.id === input.requestedPageId && record.typeName === 'page'
    );
    if (requestedPage) {
      return requestedPage.id as TLPageId;
    }
  }

  const fallbackPage = input.records.find(
    (record) => record.id === input.fallbackPageId && record.typeName === 'page'
  );
  if (fallbackPage) {
    return fallbackPage.id as TLPageId;
  }

  const firstPage = input.records.find((record) => record.typeName === 'page');
  return (firstPage?.id ?? 'page:page') as TLPageId;
}

function createIndexAllocator(input: { records: TLRecord[]; parentId: TLPageId }) {
  const shapeIndexes = input.records
    .filter((record): record is TLShape => record.typeName === 'shape')
    .filter((shape) => shape.parentId === input.parentId)
    .sort(sortByIndex)
    .map((shape) => shape.index);

  let currentIndex = shapeIndexes.at(-1) ?? ZERO_INDEX_KEY;
  return () => {
    currentIndex = getIndexAbove(currentIndex);
    return currentIndex;
  };
}

function normalizeBounds(bounds: DrawlessCanvasBounds, fallback: { w: number; h: number }) {
  return {
    x: normalizeCoordinate(bounds.x, 0),
    y: normalizeCoordinate(bounds.y, 0),
    w: normalizeSize(bounds.w, fallback.w),
    h: normalizeSize(bounds.h, fallback.h),
  };
}

function normalizePoint(point: DrawlessCanvasPoint) {
  return {
    x: normalizeCoordinate(point.x, 0),
    y: normalizeCoordinate(point.y, 0),
  };
}

function normalizeCoordinate(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeSize(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(MAX_SHAPE_SIZE, Math.max(MIN_SHAPE_SIZE, value));
}

function resolveStyleRole(role: DrawlessCanvasEditStyleRole | undefined) {
  switch (role ?? 'default') {
    case 'start':
      return { color: 'green', fill: 'semi' };
    case 'step':
      return { color: 'blue', fill: 'semi' };
    case 'decision':
      return { color: 'yellow', fill: 'semi' };
    case 'success':
      return { color: 'green', fill: 'semi' };
    case 'error':
      return { color: 'red', fill: 'semi' };
    case 'note':
      return { color: 'grey', fill: 'none' };
    case 'default':
      return { color: 'black', fill: 'none' };
  }
}

function mapEditableShapeKindToGeo(shapeKind: DrawlessCanvasEditableShapeKind) {
  if (shapeKind === 'ellipse' || shapeKind === 'diamond') {
    return shapeKind;
  }

  return 'rectangle';
}

function createDrawlessShapeMeta(request: DrawlessCanvasEditRequest, operationId: string) {
  return {
    drawless: {
      actor: 'coworker',
      roomId: request.roomId,
      operationId,
      intent: request.intent.slice(0, 240),
    },
  };
}

function createResultSummary(input: {
  request: DrawlessCanvasEditRequest;
  createdRecordIds: string[];
  updatedRecordIds: string[];
  warnings: string[];
}) {
  const createdShapeCount = countShapeRecords(input.createdRecordIds);
  const updatedShapeCount = countShapeRecords(input.updatedRecordIds);
  if (
    input.createdRecordIds.length === 0 &&
    input.updatedRecordIds.length === 0
  ) {
    return input.warnings.length > 0
      ? `没有修改画布；${input.warnings[0]}`
      : '没有修改画布。';
  }

  const visibleChanges = [
    createdShapeCount > 0 ? `新增 ${createdShapeCount} 个画布元素` : null,
    updatedShapeCount > 0 ? `调整 ${updatedShapeCount} 个画布元素` : null,
  ].filter((value): value is string => Boolean(value));
  const changeSummary =
    visibleChanges.length > 0 ? visibleChanges.join('，') : '画布内容已经更新';

  return `已按“${input.request.intent}”完成画布修改：${changeSummary}。`;
}

function countShapeRecords(recordIds: string[]) {
  return new Set(
    recordIds.filter((recordId) => recordId.startsWith('shape:'))
  ).size;
}
