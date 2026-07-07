import { useMemo, useState } from "react";
import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { isSortableOperation, useSortable } from "@dnd-kit/react/sortable";
import { Button, buttonStyles } from "@dpeek/formless-ui/button";
import { AddIcon, MenuIcon, RemoveIcon } from "@dpeek/formless-ui/icons";
import {
  ModalBody,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@dpeek/formless-ui/modal";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@dpeek/formless-ui/menu";
import { useRecordReadinessWarnings, useRecordsById } from "../../client/store.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import type {
  CreateDefaultConfig,
  CreateFieldConfig,
  GeneratedOperationCallerInput,
  GeneratedOperationControlBinding,
  GeneratedOperationController,
  GeneratedOperationExecutionResult,
  HomeContextConfig,
  RecordFieldConfig,
  RecordVariantContextLinkPresentationConfig,
} from "../../client/views.ts";
import {
  projectOrderingMoveOperationControlBinding,
  projectTreeCompositionOperationControlBindings,
} from "../../client/views.ts";
import type {
  TreeAllowedChildVariantConfig,
  TreeResultModel,
} from "../../client/tree-result-model.ts";
import type { QueryEvaluationContext } from "@dpeek/formless-schema";
import type { FieldValue, RecordValues, StoredRecord } from "@dpeek/formless-storage";
import type { EntitySchema } from "@dpeek/formless-schema";
import type { OperationCommandOutput } from "../../shared/operation-invocation.ts";
import { GeneratedCreateDialogForm, type CreateHomeOperationConfig } from "./create.tsx";
import {
  ORDERING_DND_TYPE,
  calculateOrderingDragMovePlanForContext,
  parseOrderingDragData,
  selectOrderingDragFacts,
  selectOrderingMoveMenuItems,
  selectOrderedResultRecordIds,
  selectResultOrderingContext,
  type ResultOrderingContext,
  type ResultOrderingDragData,
  type ResultOrderingDragFact,
} from "./ordering-ui.ts";
import { RecordReadinessWarnings } from "./readiness-warnings.tsx";
import { RecordFieldEditor } from "./record-field-editor.tsx";
import {
  selectRecordContextLinkForActiveUnion,
  selectRecordFieldsForActiveUnion,
} from "./union-presentation.ts";
import {
  executeGeneratedOperationControl,
  executeGeneratedOrderingMoveOperation,
  selectGeneratedOperationControlTriggerDecision,
  useGeneratedOperationController,
  useGeneratedOperationControllerVersion,
} from "./operation-control-runtime.ts";

type TreeResultConfig = TreeResultModel;

export function RecordTree({
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
  const placementEntityName = entityName ?? result.relationship.to.entity;
  const parentRecordId = context ? stringValue(queryContext?.values?.[context.name]) : undefined;

  if (!parentRecordId) {
    return null;
  }

  const parentRecord = recordsById[parentRecordId];
  const placements = childPlacementsForParent(parentRecordId, recordsById, result);
  const rootAddControls = parentRecord ? (
    <TreeChildAddControls parentRecord={parentRecord} result={result} />
  ) : null;

  return (
    <section aria-label="Placement tree" className="space-y-3">
      {placements.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">No records yet.</p>
          {rootAddControls}
        </div>
      ) : (
        <>
          <PlacementSiblingList
            ancestors={new Set([parentRecordId])}
            className="space-y-3"
            context={context}
            depth={0}
            entityName={placementEntityName}
            onSelectContext={onSelectContext}
            placements={placements}
            result={result}
            selectableContextRecordIds={selectableContextRecordIds}
          />
          {rootAddControls}
        </>
      )}
    </section>
  );
}

