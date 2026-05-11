import { useState } from "react";
import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { isSortableOperation, useSortable } from "@dnd-kit/react/sortable";
import { Button } from "@formless/ui/button";
import { useRecordReadinessWarnings, useRecordsById } from "../../client/store.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import type {
  HomeContextConfig,
  HomeResultConfig,
  RecordFieldConfig,
  RecordVariantContextLinkPresentationConfig,
} from "../../client/views.ts";
import type { QueryEvaluationContext } from "../../shared/query.ts";
import type { FieldValue, StoredRecord } from "../../shared/protocol.ts";
import type { EntitySchema } from "../../shared/schema.ts";
import {
  ORDERING_DND_TYPE,
  calculateOrderingDragMovePlanForContext,
  parseOrderingDragData,
  selectOrderingDragFacts,
  selectOrderingMoveMenuItems,
  selectOrderedResultRecordIds,
  selectResultOrderingContext,
  submitOrderingPatch,
  type ResultOrderingContext,
  type ResultOrderingDragData,
  type ResultOrderingDragFact,
} from "./ordering-ui.ts";
import { RecordReadinessWarnings } from "./readiness-warnings.tsx";
import { RecordFieldEditor } from "./record-field-editor.tsx";
import { useSchemaKey } from "./schema-app-context.tsx";
import {
  selectRecordContextLinkForActiveUnion,
  selectRecordFieldsForActiveUnion,
} from "./union-presentation.ts";

type TreeResultConfig = Extract<HomeResultConfig, { type: "tree" }>;

export function RecordTree({
  entity,
  entityName,
  context,
  onSelectContext,
  queryContext,
  result,
  selectableContextRecordIds,
}: {
  entity?: EntitySchema;
  entityName?: string;
  context: HomeContextConfig | undefined;
  onSelectContext?: (recordId: string | null) => void;
  queryContext?: QueryEvaluationContext;
  result: TreeResultConfig;
  selectableContextRecordIds?: Set<string>;
}) {
  const recordsById = useRecordsById();
  const canPatch = entity?.mutations.patch.enabled ?? true;
  const placementEntityName = entityName ?? result.relationship.to.entity;
  const parentRecordId = context ? stringValue(queryContext?.values?.[context.name]) : undefined;

  if (!parentRecordId) {
    return null;
  }

  const placements = childPlacementsForParent(parentRecordId, recordsById, result);

  return (
    <section aria-label="Placement tree" className="space-y-3">
      {placements.length === 0 ? (
        <p className="text-sm text-slate-600">No records yet.</p>
      ) : (
        <PlacementSiblingList
          ancestors={new Set([parentRecordId])}
          canPatch={canPatch}
          className="space-y-3"
          context={context}
          depth={0}
          entityName={placementEntityName}
          onSelectContext={onSelectContext}
          placements={placements}
          result={result}
          selectableContextRecordIds={selectableContextRecordIds}
        />
      )}
    </section>
  );
}

