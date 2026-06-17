import type { TLInstancePresence, TLRecord, TLShape } from 'tldraw';

import {
  canvasContextSnapshotSchema,
  canvasSemanticGraphSchema,
  canvasSummarySchema,
  type DrawlessCanvasBounds,
  type DrawlessCanvasContextRequest,
  type DrawlessCanvasContextSnapshot,
  type DrawlessCanvasObservationEvent,
  type DrawlessCanvasSemanticEdge,
  type DrawlessCanvasSemanticGraph,
  type DrawlessCanvasSemanticNode,
  type DrawlessCanvasSemanticNodeKind,
  type DrawlessCanvasSemanticRegion,
  type DrawlessCanvasSemanticRegionKind,
  type DrawlessCanvasSummary,
  type DrawlessRoomId,
  type DrawlessSessionId,
} from '../../../../../packages/shared/src/index';

type CreateCanvasContextInput = {
  /** coworker 所在的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** coworker 当前 sync session ID，用于标记观察事件来源。 */
  actorSessionId: DrawlessSessionId;
  /** coworker 本地 TLStore 中的 records。 */
  records: TLRecord[];
  /** 最近从远端同步变化中观察到的 record ID。 */
  recentlyChangedRecordIds: string[];
  /** agent 调用上下文工具时给出的焦点参数。 */
  request: DrawlessCanvasContextRequest;
};

type ShapeDigest = {
  id: string;
  type: string;
  text: string | null;
  x: number;
  y: number;
  parentId: string;
};

type ArrowEndpointBinding = {
  fromId: string | null;
  toId: string | null;
};

const DEFAULT_MAX_NODES = 80;
const NEARBY_LIMIT = 12;
const TEXT_PREVIEW_LIMIT = 8;

export function createCanvasContextSnapshot(
  input: CreateCanvasContextInput
): DrawlessCanvasContextSnapshot {
  const capturedAt = new Date().toISOString();
  const currentPageId = input.request.currentPageId ?? inferCurrentPageId(input.records);
  const focusedRecordIds = uniqueNonEmptyStrings(input.request.focusedRecordIds ?? []);
  const selectedRecordIds = getPresenceSelectedRecordIds({
    records: input.records,
    currentPageId,
    excludeSessionId: input.actorSessionId,
  });
  const recentlyChangedRecordIds = uniqueNonEmptyStrings(input.recentlyChangedRecordIds);
  const nearbyRecordIds = getNearbyShapeIds({
    records: input.records,
    currentPageId,
    cursor: input.request.cursor ?? null,
    focusedRecordIds,
  });
  const viewportRecordIds = uniqueNonEmptyStrings([
    ...focusedRecordIds,
    ...selectedRecordIds,
    ...nearbyRecordIds,
    ...recentlyChangedRecordIds,
  ]);
  const summary = createCanvasSummary({
    roomId: input.roomId,
    actorSessionId: input.actorSessionId,
    records: input.records,
    capturedAt,
    currentPageId,
    selectedRecordIds,
    recentlyChangedRecordIds,
    viewportRecordIds,
  });
  const { graph, warnings } = createCanvasSemanticGraph({
    roomId: input.roomId,
    records: input.records,
    capturedAt,
    currentPageId,
    maxNodes: input.request.maxNodes ?? DEFAULT_MAX_NODES,
    priorityRecordIds: [
      ...focusedRecordIds,
      ...selectedRecordIds,
      ...nearbyRecordIds,
      ...recentlyChangedRecordIds,
    ],
  });

  return canvasContextSnapshotSchema.parse({
    roomId: input.roomId,
    available: true,
    capturedAt,
    currentPageId,
    summary,
    semanticGraph: graph,
    focus: {
      selectedRecordIds,
      focusedRecordIds,
      nearbyRecordIds,
      recentlyChangedRecordIds,
    },
    warnings,
  });
}

