import { Fragment, useState } from "react";
import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { isSortableOperation, useSortable } from "@dnd-kit/react/sortable";
import { Button } from "@dpeek/formless-ui/button";
import {
  ModalBody,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@dpeek/formless-ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@dpeek/formless-ui/table";
import {
  useAggregateValueMatchingQuery,
  useEntityRecordIdsMatchingQuery,
  useRecord,
  useRecordField,
  useRecordsById,
  useRecordReadinessWarnings,
} from "../../client/store.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import type {
  ComputedTableColumnConfig,
  FieldTableColumnConfig,
  HomeQueryTabConfig,
  OrderingHandleTableColumnConfig,
  ReferenceFieldTableColumnConfig,
  TableColumnConfig,
  TableFooterSlotConfig,
  TransitionStateActionConfig,
} from "../../client/views.ts";
import type { TableCollectionResultModel } from "../../client/collection-result-model.ts";
import {
  evaluateNumericExpression,
  type EntitySchema,
  type QueryEvaluationContext,
} from "@dpeek/formless-schema";
import { formatAggregateDisplayValue, formatComputedDisplayValue } from "./format.ts";
import {
  ORDERING_DND_TYPE,
  calculateOrderingDragMovePlanForContext,
  parseOrderingDragData,
  selectOrderingDragFacts,
  selectResultOrderingContext,
  submitOrderingPatch,
  type ResultOrderingContext,
  type ResultOrderingDragData,
} from "./ordering-ui.ts";
import { RecordFieldDisplay } from "./record-field-display.tsx";
import { DeleteRecordButton, type RecordLabelFieldConfig } from "./record-delete.tsx";
import { RecordFieldEditor } from "./record-field-editor.tsx";
import { RecordReadinessWarnings } from "./readiness-warnings.tsx";
import { useSchemaAppTarget } from "./schema-app-context.tsx";
import { RecordTransitionActionControls } from "./state-machine-ui.tsx";
import { InvokeActionTableCell } from "./table-actions.tsx";
import {
  selectGeneratedTablePresentation,
  type GeneratedTableCellPresentation,
  type GeneratedTableColumnPresentation,
  type GeneratedTableFooterCellPresentation,
  type GeneratedTableFooterPresentation,
  type GeneratedTableHeaderPresentation,
  type GeneratedTableReadinessWarningPresentation,
  type GeneratedTableRowPresentation,
} from "./table-presentation.ts";
import { selectRecordFieldsForActiveUnion } from "./union-presentation.ts";