function PlacementSiblingList({
  ancestors,
  canPatch,
  className,
  context,
  depth,
  onSelectContext,
  entityName,
  placements,
  result,
  selectableContextRecordIds,
}: {
  ancestors: Set<string>;
  canPatch: boolean;
  className: string;
  context: HomeContextConfig | undefined;
  depth: number;
  entityName: string;
  onSelectContext?: (recordId: string | null) => void;
  placements: StoredRecord[];
  result: TreeResultConfig;
  selectableContextRecordIds?: Set<string>;
}) {
  const schemaKey = useSchemaKey();
  const recordsById = useRecordsById();
  const [pendingDragRecordId, setPendingDragRecordId] = useState<string | null>(null);
  const recordIds = placements.map((placement) => placement.id);
  const orderingContext = selectResultOrderingContext({
    canPatch,
    entityName,
    ordering: result.ordering,
    recordIds,
    recordsById,
  });
  const orderedRecordIds = orderingContext?.orderedRecordIds ?? recordIds;
  const orderedPlacements = orderedRecordIds
    .map((recordId) => recordsById[recordId])
    .filter((record): record is StoredRecord => record?.entity === entityName);
  const orderingDragFacts = selectOrderingDragFacts(orderingContext);

  async function handleOrderingDragEnd(event: DragEndEvent) {
    if (!orderingContext || event.canceled || !isSortableOperation(event.operation)) {
      return;
    }

    const { source } = event.operation;

    if (!source) {
      return;
    }

    const dragData = parseOrderingDragData(source.data);

    if (!dragData) {
      return;
    }

    if (source.sortable.initialGroup !== source.sortable.group) {
      setSyncStatus({ state: "idle", message: "Cross-scope placement move ignored." });
      return;
    }

    const plan = calculateOrderingDragMovePlanForContext({
      orderingContext,
      recordId: dragData.recordId,
      targetIndex: source.sortable.index,
    });

    if (plan.kind !== "patch") {
      if (plan.kind === "rebalance") {
        setSyncStatus({
          state: "error",
          message: "Rebalance required before drag reorder.",
        });
      }
      return;
    }

    const suspendedDrop = event.suspend();
    setPendingDragRecordId(dragData.recordId);
    setSyncStatus({ state: "syncing", message: "Moving placement..." });

    try {
      await submitOrderingPatch(schemaKey, orderingContext, plan);
      setSyncStatus({ state: "idle", message: "Placement moved and synced." });
    } catch (error) {
      setSyncStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Drag reorder failed.",
      });
    } finally {
      setPendingDragRecordId(null);
      suspendedDrop.resume();
    }
  }

  const list = (
    <ol className={className}>
      {orderedPlacements.map((placement, index) =>
        orderingContext && orderingDragFacts ? (
          <SortablePlacementTreeItem
            ancestors={ancestors}
            canPatch={canPatch}
            context={context}
            depth={depth}
            dragFact={orderingDragFacts.get(placement.id)}
            entityName={entityName}
            index={index}
            key={placement.id}
            onSelectContext={onSelectContext}
            orderingContext={orderingContext}
            pendingDragRecordId={pendingDragRecordId}
            placement={placement}
            result={result}
            selectableContextRecordIds={selectableContextRecordIds}
            siblingCount={orderedPlacements.length}
          />
        ) : (
          <PlacementTreeItem
            ancestors={ancestors}
            canPatch={canPatch}
            context={context}
            depth={depth}
            entityName={entityName}
            index={index}
            key={placement.id}
            onSelectContext={onSelectContext}
            orderingContext={orderingContext}
            placement={placement}
            result={result}
            selectableContextRecordIds={selectableContextRecordIds}
            siblingCount={orderedPlacements.length}
          />
        ),
      )}
    </ol>
  );

  return orderingContext && orderingDragFacts ? (
    <DragDropProvider onDragEnd={handleOrderingDragEnd}>{list}</DragDropProvider>
  ) : (
    list
  );
}

function SortablePlacementTreeItem({
  ancestors,
  canPatch,
  context,
  depth,
  dragFact,
  entityName,
  index,
  onSelectContext,
  orderingContext,
  pendingDragRecordId,
  placement,
  result,
  selectableContextRecordIds,
  siblingCount,
}: {
  ancestors: Set<string>;
  canPatch: boolean;
  context: HomeContextConfig | undefined;
  depth: number;
  dragFact: ResultOrderingDragFact | undefined;
  entityName: string;
  index: number;
  onSelectContext?: (recordId: string | null) => void;
  orderingContext: ResultOrderingContext;
  pendingDragRecordId: string | null;
  placement: StoredRecord;
  result: TreeResultConfig;
  selectableContextRecordIds?: Set<string>;
  siblingCount: number;
}) {
  const disabled = !dragFact || !orderingContext.canPatch || pendingDragRecordId !== null;
  const { handleRef, isDragSource, isDropTarget, ref } = useSortable<ResultOrderingDragData>({
    id: `tree-ordering:${placement.id}`,
    data: {
      type: ORDERING_DND_TYPE,
      recordId: placement.id,
      scopeKey: dragFact?.scopeKey ?? "",
    },
    group: dragFact?.scopeKey,
    index: dragFact?.index ?? 0,
    type: ORDERING_DND_TYPE,
    accept: (source) => {
      const sourceData = parseOrderingDragData(source.data);

      return sourceData?.scopeKey === dragFact?.scopeKey;
    },
    disabled,
    transition: { idle: true },
  });
  const itemStateClass = [isDragSource ? "opacity-60" : "", isDropTarget ? "bg-muted/40" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <PlacementTreeItem
      ancestors={ancestors}
      canPatch={canPatch}
      context={context}
      depth={depth}
      entityName={entityName}
      index={index}
      itemClassName={itemStateClass || undefined}
      itemRef={ref}
      onSelectContext={onSelectContext}
      orderingContext={orderingContext}
      orderingHandleDisabled={disabled}
      orderingHandleRef={handleRef}
      placement={placement}
      result={result}
      selectableContextRecordIds={selectableContextRecordIds}
      siblingCount={siblingCount}
    />
  );
}