export function createUnavailableCanvasContextSnapshot(input: {
  /** 请求上下文的协同房间 ID。 */
  roomId: DrawlessRoomId;
  /** 上下文不可用的原因。 */
  reason: string;
}): DrawlessCanvasContextSnapshot {
  return canvasContextSnapshotSchema.parse({
    roomId: input.roomId,
    available: false,
    capturedAt: new Date().toISOString(),
    currentPageId: null,
    summary: null,
    semanticGraph: null,
    focus: {
      selectedRecordIds: [],
      focusedRecordIds: [],
      nearbyRecordIds: [],
      recentlyChangedRecordIds: [],
    },
    warnings: [input.reason],
  });
}

function createCanvasSummary(input: {
  roomId: DrawlessRoomId;
  actorSessionId: DrawlessSessionId;
  records: TLRecord[];
  capturedAt: string;
  currentPageId: string | null;
  selectedRecordIds: string[];
  recentlyChangedRecordIds: string[];
  viewportRecordIds: string[];
}): DrawlessCanvasSummary {
  const shapes = input.records.filter(isShapeRecord).map(toShapeDigest);
  const presences = input.records.filter(isPresenceRecord);
  const recentEvents = createRecentEvents({
    actorSessionId: input.actorSessionId,
    roomId: input.roomId,
    capturedAt: input.capturedAt,
    recordsById: new Map(input.records.map((record) => [record.id, record])),
    recentlyChangedRecordIds: input.recentlyChangedRecordIds,
  });

  return canvasSummarySchema.parse({
    roomId: input.roomId,
    capturedAt: input.capturedAt,
    currentPageId: input.currentPageId,
    summary: describeCanvas({
      shapes,
      presences,
      selectedRecordIds: input.selectedRecordIds,
      recentlyChangedRecordIds: input.recentlyChangedRecordIds,
    }),
    focus: {
      selectedRecordIds: input.selectedRecordIds,
      recentlyChangedRecordIds: input.recentlyChangedRecordIds,
      viewportRecordIds: input.viewportRecordIds,
    },
    recentEvents,
  });
}

function createCanvasSemanticGraph(input: {
  roomId: DrawlessRoomId;
  records: TLRecord[];
  capturedAt: string;
  currentPageId: string | null;
  maxNodes: number;
  priorityRecordIds: string[];
}): { graph: DrawlessCanvasSemanticGraph; warnings: string[] } {
  const shapes = input.records.filter(isShapeRecord);
  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]));
  const priorityIds = new Set(uniqueNonEmptyStrings(input.priorityRecordIds));
  const allNodes = shapes
    .map((shape) => toSemanticNode(shape, shapesById))
    .sort((left, right) => compareNodesForModel(left, right, priorityIds));
  const nodes = allNodes.slice(0, input.maxNodes);
  const includedNodeIds = new Set(nodes.map((node) => node.id));
  const arrowBindingsById = createArrowBindingsById(input.records);
  const edges = shapes
    .filter((shape) => shape.type === 'arrow')
    .map((shape) => toSemanticEdge(shape, arrowBindingsById.get(shape.id)))
    .filter((edge) => shouldKeepEdge(edge, includedNodeIds, priorityIds));
  const regions = createSemanticRegions(shapes, nodes);
  const warnings =
    allNodes.length > nodes.length
      ? [`语义图节点从 ${allNodes.length} 个截断到 ${nodes.length} 个，优先保留焦点、选区、附近和含文本对象。`]
      : [];

  return {
    graph: canvasSemanticGraphSchema.parse({
      roomId: input.roomId,
      generatedAt: input.capturedAt,
      currentPageId: input.currentPageId,
      nodes,
      edges,
      regions,
    }),
    warnings,
  };
}