export function RecordTable({
  entity,
  entityName,
  query,
  queryName,
  queryContext,
  result,
}: {
  entity: EntitySchema;
  entityName: string;
  query: HomeQueryTabConfig["query"];
  queryName?: string;
  queryContext?: QueryEvaluationContext;
  result: TableCollectionResultModel;
}) {
  const appTarget = useSchemaAppTarget();
  const canPatch = entity.mutations.patch.enabled;
  const canDelete = entity.mutations.delete.enabled;
  const [pendingDragRecordId, setPendingDragRecordId] = useState<string | null>(null);
  const { columns, ordering } = result;
  const recordIds = useEntityRecordIdsMatchingQuery(entityName, query, queryContext);
  const recordsById = useRecordsById();
  const orderingContext = selectResultOrderingContext({
    canPatch,
    entityName,
    ordering,
    recordIds,
    recordsById,
  });
  const orderedRecordIds = orderingContext?.orderedRecordIds ?? recordIds;
  const orderingDragFacts = selectOrderingDragFacts(orderingContext);
  const presentation = selectGeneratedTablePresentation({
    canDelete,
    canPatch,
    columns,
    footer: result.footer ?? [],
    orderedRecordIds,
    orderingDragFacts,
    orderingDragPatchEnabled: orderingContext?.canPatch,
    pendingDragRecordId,
    query,
    queryName,
    transitionActions: result.transitionActions,
  });

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
      setSyncStatus({ state: "idle", message: "Cross-scope row move ignored." });
      return;
    }

    const plan = calculateOrderingDragMovePlanForContext({
      orderingContext,
      recordId: dragData.recordId,
      targetIndex: source.sortable.index,
    });

    if (plan.kind !== "patch") {
      if (plan.kind === "rebalance") {
        setSyncStatus({ state: "error", message: "Rebalance required before drag reorder." });
      }
      return;
    }

    const suspendedDrop = event.suspend();
    setPendingDragRecordId(dragData.recordId);
    setSyncStatus({ state: "syncing", message: "Moving row..." });

    try {
      await submitOrderingPatch(appTarget, orderingContext, plan);
      setSyncStatus({ state: "idle", message: "Row moved and synced." });
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

  const table = (
    <Table
      aria-label={`${entity.label} records`}
      className="min-w-full"
      data-slot="table"
      bleed={true}
    >
      <TableHeader>
        {presentation.columns.map((column) => (
          <TableColumn
            className={tableHeadClassForPresentationColumn(column)}
            id={column.id}
            isRowHeader={column.isRowHeader}
            key={column.key}
            textValue={column.header.accessibleLabel}
          >
            <RecordTableHeader header={column.header} />
          </TableColumn>
        ))}
      </TableHeader>
      <TableBody
        renderEmptyState={() => (
          <p className="px-1.5 py-3 text-sm text-slate-600">{presentation.emptyState.message}</p>
        )}
      >
        {presentation.emptyState.visible
          ? null
          : presentation.rows.map((row) =>
              row.ordering.type === "drag" ? (
                <SortableRecordTableRows
                  canPatch={canPatch}
                  deleteLabelFields={presentation.delete?.labelFields ?? []}
                  entity={entity}
                  entityName={entityName}
                  key={row.key}
                  orderingContext={orderingContext}
                  recordRow={row}
                />
              ) : (
                <StaticRecordTableRows
                  canPatch={canPatch}
                  deleteLabelFields={presentation.delete?.labelFields ?? []}
                  entity={entity}
                  entityName={entityName}
                  key={row.key}
                  orderingContext={orderingContext}
                  recordRow={row}
                />
              ),
            )}
        {!presentation.emptyState.visible && presentation.footer ? (
          <RecordTableFooterRow
            entityName={entityName}
            footer={presentation.footer}
            query={query}
            queryContext={queryContext}
          />
        ) : null}
      </TableBody>
    </Table>
  );

  return (
    <section className="space-y-3">
      {presentation.editingDisabled ? (
        <p className="text-sm text-slate-600">Editing is disabled for {entity.label}.</p>
      ) : null}
      {orderingContext && orderingDragFacts ? (
        <DragDropProvider onDragEnd={handleOrderingDragEnd}>{table}</DragDropProvider>
      ) : (
        table
      )}
    </section>
  );
}

function StaticRecordTableRows({
  canPatch,
  deleteLabelFields,
  entity,
  entityName,
  orderingContext,
  recordRow,
}: {
  canPatch: boolean;
  deleteLabelFields: RecordLabelFieldConfig[];
  entity: EntitySchema;
  entityName: string;
  orderingContext?: ResultOrderingContext;
  recordRow: GeneratedTableRowPresentation;
}) {
  return (
    <Fragment>
      <TableRow
        className="group/record-row"
        data-formless-record-row={recordRow.recordId}
        id={recordRow.id}
        textValue={recordRow.recordId}
      >
        <RecordTableCells
          canPatch={canPatch}
          deleteLabelFields={deleteLabelFields}
          entity={entity}
          entityName={entityName}
          orderingContext={orderingContext}
          recordRow={recordRow}
        />
      </TableRow>
      <ReadinessWarningTableRow warning={recordRow.readinessWarning} />
    </Fragment>
  );
}