function PlacementTreeItem({
  ancestors,
  canPatch,
  context,
  depth,
  entityName,
  index,
  itemClassName,
  itemRef,
  onSelectContext,
  orderingContext,
  orderingHandleDisabled,
  orderingHandleRef,
  placement,
  result,
  selectableContextRecordIds,
  siblingCount,
}: {
  ancestors: Set<string>;
  canPatch: boolean;
  context: HomeContextConfig | undefined;
  depth: number;
  entityName: string;
  index: number;
  itemClassName?: string;
  itemRef?: (element: Element | null) => void;
  onSelectContext?: (recordId: string | null) => void;
  orderingContext?: ResultOrderingContext;
  orderingHandleDisabled?: boolean;
  orderingHandleRef?: (element: Element | null) => void;
  placement: StoredRecord;
  result: TreeResultConfig;
  selectableContextRecordIds?: Set<string>;
  siblingCount: number;
}) {
  const recordsById = useRecordsById();
  const childRecordId = stringValue(placement.values[result.childFieldName]);
  const childRecord = childRecordId ? recordsById[childRecordId] : undefined;
  const isLeafBranch = childRecord ? isTreeBranchLeaf(result, childRecord) : false;
  const isCycle = !isLeafBranch && childRecordId ? ancestors.has(childRecordId) : false;
  const descendantPlacements =
    childRecord && !isLeafBranch && !isCycle
      ? childPlacementsForParent(childRecord.id, recordsById, result)
      : [];
  const childPlacements = depth < result.maxDepth ? descendantPlacements : [];
  const nextAncestors = childRecord ? new Set([...ancestors, childRecord.id]) : ancestors;

  return (
    <li
      className={["space-y-3", itemClassName].filter(Boolean).join(" ")}
      data-formless-sortable-tree-placement={placement.id}
      ref={itemRef}
    >
      <div className="rounded border border-slate-200 bg-white">
        <div className="grid min-w-0 gap-3 p-3">
          <div className="flex min-w-0 items-start gap-2">
            <PlacementOrderingControls
              index={index}
              orderingContext={orderingContext}
              orderingHandleDisabled={orderingHandleDisabled}
              orderingHandleRef={orderingHandleRef}
              placement={placement}
              siblingCount={siblingCount}
            />
            <div className="min-w-0 flex-1 space-y-3">
              <PlacementRecordFields canPatch={canPatch} placement={placement} result={result} />
              {childRecord ? (
                <ChildRecordEditor
                  childRecord={childRecord}
                  context={context}
                  onSelectContext={onSelectContext}
                  result={result}
                  selectableContextRecordIds={selectableContextRecordIds}
                />
              ) : (
                <p className="text-sm text-amber-700">Missing child block.</p>
              )}
              {isCycle ? <p className="text-sm text-amber-700">Cycle skipped.</p> : null}
              {depth >= result.maxDepth && descendantPlacements.length > 0 ? (
                <p className="text-sm text-amber-700">Maximum tree depth reached.</p>
              ) : null}
              <TreeReadinessWarnings recordId={placement.id} />
              {childRecord ? <TreeReadinessWarnings recordId={childRecord.id} /> : null}
            </div>
          </div>
        </div>
      </div>
      {childPlacements.length > 0 ? (
        <PlacementSiblingList
          ancestors={nextAncestors}
          canPatch={canPatch}
          className="ml-5 space-y-3 border-l border-slate-200 pl-4"
          context={context}
          depth={depth + 1}
          entityName={entityName}
          onSelectContext={onSelectContext}
          placements={childPlacements}
          result={result}
          selectableContextRecordIds={selectableContextRecordIds}
        />
      ) : null}
    </li>
  );
}