function createRecentEvents(input: {
  actorSessionId: DrawlessSessionId;
  roomId: DrawlessRoomId;
  capturedAt: string;
  recordsById: Map<string, TLRecord>;
  recentlyChangedRecordIds: string[];
}): DrawlessCanvasObservationEvent[] {
  return input.recentlyChangedRecordIds.slice(0, 20).map((recordId, index) => {
    const record = input.recordsById.get(recordId);

    return {
      roomId: input.roomId,
      eventId: `${input.capturedAt}:${recordId}:${index}`,
      occurredAt: input.capturedAt,
      actorSessionId: input.actorSessionId,
      kind: record && isShapeRecord(record) ? 'shape_updated' : 'unknown_change',
      recordIds: [recordId],
      summary: describeChangedRecord(recordId, record),
    };
  });
}

function describeCanvas(input: {
  shapes: ShapeDigest[];
  presences: TLInstancePresence[];
  selectedRecordIds: string[];
  recentlyChangedRecordIds: string[];
}) {
  const shapeTypeCounts = countBy(input.shapes, (shape) => shape.type);
  const typeSummary = Object.entries(shapeTypeCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, count]) => `${type} ${count} 个`)
    .join('，');
  const textPreview = input.shapes
    .map((shape) => shape.text)
    .filter((text): text is string => Boolean(text))
    .slice(0, TEXT_PREVIEW_LIMIT)
    .join('；');

  return [
    `画布包含 ${input.shapes.length} 个 shape${typeSummary ? `（${typeSummary}）` : ''}。`,
    input.presences.length > 0
      ? `当前可见 ${input.presences.length} 个协作者 presence。`
      : '当前没有可见协作者 presence。',
    input.selectedRecordIds.length > 0
      ? `当前选中 ${input.selectedRecordIds.length} 个对象。`
      : '当前没有显式选区。',
    input.recentlyChangedRecordIds.length > 0
      ? `最近变化 ${input.recentlyChangedRecordIds.length} 个对象。`
      : '当前没有记录到最近变化对象。',
    textPreview ? `文本预览：${textPreview}` : '当前没有可提取的文本内容。',
  ].join(' ');
}

function describeChangedRecord(recordId: string, record: TLRecord | undefined) {
  if (!record) {
    return `记录 ${recordId} 发生变化。`;
  }
  if (isShapeRecord(record)) {
    const text = extractShapeText(record);
    return text ? `用户更新了 ${record.type} shape：${text}` : `用户更新了 ${record.type} shape。`;
  }

  return `用户更新了 ${record.typeName} record。`;
}

function toShapeDigest(shape: TLShape): ShapeDigest {
  return {
    id: shape.id,
    type: shape.type,
    text: extractShapeText(shape),
    x: shape.x,
    y: shape.y,
    parentId: shape.parentId,
  };
}

function toSemanticNode(
  shape: TLShape,
  shapesById: Map<string, TLShape>
): DrawlessCanvasSemanticNode {
  return {
    id: shape.id,
    kind: getSemanticNodeKind(shape),
    shapeType: shape.type,
    text: extractShapeText(shape),
    bounds: getShapeBounds(shape),
    parentId: shape.parentId,
    pageId: inferShapePageId(shape, shapesById),
  };
}

function toSemanticEdge(
  shape: TLShape,
  binding: ArrowEndpointBinding | undefined
): DrawlessCanvasSemanticEdge {
  const props = shape.props as Record<string, unknown>;
  const fromId =
    binding?.fromId ?? getStringProp(props, 'fromId') ?? getBoundShapeIdProp(props.start) ?? null;
  const toId =
    binding?.toId ?? getStringProp(props, 'toId') ?? getBoundShapeIdProp(props.end) ?? null;

  return {
    id: shape.id,
    fromId,
    toId,
    label: extractShapeText(shape),
    direction: fromId && toId ? 'forward' : 'unknown',
    recordId: shape.id,
  };
}