function SortableRecordTableRows({
  canPatch,
  deleteLabelFields,
  entity,
  entityName,
  orderingContext,
  recordRow,
}: {
  canPatch: boolean;
  deleteLabelFields: RecordLabelFieldConfig[];
  entity: EntitySchema;
  entityName: string;
  orderingContext?: ResultOrderingContext;
  recordRow: GeneratedTableRowPresentation;
}) {
  if (recordRow.ordering.type !== "drag") {
    return (
      <StaticRecordTableRows
        canPatch={canPatch}
        deleteLabelFields={deleteLabelFields}
        entity={entity}
        entityName={entityName}
        orderingContext={orderingContext}
        recordRow={recordRow}
      />
    );
  }

  const { disabled, dragData, dragFact } = recordRow.ordering;
  const { handleRef, isDragSource, isDropTarget, ref } = useSortable<ResultOrderingDragData>({
    id: `ordering:${recordRow.recordId}`,
    data: dragData ?? {
      type: ORDERING_DND_TYPE,
      recordId: recordRow.recordId,
      scopeKey: "",
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
  const rowStateClass = [
    "group/record-row",
    isDragSource ? "opacity-60" : "",
    isDropTarget ? "bg-muted/40" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Fragment>
      <TableRow
        className={rowStateClass}
        data-formless-record-row={recordRow.recordId}
        data-formless-sortable-row={recordRow.recordId}
        id={recordRow.id}
        ref={ref}
        textValue={recordRow.recordId}
      >
        <RecordTableCells
          canPatch={canPatch}
          deleteLabelFields={deleteLabelFields}
          entity={entity}
          entityName={entityName}
          orderingContext={orderingContext}
          orderingHandleDisabled={disabled}
          orderingHandleRef={handleRef}
          recordRow={recordRow}
        />
      </TableRow>
      <ReadinessWarningTableRow warning={recordRow.readinessWarning} />
    </Fragment>
  );
}

function RecordTableCells({
  canPatch,
  deleteLabelFields,
  entity,
  entityName,
  orderingContext,
  orderingHandleDisabled,
  orderingHandleRef,
  recordRow,
}: {
  canPatch: boolean;
  deleteLabelFields: RecordLabelFieldConfig[];
  entity: EntitySchema;
  entityName: string;
  orderingContext?: ResultOrderingContext;
  orderingHandleDisabled?: boolean;
  orderingHandleRef?: (element: Element | null) => void;
  recordRow: GeneratedTableRowPresentation;
}) {
  return (
    <>
      {recordRow.cells.map((cell) => (
        <TableCell className={tableCellClassForPresentationColumn(cell.column)} key={cell.key}>
          <RecordTableCellContent
            canPatch={canPatch}
            cell={cell}
            deleteLabelFields={deleteLabelFields}
            entity={entity}
            entityName={entityName}
            orderingContext={orderingContext}
            orderingHandleDisabled={orderingHandleDisabled}
            orderingHandleRef={orderingHandleRef}
          />
        </TableCell>
      ))}
    </>
  );
}

function RecordTableCellContent({
  canPatch,
  cell,
  deleteLabelFields,
  entity,
  entityName,
  orderingContext,
  orderingHandleDisabled,
  orderingHandleRef,
}: {
  canPatch: boolean;
  cell: GeneratedTableCellPresentation;
  deleteLabelFields: RecordLabelFieldConfig[];
  entity: EntitySchema;
  entityName: string;
  orderingContext?: ResultOrderingContext;
  orderingHandleDisabled?: boolean;
  orderingHandleRef?: (element: Element | null) => void;
}) {
  if (cell.column.type === "delete") {
    return (
      <DeleteRecordButton
        entityLabel={entity.label}
        entityName={entityName}
        labelFields={deleteLabelFields}
        recordId={cell.recordId}
        triggerData={{ "data-formless-delete-record": cell.recordId }}
      />
    );
  }

  if (cell.column.type === "transition") {
    return (
      <RecordTransitionTableCell
        actions={cell.column.actions}
        entityName={entityName}
        recordId={cell.recordId}
      />
    );
  }

  return (
    <RecordTableCell
      canPatch={canPatch}
      entityName={entityName}
      column={cell.column.column}
      orderingContext={orderingContext}
      orderingHandleDisabled={orderingHandleDisabled}
      orderingHandleRef={orderingHandleRef}
      recordId={cell.recordId}
    />
  );
}

function RecordTransitionTableCell({
  actions,
  entityName,
  recordId,
}: {
  actions: TransitionStateActionConfig[];
  entityName: string;
  recordId: string;
}) {
  const record = useRecord(recordId);

  return (
    <RecordTransitionActionControls
      actions={actions}
      className="justify-end"
      entityName={entityName}
      recordId={recordId}
      values={record?.values}
    />
  );
}

function RecordTableHeader({ header }: { header: GeneratedTableHeaderPresentation }) {
  if (header.isVisuallyHidden) {
    return <span className="sr-only">{header.accessibleLabel}</span>;
  }

  return header.label;
}

function RecordTableFooterRow({
  entityName,
  footer,
  query,
  queryContext,
}: {
  entityName: string;
  footer: GeneratedTableFooterPresentation;
  query: HomeQueryTabConfig["query"];
  queryContext?: QueryEvaluationContext;
}) {
  return (
    <TableRow
      className="border-t bg-muted/50 font-medium"
      data-formless-table-footer="true"
      data-slot="table-footer"
      id={footer.id}
      key={footer.key}
      textValue="Aggregate footer"
    >
      {footer.cells.map((cell) => (
        <TableCell className={tableCellClassForPresentationColumn(cell.column)} key={cell.key}>
          <RecordTableFooterCell
            cell={cell}
            entityName={entityName}
            query={query}
            queryContext={queryContext}
          />
        </TableCell>
      ))}
    </TableRow>
  );
}

function RecordTableFooterCell({
  cell,
  entityName,
  query,
  queryContext,
}: {
  cell: GeneratedTableFooterCellPresentation;
  entityName: string;
  query: HomeQueryTabConfig["query"];
  queryContext?: QueryEvaluationContext;
}) {
  if (cell.type === "empty") {
    return <span aria-hidden="true">&nbsp;</span>;
  }

  return (
    <div className={`flex min-h-6 items-center gap-1 ${tableCellJustifyClass(cell.column.column)}`}>
      <AggregateFooterValue
        entityName={entityName}
        query={query}
        queryContext={queryContext}
        slot={cell.slot}
      />
    </div>
  );
}

function AggregateFooterValue({
  entityName,
  query,
  queryContext,
  slot,
}: {
  entityName: string;
  query: HomeQueryTabConfig["query"];
  queryContext?: QueryEvaluationContext;
  slot: TableFooterSlotConfig;
}) {
  const value = useAggregateValueMatchingQuery(
    entityName,
    query,
    slot.aggregate,
    slot.computedValues,
    queryContext,
  );
  const displayValue = formatAggregateDisplayValue(slot, value);

  return (
    <span aria-label={slot.label} className="inline-flex items-baseline gap-1">
      <span>{displayValue}</span>
      {slot.suffix ? <span className="text-slate-500">{slot.suffix}</span> : null}
    </span>
  );
}

function ReadinessWarningTableRow({
  warning,
}: {
  warning: GeneratedTableReadinessWarningPresentation;
}) {
  const warnings = useRecordReadinessWarnings(warning.recordId);

  if (warnings.length === 0) {
    return null;
  }

  return (
    <TableRow id={warning.id} textValue="Readiness warnings">
      <TableCell className="px-1.5 py-1 text-xs" colSpan={warning.columnSpan}>
        <RecordReadinessWarnings warnings={warnings} />
      </TableCell>
    </TableRow>
  );
}

function RecordTableCell({
  canPatch,
  column,
  entityName,
  orderingContext,
  orderingHandleDisabled,
  orderingHandleRef,
  recordId,
}: {
  canPatch: boolean;
  column: TableColumnConfig;
  entityName: string;
  orderingContext?: ResultOrderingContext;
  orderingHandleDisabled?: boolean;
  orderingHandleRef?: (element: Element | null) => void;
  recordId: string;
}) {
  const justifyClass = tableCellJustifyClass(column);

  if (column.type === "orderingHandle") {
    return (
      <div className={`flex min-h-6 items-center gap-1 ${justifyClass}`}>
        <OrderingHandleTableCell
          column={column}
          disabled={orderingHandleDisabled ?? true}
          handleRef={orderingHandleRef}
        />
      </div>
    );
  }

  if (column.type === "referenceField") {
    return (
      <ReferenceFieldTableCell
        column={column}
        justifyClass={justifyClass}
        sourceRecordId={recordId}
      />
    );
  }

  if (column.type === "computed") {
    return (
      <div className={`flex min-h-6 items-center gap-1 ${justifyClass}`}>
        <ComputedTableCell column={column} recordId={recordId} />
      </div>
    );
  }

  if (column.type === "invokeAction") {
    return (
      <div className={`flex min-h-6 items-center gap-1 ${justifyClass}`}>
        <InvokeActionTableCell
          column={column}
          orderingContext={orderingContext}
          sourceRecordId={recordId}
        />
      </div>
    );
  }

  if (column.display === "readOnly") {
    return (
      <div className={`flex min-h-6 items-center gap-1 ${justifyClass}`}>
        <RecordFieldDisplay column={column} recordId={recordId} />
        <ReferencedRecordEditButton column={column} sourceRecordId={recordId} />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1 ${justifyClass}`}>
      <RecordFieldEditor
        canPatch={canPatch}
        density="compact"
        entityName={entityName}
        fieldConfig={column}
        key={recordFieldEditorKey(entityName, recordId, column.fieldName)}
        recordId={recordId}
      />
      {column.suffix ? (
        <span className="shrink-0 text-xs text-slate-500">{column.suffix}</span>
      ) : null}
      <ReferencedRecordEditButton column={column} sourceRecordId={recordId} />
    </div>
  );
}

function OrderingHandleTableCell({
  column,
  disabled,
  handleRef,
}: {
  column: OrderingHandleTableColumnConfig;
  disabled: boolean;
  handleRef?: (element: Element | null) => void;
}) {
  return (
    <Button
      aria-label={column.headerLabel}
      data-formless-ordering-handle="true"
      isDisabled={disabled}
      ref={handleRef}
      size="sq-xs"
      type="button"
      intent="plain"
    >
      <span aria-hidden="true">::</span>
    </Button>
  );
}

function tableCellJustifyClass(column: TableColumnConfig) {
  return column.align === "end"
    ? "justify-end"
    : column.align === "center"
      ? "justify-center"
      : "justify-start";
}

function ComputedTableCell({
  column,
  recordId,
}: {
  column: ComputedTableColumnConfig;
  recordId: string;
}) {
  const record = useRecord(recordId);
  const value = record
    ? evaluateNumericExpression(column.computedValue.expression, record)
    : undefined;

  return (
    <>
      <span>{formatComputedDisplayValue(column, value)}</span>
      {column.suffix ? <span className="text-slate-500">{column.suffix}</span> : null}
    </>
  );
}

function ReferencedRecordEditButton({
  column,
  sourceRecordId,
}: {
  column: FieldTableColumnConfig;
  sourceRecordId: string;
}) {
  const referenceRecordId = useRecordField(sourceRecordId, column.fieldName);
  const [open, setOpen] = useState(false);

  if (!column.referenceItem || column.field.type !== "reference") {
    return null;
  }

  if (typeof referenceRecordId !== "string" || referenceRecordId.trim() === "") {
    return null;
  }

  return (
    <>
      <Button
        aria-label={`Edit shared ${column.referenceItem.entity.label.toLowerCase()}`}
        className="ml-1"
        onPress={() => setOpen(true)}
        size="xs"
        type="button"
        intent="outline"
      >
        Edit shared
      </Button>
      {open ? (
        <ReferencedRecordEditorDialog
          column={column}
          onOpenChange={setOpen}
          open={open}
          referenceRecordId={referenceRecordId}
        />
      ) : null}
    </>
  );
}

function ReferenceFieldTableCell({
  column,
  justifyClass,
  sourceRecordId,
}: {
  column: ReferenceFieldTableColumnConfig;
  justifyClass: string;
  sourceRecordId: string;
}) {
  const referenceRecordId = useRecordField(sourceRecordId, column.sourceReferenceFieldName);

  if (typeof referenceRecordId !== "string" || referenceRecordId.trim() === "") {
    return <EmptyReferenceFieldCell column={column} justifyClass={justifyClass} />;
  }

  return (
    <ResolvedReferenceFieldTableCell
      column={column}
      justifyClass={justifyClass}
      referenceRecordId={referenceRecordId}
    />
  );
}

function ResolvedReferenceFieldTableCell({
  column,
  justifyClass,
  referenceRecordId,
}: {
  column: ReferenceFieldTableColumnConfig;
  justifyClass: string;
  referenceRecordId: string;
}) {
  const referenceRecord = useRecord(referenceRecordId);

  if (!referenceRecord) {
    return <EmptyReferenceFieldCell column={column} justifyClass={justifyClass} />;
  }

  if (column.display === "readOnly") {
    return (
      <div className={`flex min-h-6 items-center gap-1 ${justifyClass}`}>
        <RecordFieldDisplay column={column} recordId={referenceRecordId} />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1 ${justifyClass}`}>
      <RecordFieldEditor
        canPatch={column.referencedEntity.mutations.patch.enabled}
        density="compact"
        entityName={column.referencedEntityName}
        fieldConfig={column}
        key={recordFieldEditorKey(column.referencedEntityName, referenceRecordId, column.fieldName)}
        recordId={referenceRecordId}
      />
      {column.suffix ? (
        <span className="shrink-0 text-xs text-slate-500">{column.suffix}</span>
      ) : null}
    </div>
  );
}

function EmptyReferenceFieldCell({
  column,
  justifyClass,
}: {
  column: ReferenceFieldTableColumnConfig;
  justifyClass: string;
}) {
  return (
    <div
      aria-label={`${column.label} unavailable`}
      className={`flex min-h-6 items-center text-xs text-slate-400 ${justifyClass}`}
    />
  );
}

export function ReferencedRecordEditorDialog({
  column,
  onOpenChange,
  open,
  referenceRecordId,
}: {
  column: FieldTableColumnConfig;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  referenceRecordId: string;
}) {
  const referenceItem = column.referenceItem;

  if (!referenceItem) {
    return null;
  }

  return (
    <ModalContent isOpen={open} onOpenChange={onOpenChange}>
      <ModalHeader>
        <ModalTitle>Shared {referenceItem.entity.label}</ModalTitle>
        <ModalDescription>
          {`Changes apply to every rate card that uses this ${referenceItem.entity.label.toLowerCase()}.`}
        </ModalDescription>
      </ModalHeader>
      <ModalBody>
        <ReferencedRecordEditorFields
          referenceItem={referenceItem}
          referenceRecordId={referenceRecordId}
        />
        {!referenceItem.entity.mutations.patch.enabled ? (
          <p className="text-sm text-slate-600">
            Editing is disabled for {referenceItem.entity.label}.
          </p>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <ModalClose intent="outline" type="button">
          Done
        </ModalClose>
      </ModalFooter>
    </ModalContent>
  );
}

export function ReferencedRecordEditorFields({
  referenceItem,
  referenceRecordId,
}: {
  referenceItem: NonNullable<FieldTableColumnConfig["referenceItem"]>;
  referenceRecordId: string;
}) {
  const referenceRecord = useRecord(referenceRecordId);
  const visibleFields = selectRecordFieldsForActiveUnion(
    referenceItem.recordFields,
    referenceItem.recordUnion,
    referenceRecord,
  );

  return (
    <div className="flex flex-wrap items-end gap-3">
      {visibleFields.map((fieldConfig) => (
        <RecordFieldEditor
          canPatch={referenceItem.entity.mutations.patch.enabled}
          entityName={referenceItem.entityName}
          fieldConfig={fieldConfig}
          key={recordFieldEditorKey(
            referenceItem.entityName,
            referenceRecordId,
            fieldConfig.fieldName,
          )}
          recordId={referenceRecordId}
          showLabel={true}
        />
      ))}
    </div>
  );
}

function recordFieldEditorKey(entityName: string, recordId: string, fieldName: string) {
  return `${entityName}:${recordId}:${fieldName}`;
}

function tableHeadClassForPresentationColumn(column: GeneratedTableColumnPresentation) {
  if (column.type === "delete") {
    return "h-8 w-16 min-w-16 px-1 text-end text-xs";
  }

  if (column.type === "transition") {
    return "h-8 w-36 min-w-36 px-1 text-end text-xs";
  }

  return tableHeadClass(column.column);
}

function tableCellClassForPresentationColumn(column: GeneratedTableColumnPresentation) {
  if (column.type === "delete") {
    return "w-16 min-w-16 px-1 py-1 text-end text-xs";
  }

  if (column.type === "transition") {
    return "w-36 min-w-36 px-1 py-1 text-end text-xs";
  }

  return tableCellClass(column.column);
}

function tableHeadClass(column: TableColumnConfig) {
  return `${tableAlignClass(column.align)} ${tableWidthClass(column)} h-8 text-xs ${tablePaddingClass(column)}`;
}

function tableCellClass(column: TableColumnConfig) {
  return `${tableAlignClass(column.align)} ${tableWidthClass(column)} ${tablePaddingClass(column)} py-1 text-xs`;
}

function tableAlignClass(align: TableColumnConfig["align"]) {
  if (align === "center") {
    return "text-center [&_input]:text-center";
  }

  if (align === "end") {
    return "text-end [&_input]:text-end";
  }

  return "text-start";
}

function tableWidthClass(column: TableColumnConfig) {
  if (isIconUtilityColumn(column)) {
    return "w-6 min-w-6 max-w-6";
  }

  const width = column.width;

  if (
    column.type === "field" &&
    column.valueUnit !== undefined &&
    column.display !== "readOnly" &&
    width === "sm"
  ) {
    return "w-52 min-w-52 max-w-60";
  }

  if (width === "xs") {
    return "w-20 min-w-20 max-w-24";
  }

  if (width === "sm") {
    return "w-28 min-w-28 max-w-32";
  }

  if (width === "md") {
    return "w-40 min-w-40 max-w-48";
  }

  if (width === "lg") {
    return "w-64 min-w-56";
  }

  return "";
}

function tablePaddingClass(column: TableColumnConfig) {
  return isIconUtilityColumn(column) ? "px-1" : "px-1.5";
}

function isIconUtilityColumn(column: TableColumnConfig) {
  return (
    column.type === "orderingHandle" ||
    (column.type === "invokeAction" && column.presentation === "dropdown" && column.label === "")
  );
}