function PlacementOrderingControls({
  index,
  orderingContext,
  orderingHandleDisabled,
  orderingHandleRef,
  placement,
  siblingCount,
}: {
  index: number;
  orderingContext: ResultOrderingContext | undefined;
  orderingHandleDisabled?: boolean;
  orderingHandleRef?: (element: Element | null) => void;
  placement: StoredRecord;
  siblingCount: number;
}) {
  const schemaKey = useSchemaKey();
  const showDragHandle = orderingContext?.ordering.presentations.includes("dragHandle") === true;
  const moveItems = selectOrderingMoveMenuItems({
    includeOrdering: orderingContext?.ordering.presentations.includes("moveMenu") === true,
    orderingContext,
    sourceRecordId: placement.id,
  }).filter((item) => item.direction === "up" || item.direction === "down");

  if ((!showDragHandle && moveItems.length === 0) || siblingCount <= 1) {
    return <div className="w-7 shrink-0" />;
  }

  async function runMove(item: (typeof moveItems)[number]) {
    if (!orderingContext || item.plan.kind !== "patch") {
      setSyncStatus({
        state: item.plan.kind === "rebalance" ? "error" : "idle",
        message:
          item.plan.kind === "rebalance"
            ? "Rebalance required before moving placement."
            : "Placement already in position.",
      });
      return;
    }

    setSyncStatus({ state: "syncing", message: "Moving placement..." });

    try {
      await submitOrderingPatch(schemaKey, orderingContext, item.plan);
      setSyncStatus({ state: "idle", message: "Placement moved and synced." });
    } catch (error) {
      setSyncStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Move failed.",
      });
    }
  }

  return (
    <div className="flex w-7 shrink-0 flex-col gap-1 pt-0.5">
      {showDragHandle ? (
        <Button
          aria-label="Drag placement"
          data-formless-ordering-handle="true"
          disabled={orderingHandleDisabled ?? true}
          ref={orderingHandleRef}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <span aria-hidden="true">::</span>
        </Button>
      ) : null}
      {moveItems.map((item) => (
        <Button
          aria-label={item.direction === "up" ? "Move placement up" : "Move placement down"}
          disabled={
            item.disabled || (item.direction === "up" ? index === 0 : index >= siblingCount - 1)
          }
          key={item.direction}
          onClick={() => void runMove(item)}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <span aria-hidden="true">{item.direction === "up" ? "↑" : "↓"}</span>
        </Button>
      ))}
    </div>
  );
}

function PlacementRecordFields({
  canPatch,
  placement,
  result,
}: {
  canPatch: boolean;
  placement: StoredRecord;
  result: TreeResultConfig;
}) {
  const recordFields = selectRecordFieldsForActiveUnion(
    result.placementRecordFields ?? [],
    result.placementRecordUnion,
    placement,
  );

  if (recordFields.length === 0) {
    return null;
  }

  return (
    <div className="grid min-w-0 gap-2">
      {recordFields.map((fieldConfig) => (
        <RecordFieldEditor
          canPatch={canPatch}
          density="compact"
          entityName={result.relationship.to.entity}
          fieldConfig={fieldConfig}
          key={fieldConfig.fieldName}
          recordId={placement.id}
        />
      ))}
    </div>
  );
}

function ChildRecordEditor({
  childRecord,
  context,
  onSelectContext,
  result,
  selectableContextRecordIds,
}: {
  childRecord: StoredRecord;
  context: HomeContextConfig | undefined;
  onSelectContext?: (recordId: string | null) => void;
  result: TreeResultConfig;
  selectableContextRecordIds?: Set<string>;
}) {
  const contextLink = selectRecordContextLinkForActiveUnion(result.childRecordUnion, childRecord);

  if (contextLink) {
    return (
      <ChildRecordContextLink
        childRecord={childRecord}
        context={context}
        contextLink={contextLink}
        onSelectContext={onSelectContext}
        result={result}
        selectableContextRecordIds={selectableContextRecordIds}
      />
    );
  }

  const recordFields = selectRecordFieldsForActiveUnion(
    result.childRecordFields,
    result.childRecordUnion,
    childRecord,
  );
  const renderAsInlineStack = isInlineLinkFieldStack(recordFields);

  return (
    <div className="grid min-w-0 gap-3">
      {recordFields.map((fieldConfig) => {
        const isHeading = !renderAsInlineStack && isHeadingRecordField(fieldConfig);

        return (
          <RecordFieldEditor
            canPatch={result.childEntity.mutations.patch.enabled}
            density={
              renderAsInlineStack || (!isHeading && !isRichMarkdownRecordField(fieldConfig))
                ? "compact"
                : "default"
            }
            entityName={result.childEntityName}
            fieldConfig={fieldConfig}
            key={fieldConfig.fieldName}
            presentation={isHeading ? "heading" : "default"}
            recordId={childRecord.id}
            showLabel={!renderAsInlineStack && !isHeading}
          />
        );
      })}
    </div>
  );
}

