import { useRecordField, useReferenceOptions } from "../../client/store.ts";
import type { TableColumnConfig } from "../../client/views.ts";
import type { FieldValue } from "../../shared/protocol.ts";
import type { FieldSchema } from "../../shared/schema.ts";
import { formatFieldDisplayValue } from "./format.ts";

export function RecordFieldDisplay({
  column,
  recordId,
}: {
  column: TableColumnConfig;
  recordId: string;
}) {
  const recordValue = useRecordField(recordId, column.fieldName);

  if (column.field.type === "reference") {
    return (
      <RecordReferenceDisplay
        field={column.field}
        recordValue={recordValue}
        suffix={column.suffix}
      />
    );
  }

  return (
    <>
      <span>{formatFieldDisplayValue(column, recordValue)}</span>
      {column.suffix ? <span className="text-slate-500">{column.suffix}</span> : null}
    </>
  );
}

function RecordReferenceDisplay({
  field,
  recordValue,
  suffix,
}: {
  field: Extract<FieldSchema, { type: "reference" }>;
  recordValue: FieldValue | undefined;
  suffix?: string;
}) {
  const options = useReferenceOptions(field.to, field.displayField);
  const label =
    typeof recordValue === "string"
      ? (options.find((option) => option.id === recordValue)?.label ?? recordValue)
      : "";

  return (
    <>
      <span>{label}</span>
      {suffix ? <span className="text-slate-500">{suffix}</span> : null}
    </>
  );
}
