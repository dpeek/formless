import { Fragment, useState } from "react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@formless/ui/dropdown-menu";
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
  useRecordReadinessWarnings,
} from "../../client/store.ts";
import type {
  ComputedTableColumnConfig,
  EditViewConfig,
  FieldTableColumnConfig,
  HomeQueryTabConfig,
  InvokeActionTableColumnConfig,
  ReferenceFieldTableColumnConfig,
  EditRecordTableActionConfig,
  TableActionConfig,
  TableColumnConfig,
  TableFooterSlotConfig,
} from "../../client/views.ts";
import type { QueryEvaluationContext } from "../../shared/query.ts";
import type { EntitySchema } from "../../shared/schema.ts";
import { evaluateNumericExpression } from "../../shared/read-model.ts";
import { formatAggregateDisplayValue, formatComputedDisplayValue } from "./format.ts";
import { RecordFieldDisplay } from "./record-field-display.tsx";
import { RecordFieldEditor } from "./record-field-editor.tsx";
import { RecordReadinessWarnings } from "./readiness-warnings.tsx";

type ReferenceEditRecordTableActionConfig = EditRecordTableActionConfig & {
  target: Extract<EditRecordTableActionConfig["target"], { kind: "reference" }>;
};

export function RecordTable({
  columns,
  entity,
  entityName,
  footer = [],
  query,
  queryName,
  queryContext,
}: {
  columns: TableColumnConfig[];
  entity: EntitySchema;
  entityName: string;
  footer?: TableFooterSlotConfig[];
  query: HomeQueryTabConfig["query"];
  queryName?: string;
  queryContext?: QueryEvaluationContext;
}) {
  const canPatch = entity.mutations.patch.enabled;
  const recordIds = useEntityRecordIdsMatchingQuery(entityName, query, queryContext);
  const visibleColumns = columns.filter((column) => column.display !== "hidden");
  const visibleFooter = footer.filter(
    (slot) => queryName === undefined || slot.aggregate.query === queryName,
  );

  return (
    <section className="space-y-3">
      {!canPatch && recordIds.length > 0 ? (
        <p className="text-sm text-slate-600">Editing is disabled for {entity.label}.</p>
      ) : null}

      {recordIds.length === 0 ? (
        <p className="text-sm text-slate-600">No records yet.</p>
      ) : (
        <Table className="table-fixed text-xs">
          <TableHeader>
            <TableRow>
              {visibleColumns.map((column) => (
                <TableHead className={tableHeadClass(column)} key={column.key}>
                  <RecordTableHeader column={column} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {recordIds.map((recordId) => (
              <Fragment key={recordId}>
                <TableRow>
                  {visibleColumns.map((column) => (
                    <TableCell className={tableCellClass(column)} key={column.key}>
                      <RecordTableCell
                        canPatch={canPatch}
                        entityName={entityName}
                        column={column}
                        recordId={recordId}
                      />
                    </TableCell>
                  ))}
                </TableRow>
                <ReadinessWarningTableRow columnCount={visibleColumns.length} recordId={recordId} />
              </Fragment>
            ))}
          </TableBody>
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

function RecordTableHeader({ column }: { column: TableColumnConfig }) {
  if (column.type === "invokeAction" && column.label === "") {
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
  recordId,
}: {
  canPatch: boolean;
  column: TableColumnConfig;
  entityName: string;
  recordId: string;
}) {
  const justifyClass = tableCellJustifyClass(column);

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
        <InvokeActionTableCell column={column} sourceRecordId={recordId} />
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

function InvokeActionTableCell({
  column,
  sourceRecordId,
}: {
  column: InvokeActionTableColumnConfig;
  sourceRecordId: string;
}) {
  const [openActionName, setOpenActionName] = useState<string | null>(null);

  if (column.actions.length === 0) {
    return null;
  }

  const openAction = column.actions.find(
    (action): action is EditRecordTableActionConfig =>
      action.actionName === openActionName && action.type === "editRecord",
  );

  function openActionDialog(action: TableActionConfig) {
    if (action.type === "editRecord" && !action.disabled) {
      setOpenActionName(action.actionName);
    }
  }

  if (column.presentation === "button" && column.actions.length === 1) {
    const action = column.actions[0];

    if (!action) {
      return null;
    }

    return (
      <>
        <TableActionButton action={action} onOpen={() => openActionDialog(action)} />
        {openAction ? (
          <EditRecordTableActionDialog
            action={openAction}
            onOpenChange={(open) => {
              if (!open) {
                setOpenActionName(null);
              }
            }}
            open={true}
            sourceRecordId={sourceRecordId}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button aria-label={column.headerLabel} size="icon-xs" type="button" variant="outline">
              <span aria-hidden="true">...</span>
            </Button>
          }
        />
        <DropdownMenuContent align={column.align === "end" ? "end" : "start"}>
          {column.actions.map((action) => (
            <DropdownMenuItem
              aria-label={actionAriaLabel(action)}
              disabled={action.disabled}
              key={action.actionName}
              onClick={() => openActionDialog(action)}
              variant={action.variant === "destructive" ? "destructive" : "default"}
            >
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {openAction ? (
        <EditRecordTableActionDialog
          action={openAction}
          onOpenChange={(open) => {
            if (!open) {
              setOpenActionName(null);
            }
          }}
          open={true}
          sourceRecordId={sourceRecordId}
        />
      ) : null}
    </>
  );
}

function TableActionButton({ action, onOpen }: { action: TableActionConfig; onOpen: () => void }) {
  return (
    <Button
      aria-label={actionAriaLabel(action)}
      disabled={action.disabled}
      onClick={action.type === "editRecord" ? onOpen : undefined}
      size="xs"
      type="button"
      variant={action.variant === "destructive" ? "destructive" : "outline"}
    >
      {action.label}
    </Button>
  );
}

function actionAriaLabel(action: TableActionConfig) {
  if (action.disabled && action.disabledReason) {
    return `${action.label}: ${action.disabledReason}`;
  }

  return action.label;
}

function EditRecordTableActionDialog({
  action,
  onOpenChange,
  open,
  sourceRecordId,
}: {
  action: EditRecordTableActionConfig;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sourceRecordId: string;
}) {
  if (action.target.kind === "row") {
    return (
      <RecordEditDialog
        action={action}
        onOpenChange={onOpenChange}
        open={open}
        targetRecordId={sourceRecordId}
      />
    );
  }

  if (!isReferenceEditRecordAction(action)) {
    return null;
  }

  return (
    <ReferencedRecordEditActionDialog
      action={action}
      onOpenChange={onOpenChange}
      open={open}
      sourceRecordId={sourceRecordId}
    />
  );
}

function ReferencedRecordEditActionDialog({
  action,
  onOpenChange,
  open,
  sourceRecordId,
}: {
  action: ReferenceEditRecordTableActionConfig;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sourceRecordId: string;
}) {
  const targetRecordId = useRecordField(sourceRecordId, action.target.fieldName);

  return (
    <RecordEditDialog
      action={action}
      onOpenChange={onOpenChange}
      open={open}
      targetRecordId={typeof targetRecordId === "string" ? targetRecordId : undefined}
    />
  );
}

function isReferenceEditRecordAction(
  action: EditRecordTableActionConfig,
): action is ReferenceEditRecordTableActionConfig {
  return action.target.kind === "reference";
}

function RecordEditDialog({
  action,
  onOpenChange,
  open,
  targetRecordId,
}: {
  action: EditRecordTableActionConfig;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  targetRecordId: string | undefined;
}) {
  const targetRecord = useRecord(targetRecordId ?? "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{action.label}</DialogTitle>
          <DialogDescription>{action.editView.entity.label}</DialogDescription>
        </DialogHeader>
        {targetRecord && targetRecordId ? (
          <EditViewFields editView={action.editView} targetRecordId={targetRecordId} />
        ) : (
          <p className="text-sm text-slate-600">Record unavailable.</p>
        )}
        {!action.editView.entity.mutations.patch.enabled ? (
          <p className="text-sm text-slate-600">
            Editing is disabled for {action.editView.entity.label}.
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>Done</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditViewFields({
  editView,
  targetRecordId,
}: {
  editView: EditViewConfig;
  targetRecordId: string;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {editView.fields.map((fieldConfig) => (
        <div className={editFieldClass(fieldConfig)} key={fieldConfig.fieldName}>
          <RecordFieldEditor
            canPatch={editView.entity.mutations.patch.enabled}
            entityName={editView.entityName}
            fieldConfig={fieldConfig}
            recordId={targetRecordId}
            showLabel={true}
          />
        </div>
      ))}
    </div>
  );
}

function editFieldClass(fieldConfig: EditViewConfig["fields"][number]) {
  if (fieldConfig.editor === "markdown" || fieldConfig.editor === "textarea") {
    return "md:col-span-2";
  }

  return "";
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

function ReferencedRecordEditorDialog({
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
        <div className="flex flex-wrap items-end gap-3">
          {referenceItem.recordFields.map((fieldConfig) => (
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

function tableHeadClass(column: TableColumnConfig) {
  return `${tableAlignClass(column.align)} ${tableWidthClass(column)} h-8 px-1.5`;
}

function tableCellClass(column: TableColumnConfig) {
  return `${tableAlignClass(column.align)} ${tableWidthClass(column)} px-1.5 py-1`;
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