function createSemanticRegions(
  shapes: TLShape[],
  nodes: DrawlessCanvasSemanticNode[]
): DrawlessCanvasSemanticRegion[] {
  const childIdsByParentId = new Map<string, string[]>();
  const includedNodeIds = new Set(nodes.map((node) => node.id));

  // 只使用 parentId 表达的明确层级关系，不根据空间包含猜测业务结构。
  for (const shape of shapes) {
    const childIds = childIdsByParentId.get(shape.parentId) ?? [];
    childIds.push(shape.id);
    childIdsByParentId.set(shape.parentId, childIds);
  }

  return nodes
    .filter((node) => node.kind === 'frame' || node.kind === 'group')
    .map((node) => ({
      id: node.id,
      kind: node.kind as DrawlessCanvasSemanticRegionKind,
      title: node.text,
      bounds: node.bounds,
      shapeIds: (childIdsByParentId.get(node.id) ?? []).filter((shapeId) =>
        includedNodeIds.has(shapeId)
      ),
    }));
}

function compareNodesForModel(
  left: DrawlessCanvasSemanticNode,
  right: DrawlessCanvasSemanticNode,
  priorityIds: Set<string>
) {
  return getNodePriority(right, priorityIds) - getNodePriority(left, priorityIds);
}

function getNodePriority(node: DrawlessCanvasSemanticNode, priorityIds: Set<string>) {
  if (priorityIds.has(node.id)) {
    return 100;
  }
  if (node.kind === 'frame' || node.kind === 'group') {
    return 60;
  }
  if (node.text) {
    return 40;
  }
  if (node.kind === 'arrow') {
    return 20;
  }

  return 0;
}

function shouldKeepEdge(
  edge: DrawlessCanvasSemanticEdge,
  includedNodeIds: Set<string>,
  priorityIds: Set<string>
) {
  if (priorityIds.has(edge.id)) {
    return true;
  }
  if (!edge.fromId && !edge.toId) {
    return includedNodeIds.has(edge.id);
  }

  return (
    includedNodeIds.has(edge.id) ||
    Boolean(edge.fromId && includedNodeIds.has(edge.fromId)) ||
    Boolean(edge.toId && includedNodeIds.has(edge.toId))
  );
}

function getNearbyShapeIds(input: {
  records: TLRecord[];
  currentPageId: string | null;
  cursor: { x: number; y: number } | null;
  focusedRecordIds: string[];
}) {
  const shapes = input.records.filter(isShapeRecord);
  const shapesById = new Map(shapes.map((shape) => [shape.id, shape]));

  if (input.cursor) {
    return shapes
      .filter((shape) => isShapeOnPage(shape, shapesById, input.currentPageId))
      .map((shape) => ({
        id: shape.id,
        distance: distanceToBoundsCenter(input.cursor!, getShapeBounds(shape)),
      }))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, NEARBY_LIMIT)
      .map((item) => item.id);
  }

  const focusedParents = new Set(
    input.focusedRecordIds
      .map((id) => shapesById.get(id as TLShape['id'])?.parentId)
      .filter(Boolean)
      .map(String)
  );

  return shapes
    .filter((shape) => focusedParents.has(String(shape.parentId)))
    .slice(0, NEARBY_LIMIT)
    .map((shape) => shape.id);
}

function getPresenceSelectedRecordIds(input: {
  records: TLRecord[];
  currentPageId: string | null;
  excludeSessionId: DrawlessSessionId;
}) {
  return uniqueNonEmptyStrings(
    input.records
      .filter(isPresenceRecord)
      .filter((presence) => presence.userId !== input.excludeSessionId)
      .filter((presence) => !input.currentPageId || presence.currentPageId === input.currentPageId)
      .flatMap((presence) => presence.selectedShapeIds)
  );
}

function getSemanticNodeKind(shape: TLShape): DrawlessCanvasSemanticNodeKind {
  if (shape.type === 'text') {
    return 'text';
  }
  if (shape.type === 'arrow') {
    return 'arrow';
  }
  if (shape.type === 'frame') {
    return 'frame';
  }
  if (shape.type === 'group') {
    return 'group';
  }
  if (shape.type === 'geo' || shape.type === 'note' || shape.type === 'draw') {
    return 'shape';
  }

  return 'unknown';
}