function PlacementSiblingList({
  ancestors,
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
  className: string;
  context: HomeContextConfig | undefined;
  depth: number;
  entityName: string;
  onSelectContext?: (recordId: string | null) => void;
  placements: StoredRecord[];
  result: TreeResultConfig;
  selectableContextRecordIds?: Set<string>;
}) {
  const recordsById = useRecordsById();
  const [pendingDragRecordId, setPendingDragRecordId] = useState<string | null>(null);
  const recordIds = placements.map((placement) => placement.id);
  const orderingContext = selectResultOrderingContext({
    entityName,
    ordering: result.ordering,
    recordIds,
    recordsById,
    updateOperation: result.placementUpdateOperation,
  });
  const orderedRecordIds = orderingContext?.orderedRecordIds ?? recordIds;
  const orderedPlacements = orderedRecordIds
    .map((recordId) => recordsById[recordId])
    .filter((record): record is StoredRecord => record?.entity === entityName);
  const orderingDragFacts = selectOrderingDragFacts(orderingContext);
  const orderingDragBinding = useMemo(
    () =>
      orderingContext?.updateOperation === undefined
        ? undefined
        : projectOrderingMoveOperationControlBinding({
            direction: "drag",
            label: "Move placement",
            ordering: orderingContext.ordering,
            updateOperation: orderingContext.updateOperation,
          }),
    [orderingContext],
  );
  const orderingBindings = useMemo(
    () => (orderingDragBinding === undefined ? [] : [orderingDragBinding]),
    [orderingDragBinding],
  );
  const orderingController = useGeneratedOperationController(orderingBindings);
  useGeneratedOperationControllerVersion(orderingController);

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

    if (orderingDragBinding === undefined) {
      return;
    }

    const suspendedDrop = event.suspend();
    setPendingDragRecordId(dragData.recordId);

    try {
      await executeGeneratedOrderingMoveOperation({
        binding: orderingDragBinding,
        controller: orderingController,
        failedMessage: "Drag reorder failed.",
        orderingContext,
        plan,
        source: "button",
        successMessage: "Placement moved and synced.",
        syncingMessage: "Moving placement...",
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
  const disabled = !dragFact || !orderingContext.updateOperation || pendingDragRecordId !== null;
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
  const childAddControls =
    childRecord && !isLeafBranch && !isCycle && depth < result.maxDepth ? (
      <TreeChildAddControls
        className="ml-5 border-l border-slate-200 pl-4"
        parentRecord={childRecord}
        result={result}
      />
    ) : null;

  return (
    <li
      className={["space-y-3", itemClassName].filter(Boolean).join(" ")}
      data-formless-sortable-tree-placement={placement.id}
      ref={itemRef}
    >
      <div className="relative rounded border border-slate-200 bg-white">
        <TreePlacementActions placement={placement} result={result} />
        <div className="grid min-w-0 gap-3 p-3 pr-8">
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
              <TreePlacementSlotBadge placement={placement} />
              <PlacementRecordFields placement={placement} result={result} />
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
      {childAddControls}
    </li>
  );
}

function TreeChildAddControls({
  className,
  parentRecord,
  result,
}: {
  className?: string;
  parentRecord: StoredRecord;
  result: TreeResultConfig;
}) {
  const [activeVariant, setActiveVariant] = useState<TreeAllowedChildVariantConfig | null>(null);
  const allowedChildVariants = selectAllowedTreeChildVariants(result, parentRecord);
  const createOperation = activeVariant
    ? createTreeChildCreateOperation(result, activeVariant)
    : undefined;
  const createBinding = useMemo(
    () =>
      activeVariant === null
        ? undefined
        : selectTreeCompositionOperationBinding(
            result,
            "create",
            `${parentRecord.id}:${activeVariant.variantValue}`,
          ),
    [activeVariant, parentRecord.id, result],
  );
  const createBindings = useMemo(
    () => (createBinding === undefined ? [] : [createBinding]),
    [createBinding],
  );
  const createController = useGeneratedOperationController(createBindings);
  useGeneratedOperationControllerVersion(createController);

  if (allowedChildVariants.length === 0) {
    return null;
  }

  return (
    <div
      className={["flex", className].filter(Boolean).join(" ")}
      data-formless-tree-add-parent={parentRecord.id}
      data-formless-tree-add-operation={result.composition?.create?.operation.canonicalKey}
      data-formless-tree-add-labels={allowedChildVariants.map((variant) => variant.label).join("|")}
      data-formless-tree-add-slots={allowedChildVariants
        .map((variant) => stringValue(variant.placementValues?.slot) ?? "default")
        .join(" ")}
      data-formless-tree-add-variants={allowedChildVariants
        .map((variant) => variant.variantValue)
        .join(" ")}
      data-formless-tree-add-variant-operations={allowedChildVariants
        .map(() => result.composition?.create?.operation.canonicalKey ?? "")
        .join(" ")}
    >
      <Menu>
        <MenuTrigger
          aria-label="Add child"
          className={buttonStyles({ intent: "outline", size: "sq-xs" })}
          data-formless-tree-add-trigger={parentRecord.id}
          isDisabled={!result.composition?.create}
          type="button"
        >
          <AddIcon aria-hidden="true" />
        </MenuTrigger>
        <MenuContent className="w-auto min-w-36">
          {allowedChildVariants.map((variant) => (
            <MenuItem
              aria-label={`Add ${variant.label} child`}
              data-formless-tree-add-variant={variant.variantValue}
              data-formless-tree-add-variant-operation={
                result.composition?.create?.operation.canonicalKey
              }
              data-formless-tree-add-slot={stringValue(variant.placementValues?.slot) ?? undefined}
              isDisabled={!result.composition?.create}
              key={variant.variantValue}
              onAction={() => {
                if (result.composition?.create) {
                  setActiveVariant(variant);
                }
              }}
            >
              <MenuLabel>{variant.label}</MenuLabel>
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
      {activeVariant && createOperation ? (
        <ModalContent
          isOpen={true}
          onOpenChange={(open) => {
            if (!open) {
              setActiveVariant(null);
            }
          }}
        >
          <ModalHeader>
            <ModalTitle>{createOperation.label}</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <GeneratedCreateDialogForm
              operation={createOperation}
              onSuccess={() => setActiveVariant(null)}
              submitValues={(values) =>
                executeTreeChildCreateOperation(
                  createBinding,
                  createController,
                  result,
                  parentRecord,
                  values,
                  activeVariant.placementValues,
                )
              }
            />
          </ModalBody>
        </ModalContent>
      ) : null}
    </div>
  );
}

function TreePlacementSlotBadge({ placement }: { placement: StoredRecord }) {
  const slot = stringValue(placement.values.slot);

  if (!slot) {
    return null;
  }

  return (
    <div className="flex">
      <span
        className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600"
        data-formless-tree-placement-slot={slot}
      >
        {slot}
      </span>
    </div>
  );
}

function TreePlacementActions({
  placement,
  result,
}: {
  placement: StoredRecord;
  result: TreeResultConfig;
}) {
  if (!result.composition?.remove) {
    return null;
  }

  return (
    <div className="absolute right-2 top-2">
      <TreePlacementRemoveButton placement={placement} result={result} />
    </div>
  );
}

function TreePlacementRemoveButton({
  placement,
  result,
}: {
  placement: StoredRecord;
  result: TreeResultConfig;
}) {
  const removeOperation = result.composition?.remove;
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const removeBinding = useMemo(
    () => selectTreeCompositionOperationBinding(result, "remove", placement.id),
    [placement.id, result],
  );
  const removeBindings = useMemo(
    () => (removeBinding === undefined ? [] : [removeBinding]),
    [removeBinding],
  );
  const removeController = useGeneratedOperationController(removeBindings);
  useGeneratedOperationControllerVersion(removeController);
  const isRemoving =
    removeBinding === undefined ? false : removeController.isPending(removeBinding.id);

  if (!removeOperation) {
    return null;
  }

  async function removePlacement(source: GeneratedOperationCallerInput["source"]) {
    if (isRemoving || removeBinding === undefined) {
      return;
    }

    const operationResult = await executeGeneratedOperationControl({
      binding: removeBinding,
      callerInput: {
        bindingId: removeBinding.id,
        recordId: placement.id,
        source,
      },
      controller: removeController,
      feedback: {
        committedMessage: "Placement removed and synced.",
        failedMessage: "Remove failed.",
        progressMessage: "Removing placement...",
        replayedMessage: "Placement removed and synced.",
      },
    });

    if (operationResult.type !== "failed") {
      setConfirmationOpen(false);
    }
  }

  function requestRemovePlacement() {
    const decision = selectGeneratedOperationControlTriggerDecision({
      binding: removeBinding,
      pending: isRemoving,
    });

    if (decision.type === "confirm") {
      setConfirmationOpen(true);
      return;
    }

    if (decision.type === "execute") {
      void removePlacement("button");
    }
  }

  return (
    <>
      <Button
        aria-label="Remove child placement"
        data-formless-tree-remove-operation={removeOperation.operation.canonicalKey}
        data-formless-tree-remove-placement={placement.id}
        isDisabled={removeBinding === undefined || isRemoving}
        isPending={isRemoving}
        onPress={requestRemovePlacement}
        size="sq-xs"
        type="button"
        intent="plain"
      >
        <RemoveIcon />
      </Button>
      {removeBinding?.confirmation ? (
        <ModalContent
          closeButton={false}
          isOpen={confirmationOpen}
          onOpenChange={(open) => {
            if (!isRemoving) {
              setConfirmationOpen(open);
            }
          }}
          role="alertdialog"
        >
          <ModalHeader>
            <ModalTitle>{removeBinding.confirmation.title}</ModalTitle>
            <ModalDescription>{removeBinding.confirmation.description}</ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <ModalClose intent="outline" isDisabled={isRemoving} type="button">
              Cancel
            </ModalClose>
            <Button
              isDisabled={isRemoving}
              onPress={() => void removePlacement("confirmationDialog")}
              type="button"
              intent="danger"
            >
              {isRemoving ? "Removing..." : removeBinding.confirmation.actionLabel}
            </Button>
          </ModalFooter>
        </ModalContent>
      ) : null}
    </>
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
  const showDragHandle = orderingContext?.ordering.presentations.includes("dragHandle") === true;
  const moveItems = selectOrderingMoveMenuItems({
    includeOrdering: orderingContext?.ordering.presentations.includes("moveMenu") === true,
    orderingContext,
    sourceRecordId: placement.id,
  }).filter((item) => item.direction === "up" || item.direction === "down");
  const moveBindings = useMemo(
    () =>
      moveItems.map((item) => ({
        binding:
          orderingContext === undefined
            ? undefined
            : projectOrderingMoveOperationControlBinding(
                {
                  direction: item.direction,
                  label: item.label,
                  ordering: orderingContext.ordering,
                  updateOperation: orderingContext.updateOperation,
                  disabledReason: item.disabledReason,
                },
                {
                  executionTargetKey: placement.id,
                  idPrefix: `tree-ordering:${placement.id}`,
                },
              ),
        item,
      })),
    [moveItems, orderingContext, placement.id],
  );
  const orderingBindings = useMemo(
    () =>
      moveBindings
        .map(({ binding }) => binding)
        .filter((binding): binding is GeneratedOperationControlBinding => binding !== undefined),
    [moveBindings],
  );
  const orderingController = useGeneratedOperationController(orderingBindings);
  useGeneratedOperationControllerVersion(orderingController);
  const isMoving = orderingBindings.some((binding) => orderingController.isPending(binding.id));

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

    const binding = moveBindings.find((candidate) => candidate.item === item)?.binding;

    if (binding === undefined || isMoving) {
      return;
    }

    await executeGeneratedOrderingMoveOperation({
      binding,
      controller: orderingController,
      failedMessage: "Move failed.",
      orderingContext,
      plan: item.plan,
      source: "button",
      successMessage: "Placement moved and synced.",
      syncingMessage: "Moving placement...",
    });
  }

  function moveBindingForItem(item: (typeof moveItems)[number]) {
    return moveBindings.find((candidate) => candidate.item === item)?.binding;
  }

  function moveIsPending(item: (typeof moveItems)[number]) {
    const binding = moveBindingForItem(item);

    return binding === undefined ? false : orderingController.isPending(binding.id);
  }

  return (
    <div className="flex w-7 shrink-0 flex-col gap-1 pt-0.5">
      {showDragHandle ? (
        <Button
          aria-label="Drag placement"
          data-formless-ordering-handle="true"
          isDisabled={orderingHandleDisabled ?? true}
          ref={orderingHandleRef}
          size="sq-xs"
          type="button"
          intent="plain"
        >
          <MenuIcon aria-hidden="true" />
        </Button>
      ) : null}
      {moveItems.map((item) => (
        <Button
          aria-label={item.direction === "up" ? "Move placement up" : "Move placement down"}
          key={item.direction}
          isDisabled={
            item.disabled ||
            isMoving ||
            (item.direction === "up" ? index === 0 : index >= siblingCount - 1)
          }
          onPress={() => void runMove(item)}
          size="sq-xs"
          type="button"
          intent="plain"
        >
          <span aria-hidden="true">
            {moveIsPending(item) ? "..." : item.direction === "up" ? "↑" : "↓"}
          </span>
        </Button>
      ))}
    </div>
  );
}

function PlacementRecordFields({
  placement,
  result,
}: {
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
    <div className="group/record-row grid min-w-0 gap-2">
      {recordFields.map((fieldConfig) => (
        <RecordFieldEditor
          density="compact"
          entityName={result.relationship.to.entity}
          fieldConfig={fieldConfig}
          key={recordFieldEditorKey(
            result.relationship.to.entity,
            placement.id,
            fieldConfig.fieldName,
          )}
          recordId={placement.id}
          updateOperation={result.placementUpdateOperation}
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
    <div className="group/record-row grid min-w-0 gap-3">
      {recordFields.map((fieldConfig) => {
        const isHeading = !renderAsInlineStack && isHeadingRecordField(fieldConfig);

        return (
          <RecordFieldEditor
            density={
              renderAsInlineStack || (!isHeading && !isRichMarkdownRecordField(fieldConfig))
                ? "compact"
                : "default"
            }
            entityName={result.childEntityName}
            fieldConfig={fieldConfig}
            key={recordFieldEditorKey(
              result.childEntityName,
              childRecord.id,
              fieldConfig.fieldName,
            )}
            presentation={isHeading ? "heading" : "default"}
            recordId={childRecord.id}
            showLabel={!renderAsInlineStack && !isHeading}
            updateOperation={result.childUpdateOperation}
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
        isDisabled={!canSelect}
        onPress={() => onSelectContext?.(childRecord.id)}
        size="xs"
        type="button"
        intent="outline"
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

function selectAllowedTreeChildVariants(
  result: TreeResultConfig,
  parentRecord: StoredRecord,
): TreeAllowedChildVariantConfig[] {
  const variantPolicy = result.branches?.variants;

  if (!variantPolicy) {
    return [];
  }

  const variantValue = stringValue(parentRecord.values[variantPolicy.discriminatorFieldName]);

  if (variantValue === undefined) {
    return [];
  }

  return variantPolicy.allowedChildVariantsByParentVariant[variantValue] ?? [];
}

function createTreeChildCreateOperation(
  result: TreeResultConfig,
  variant: TreeAllowedChildVariantConfig,
): CreateHomeOperationConfig | undefined {
  const createOperation = result.composition?.create;
  const discriminatorFieldName = result.branches?.variants.discriminatorFieldName;
  const discriminatorField = result.branches?.variants.discriminatorField;

  if (!createOperation || !discriminatorFieldName || !discriminatorField) {
    return undefined;
  }

  const fields = uniqueCreateFields([
    ...recordFieldsToCreateFields(result.childRecordFields),
    ...recordFieldsToCreateFields(selectTreeChildVariantFields(result, variant.variantValue)),
  ]).filter((field) => field.fieldName !== discriminatorFieldName);
  const defaults: CreateDefaultConfig[] = [
    {
      fieldName: discriminatorFieldName,
      field: discriminatorField,
      value: {
        kind: "literal",
        value: variant.variantValue,
      },
    },
  ];

  return {
    type: "create",
    label: `Add ${variant.label}`,
    entityName: result.childEntityName,
    entity: result.childEntity,
    operationName: createOperation.operationName,
    operation: createOperation.operation,
    fields,
    defaults,
    enabled: true,
  };
}

function selectTreeChildVariantFields(
  result: TreeResultConfig,
  variantValue: string,
): RecordFieldConfig[] {
  const variant = result.childRecordUnion?.variants.find(
    (candidate) => candidate.variantValue === variantValue,
  );

  return variant?.presentation.type === "fields" ? variant.presentation.fields : [];
}

function recordFieldsToCreateFields(fields: RecordFieldConfig[]): CreateFieldConfig[] {
  return fields.map((field) => ({
    fieldName: field.fieldName,
    field: field.field,
    editor: field.editor,
    ...(field.visibleWhen === undefined ? {} : { visibleWhen: field.visibleWhen }),
  }));
}

function uniqueCreateFields(fields: CreateFieldConfig[]): CreateFieldConfig[] {
  const seen = new Set<string>();
  const uniqueFields: CreateFieldConfig[] = [];

  for (const field of fields) {
    if (seen.has(field.fieldName)) {
      continue;
    }

    seen.add(field.fieldName);
    uniqueFields.push(field);
  }

  return uniqueFields;
}

function selectTreeCompositionOperationBinding(
  result: TreeResultConfig,
  action: "create" | "remove",
  executionTargetKey: string,
): GeneratedOperationControlBinding | undefined {
  return projectTreeCompositionOperationControlBindings(result.composition, {
    executionTargetKey,
  }).find((binding) => binding.input.kind === "treeComposition" && binding.input.action === action);
}

async function executeTreeChildCreateOperation(
  binding: GeneratedOperationControlBinding | undefined,
  controller: GeneratedOperationController,
  result: TreeResultConfig,
  parentRecord: StoredRecord,
  childValues: RecordValues,
  placementValues?: RecordValues,
): Promise<{ recordId: string }> {
  if (binding === undefined) {
    throw new Error("Tree child creation is not configured.");
  }

  const operationResult = await executeGeneratedOperationControl({
    binding,
    callerInput: {
      bindingId: binding.id,
      input: {
        childValues,
        ...(placementValues === undefined ? {} : { placementValues }),
      },
      recordId: parentRecord.id,
      source: "submitButton",
    },
    controller,
    setStatus: () => {},
  });

  return {
    recordId: selectCreatedTreeChildRecordId(operationResult, result.childEntityName),
  };
}

function selectCreatedTreeChildRecordId(
  result: GeneratedOperationExecutionResult,
  childEntityName: string,
): string {
  if (result.type === "failed") {
    throw new Error(result.displayError);
  }

  if (isOperationCommandOutput(result.output)) {
    const record = result.output.changes.find(
      (change) => change.payload.entity === childEntityName && !change.payload.deletedAt,
    )?.payload;

    if (record) {
      return record.id;
    }
  }

  const recordId = result.createdRecordIds?.[0];

  if (recordId === undefined) {
    throw new Error("Tree child operation did not create a child record.");
  }

  return recordId;
}

function isOperationCommandOutput(output: unknown): output is OperationCommandOutput {
  return (
    typeof output === "object" &&
    output !== null &&
    "type" in output &&
    output.type === "command" &&
    "changes" in output &&
    Array.isArray(output.changes)
  );
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

function recordFieldEditorKey(entityName: string, recordId: string, fieldName: string) {
  return `${entityName}:${recordId}:${fieldName}`;
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
