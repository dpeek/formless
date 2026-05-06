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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@formless/ui/table";
import {
  useEntityRecordIdsMatchingQuery,
  useRecord,
  useRecordField,
  useRecordReadinessWarnings,
} from "../../client/store.ts";
import type {
  ComputedTableColumnConfig,
  FieldTableColumnConfig,
  HomeQueryTabConfig,
  ReferenceFieldTableColumnConfig,
  TableColumnConfig,
} from "../../client/views.ts";
import type { QueryEvaluationContext } from "../../shared/query.ts";
import type { EntitySchema } from "../../shared/schema.ts";
import { evaluateNumericExpression } from "../../shared/read-model.ts";
import { formatComputedDisplayValue } from "./format.ts";
import { RecordFieldDisplay } from "./record-field-display.tsx";
import { RecordFieldEditor } from "./record-field-editor.tsx";
import { RecordReadinessWarnings } from "./readiness-warnings.tsx";

export function RecordTable({
  columns,
  entity,
  entityName,
  query,
  queryContext,
}: {
  columns: TableColumnConfig[];
  entity: EntitySchema;
  entityName: string;
  query: HomeQueryTabConfig["query"];
  queryContext?: QueryEvaluationContext;
}) {
  const canPatch = entity.mutations.patch.enabled;
  const recordIds = useEntityRecordIdsMatchingQuery(entityName, query, queryContext);
  const visibleColumns = columns.filter((column) => column.display !== "hidden");

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
                  {column.label}
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
        </Table>
      )}
    </section>
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
  const justifyClass =
    column.align === "end"
      ? "justify-end"
      : column.align === "center"
        ? "justify-center"
        : "justify-start";

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
  return `${tableAlignClass(column.align)} ${tableWidthClass(column.width)} h-8 px-1.5`;
}

function tableCellClass(column: TableColumnConfig) {
  return `${tableAlignClass(column.align)} ${tableWidthClass(column.width)} px-1.5 py-1`;
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

function tableWidthClass(width: TableColumnConfig["width"]) {
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