function ChildRecordContextLink({
  childRecord,
  context,
  contextLink,
  onSelectContext,
  result,
  selectableContextRecordIds,
}: {
  childRecord: StoredRecord;
  context: HomeContextConfig | undefined;
  contextLink: RecordVariantContextLinkPresentationConfig;
  onSelectContext?: (recordId: string | null) => void;
  result: TreeResultConfig;
  selectableContextRecordIds?: Set<string>;
}) {
  const label = stringValue(childRecord.values[contextLink.labelFieldName]) ?? childRecord.id;
  const canSelect =
    context !== undefined &&
    context.name === contextLink.target.contextName &&
    context.entityName === result.childEntityName &&
    selectableContextRecordIds?.has(childRecord.id) === true &&
    onSelectContext !== undefined;

  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="min-w-0 truncate text-sm font-medium text-slate-900">{label}</span>
      <Button
        aria-label={`Select ${label}`}
        disabled={!canSelect}
        onClick={() => onSelectContext?.(childRecord.id)}
        size="xs"
        type="button"
        variant="outline"
      >
        Open
      </Button>
    </div>
  );
}

function TreeReadinessWarnings({ recordId }: { recordId: string }) {
  const warnings = useRecordReadinessWarnings(recordId);

  return warnings.length === 0 ? null : <RecordReadinessWarnings warnings={warnings} />;
}

function childPlacementsForParent(
  parentRecordId: string,
  recordsById: Record<string, StoredRecord>,
  result: TreeResultConfig,
): StoredRecord[] {
  const placements = Object.values(recordsById)
    .filter(
      (record) =>
        record.entity === result.relationship.to.entity &&
        !record.deletedAt &&
        record.values[result.relationship.to.field] === parentRecordId,
    )
    .sort(compareStablePlacementRecords);
  const orderedRecordIds = selectOrderedResultRecordIds(
    placements.map((placement) => placement.id),
    recordsById,
    result.ordering,
  );

  return orderedRecordIds
    .map((recordId) => recordsById[recordId])
    .filter((record): record is StoredRecord => record?.entity === result.relationship.to.entity);
}

function isTreeBranchLeaf(result: TreeResultConfig, childRecord: StoredRecord): boolean {
  const variantPolicy = result.branches?.variants;

  if (!variantPolicy) {
    return false;
  }

  const variantValue = stringValue(childRecord.values[variantPolicy.discriminatorFieldName]);

  return variantValue !== undefined && variantPolicy.leafVariantValues.includes(variantValue);
}

function isHeadingRecordField(fieldConfig: RecordFieldConfig) {
  return (
    fieldConfig.field.type === "text" &&
    fieldConfig.editor === "text" &&
    (fieldConfig.fieldName === "label" ||
      fieldConfig.fieldName === "title" ||
      fieldConfig.fieldName === "name")
  );
}

function isInlineLinkFieldStack(recordFields: RecordFieldConfig[]) {
  if (recordFields.length !== 2) {
    return false;
  }

  const fieldNames = new Set(recordFields.map((fieldConfig) => fieldConfig.fieldName));

  return (
    fieldNames.has("label") &&
    fieldNames.has("href") &&
    recordFields.every(
      (fieldConfig) =>
        fieldConfig.field.type === "text" &&
        (fieldConfig.editor === "text" || fieldConfig.editor === "href"),
    )
  );
}

function isRichMarkdownRecordField(fieldConfig: RecordFieldConfig) {
  return fieldConfig.field.type === "text" && fieldConfig.editor === "markdown";
}

function stringValue(value: FieldValue | undefined): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function compareStablePlacementRecords(a: StoredRecord, b: StoredRecord): number {
  return compareStrings(a.createdAt, b.createdAt) || compareStrings(a.id, b.id);
}

function compareStrings(a: string, b: string): number {
  if (a < b) {
    return -1;
  }

  if (a > b) {
    return 1;
  }

  return 0;
}