function getShapeBounds(shape: TLShape): DrawlessCanvasBounds {
  const props = shape.props as Record<string, unknown>;

  // Node 侧没有 Editor 几何工具，优先读 shape props 中稳定存在的尺寸字段。
  return {
    x: shape.x,
    y: shape.y,
    w: getNumericProp(props, 'w') ?? getNumericProp(props, 'width') ?? 0,
    h: getNumericProp(props, 'h') ?? getNumericProp(props, 'height') ?? 0,
  };
}

function inferShapePageId(shape: TLShape, shapesById: Map<string, TLShape>): string | null {
  let parentId: string | undefined = shape.parentId;
  while (parentId) {
    if (parentId.startsWith('page:')) {
      return parentId;
    }

    parentId = shapesById.get(parentId)?.parentId;
  }

  return null;
}

function isShapeOnPage(shape: TLShape, shapesById: Map<string, TLShape>, pageId: string | null) {
  return !pageId || inferShapePageId(shape, shapesById) === pageId;
}

function createArrowBindingsById(records: TLRecord[]) {
  const bindingsById = new Map<string, ArrowEndpointBinding>();
  for (const record of records) {
    if (!isBindingRecord(record)) {
      continue;
    }

    const binding = record as unknown as Record<string, unknown>;
    const arrowId = getStringProp(binding, 'fromId');
    const targetId = getStringProp(binding, 'toId');
    if (!arrowId || !targetId) {
      continue;
    }

    const props = getObjectProp(binding, 'props');
    const terminal = props ? getStringProp(props, 'terminal') : null;
    const current = bindingsById.get(arrowId) ?? { fromId: null, toId: null };
    if (terminal === 'start') {
      current.fromId = targetId;
    } else if (terminal === 'end') {
      current.toId = targetId;
    }

    bindingsById.set(arrowId, current);
  }

  return bindingsById;
}

function extractShapeText(shape: TLShape): string | null {
  const props = shape.props as Record<string, unknown>;
  const plainText =
    typeof props.text === 'string' ? props.text : extractRichText(props.richText);
  const normalized = plainText?.replace(/\s+/g, ' ').trim();

  return normalized ? normalized.slice(0, 220) : null;
}

function extractRichText(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (!value || typeof value !== 'object') {
    return null;
  }
  if ('text' in value && typeof value.text === 'string') {
    return value.text;
  }
  if ('content' in value && Array.isArray(value.content)) {
    return value.content
      .map(extractRichText)
      .filter((text): text is string => Boolean(text))
      .join(' ');
  }

  return null;
}

function distanceToBoundsCenter(point: { x: number; y: number }, bounds: DrawlessCanvasBounds) {
  const centerX = bounds.x + bounds.w / 2;
  const centerY = bounds.y + bounds.h / 2;
  return Math.hypot(point.x - centerX, point.y - centerY);
}

function getStringProp(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function getNumericProp(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getObjectProp(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function getBoundShapeIdProp(value: unknown) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return getStringProp(value as Record<string, unknown>, 'boundShapeId');
}

function inferCurrentPageId(records: TLRecord[]) {
  const activePresence = records.find(isPresenceRecord);
  if (activePresence) {
    return activePresence.currentPageId;
  }

  const page = records.find((record) => record.typeName === 'page');
  return page?.id ?? null;
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = getKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function uniqueNonEmptyStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isShapeRecord(record: TLRecord): record is TLShape {
  return record.typeName === 'shape';
}

function isPresenceRecord(record: TLRecord): record is TLInstancePresence {
  return record.typeName === 'instance_presence';
}

function isBindingRecord(record: TLRecord) {
  return record.typeName === 'binding';
}
