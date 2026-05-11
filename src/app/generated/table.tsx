import { Fragment, useState } from "react";
import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { isSortableOperation, useSortable } from "@dnd-kit/react/sortable";
import { Button } from "@formless/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@formless/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@formless/ui/table";
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
  ResultOrderingConfig,
  ReferenceFieldTableColumnConfig,
  TableColumnConfig,
  TableFooterSlotConfig,
} from "../../client/views.ts";
import type { QueryEvaluationContext } from "../../shared/query.ts";
import type { EntitySchema } from "../../shared/schema.ts";
import { evaluateNumericExpression } from "../../shared/read-model.ts";
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
  type ResultOrderingDragFact,
} from "./ordering-ui.ts";
import { RecordFieldDisplay } from "./record-field-display.tsx";
import { RecordFieldEditor } from "./record-field-editor.tsx";
import { RecordReadinessWarnings } from "./readiness-warnings.tsx";
import { useSchemaKey } from "./schema-app-context.tsx";
import { InvokeActionTableCell } from "./table-actions.tsx";
import { selectRecordFieldsForActiveUnion } from "./union-presentation.ts";

export function RecordTable({
  columns,
  entity,
  entityName,
  footer = [],
  ordering,
  query,
  queryName,
  queryContext,
}: {
  columns: TableColumnConfig[];
  entity: EntitySchema;
  entityName: string;
  footer?: TableFooterSlotConfig[];
  ordering?: ResultOrderingConfig;
  query: HomeQueryTabConfig["query"];
  queryName?: string;
  queryContext?: QueryEvaluationContext;
}) {
  const schemaKey = useSchemaKey();
  const canPatch = entity.mutations.patch.enabled;
  const [pendingDragRecordId, setPendingDragRecordId] = useState<string | null>(null);
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
  const visibleColumns = columns.filter((column) => column.display !== "hidden");
  const visibleFooter = footer.filter(
    (slot) => queryName === undefined || slot.aggregate.query === queryName,
  );

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
      await submitOrderingPatch(schemaKey, orderingContext, plan);
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

  return (
    <section className="space-y-3">
      {!canPatch && recordIds.length > 0 ? (
        <p className="text-sm text-slate-600">Editing is disabled for {entity.label}.</p>
      ) : null}

      {recordIds.length === 0 ? (
        <p className="text-sm text-slate-600">No records yet.</p>
      ) : (
        <Table className="min-w-full table-auto text-xs">
          <TableHeader>
            <TableRow>
              {visibleColumns.map((column) => (
                <TableHead className={tableHeadClass(column)} key={column.key}>
                  <RecordTableHeader column={column} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          {orderingContext && orderingDragFacts ? (
            <DragDropProvider onDragEnd={handleOrderingDragEnd}>
              {orderedRecordIds.map((recordId) => (
                <SortableRecordTableRows
                  canPatch={canPatch}
                  columns={visibleColumns}
                  dragFact={orderingDragFacts.get(recordId)}
                  entityName={entityName}
                  key={recordId}
                  orderingContext={orderingContext}
                  pendingDragRecordId={pendingDragRecordId}
                  recordId={recordId}
                />
              ))}
            </DragDropProvider>
          ) : (
            <TableBody>
              {orderedRecordIds.map((recordId) => (
                <StaticRecordTableRows
                  canPatch={canPatch}
                  columns={visibleColumns}
                  entityName={entityName}
                  key={recordId}
                  orderingContext={orderingContext}
                  recordId={recordId}
                />
              ))}
            </TableBody>
          )}
          {visibleFooter.length > 0 ? (
            <RecordTableFooter
              columns={visibleColumns}
              entityName={entityName}
              footer={visibleFooter}
              query={query}
              queryContext={queryContext}
            />
          ) : null}
        </Table>
      )}
    </section>
  );
}

function StaticRecordTableRows({
  canPatch,
  columns,
  entityName,
  orderingContext,
  recordId,
}: {
  canPatch: boolean;
  columns: TableColumnConfig[];
  entityName: string;
  orderingContext?: ResultOrderingContext;
  recordId: string;
}) {
  return (
    <Fragment>
      <TableRow>
        <RecordTableCells
          canPatch={canPatch}
          columns={columns}
          entityName={entityName}
          orderingContext={orderingContext}
          recordId={recordId}
        />
      </TableRow>
      <ReadinessWarningTableRow columnCount={columns.length} recordId={recordId} />
    </Fragment>
  );
}

function SortableRecordTableRows({
  canPatch,
  columns,
  dragFact,
  entityName,
  orderingContext,
  pendingDragRecordId,
  recordId,
}: {
  canPatch: boolean;
  columns: TableColumnConfig[];
  dragFact: ResultOrderingDragFact | undefined;
  entityName: string;
  orderingContext: ResultOrderingContext;
  pendingDragRecordId: string | null;
  recordId: string;
}) {
  const disabled = !dragFact || !orderingContext.canPatch || pendingDragRecordId !== null;
  const { handleRef, isDragSource, isDropTarget, ref } = useSortable<ResultOrderingDragData>({
    id: `ordering:${recordId}`,
    data: {
      type: ORDERING_DND_TYPE,
      recordId,
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
  const rowStateClass = [isDragSource ? "opacity-60" : "", isDropTarget ? "bg-muted/40" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <tbody
      data-formless-sortable-row={recordId}
      data-slot="table-body"
      ref={ref}
      className={rowStateClass || undefined}
    >
      <TableRow>
        <RecordTableCells
          canPatch={canPatch}
          columns={columns}
          entityName={entityName}
          orderingContext={orderingContext}
          orderingHandleDisabled={disabled}
          orderingHandleRef={handleRef}
          recordId={recordId}
        />
      </TableRow>
      <ReadinessWarningTableRow columnCount={columns.length} recordId={recordId} />
    </tbody>
  );
}

function RecordTableCells({
  canPatch,
  columns,
  entityName,
  orderingContext,
  orderingHandleDisabled,
  orderingHandleRef,
  recordId,
}: {
  canPatch: boolean;
  columns: TableColumnConfig[];
  entityName: string;
  orderingContext?: ResultOrderingContext;
  orderingHandleDisabled?: boolean;
  orderingHandleRef?: (element: Element | null) => void;
  recordId: string;
}) {
  return (
    <>
      {columns.map((column) => (
        <TableCell className={tableCellClass(column)} key={column.key}>
          <RecordTableCell
            canPatch={canPatch}
            entityName={entityName}
            column={column}
            orderingContext={orderingContext}
            orderingHandleDisabled={orderingHandleDisabled}
            orderingHandleRef={orderingHandleRef}
            recordId={recordId}
          />
        </TableCell>
      ))}
    </>
  );
}

function RecordTableHeader({ column }: { column: TableColumnConfig }) {
  if ((column.type === "invokeAction" || column.type === "orderingHandle") && column.label === "") {
    return <span className="sr-only">{column.headerLabel}</span>;
  }

  return column.label;
}

function RecordTableFooter({
  columns,
  entityName,
  footer,
  query,
  queryContext,
}: {
  columns: TableColumnConfig[];
  entityName: string;
  footer: TableFooterSlotConfig[];
  query: HomeQueryTabConfig["query"];
  queryContext?: QueryEvaluationContext;
}) {
  return (
    <TableFooter>
      <TableRow>
        {columns.map((column) => (
          <TableCell className={tableCellClass(column)} key={column.key}>
            <RecordTableFooterCell
              column={column}
              entityName={entityName}
              footer={footer}
              query={query}
              queryContext={queryContext}
            />
          </TableCell>
        ))}
      </TableRow>
    </TableFooter>
  );
}

function RecordTableFooterCell({
  column,
  entityName,
  footer,
  query,
  queryContext,
}: {
  column: TableColumnConfig;
  entityName: string;
  footer: TableFooterSlotConfig[];
  query: HomeQueryTabConfig["query"];
  queryContext?: QueryEvaluationContext;
}) {
  const slot = footer.find((candidate) => candidate.columnKey === column.key);

  if (!slot) {
    return <span aria-hidden="true">&nbsp;</span>;
  }

  return (
    <div className={`flex min-h-6 items-center gap-1 ${tableCellJustifyClass(column)}`}>
      <AggregateFooterValue
        entityName={entityName}
        query={query}
        queryContext={queryContext}
        slot={slot}
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
  columnCount,
  recordId,
}: {
  columnCount: number;
  recordId: string;
}) {
  const warnings = useRecordReadinessWarnings(recordId);

  if (warnings.length === 0) {
    return null;
  }

  return (
    <TableRow>
      <TableCell className="px-1.5 py-1" colSpan={columnCount}>
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
      disabled={disabled}
      ref={handleRef}
      size="icon-xs"
      type="button"
      variant="ghost"
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
        onClick={() => setOpen(true)}
        size="xs"
        type="button"
        variant="outline"
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Shared {referenceItem.entity.label}</DialogTitle>
          <DialogDescription>
            Changes apply to every rate card that uses this{" "}
            {referenceItem.entity.label.toLowerCase()}.
          </DialogDescription>
        </DialogHeader>
        <ReferencedRecordEditorFields
          referenceItem={referenceItem}
          referenceRecordId={referenceRecordId}
        />
        {!referenceItem.entity.mutations.patch.enabled ? (
          <p className="text-sm text-slate-600">
            Editing is disabled for {referenceItem.entity.label}.
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>Done</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
          key={fieldConfig.fieldName}
          recordId={referenceRecordId}
          showLabel={true}
        />
      ))}
    </div>
  );
}

function tableHeadClass(column: TableColumnConfig) {
  return `${tableAlignClass(column.align)} ${tableWidthClass(column)} h-8 ${tablePaddingClass(column)}`;
}

function tableCellClass(column: TableColumnConfig) {
  return `${tableAlignClass(column.align)} ${tableWidthClass(column)} ${tablePaddingClass(column)} py-1`;
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
