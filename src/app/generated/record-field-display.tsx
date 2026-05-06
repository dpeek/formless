import { isHexColor, toPickerHexColor } from "@formless/ui/color-utils";
import { useRecordField, useReferenceOptions } from "../../client/store.ts";
import type {
  FieldTableColumnConfig,
  ReferenceFieldTableColumnConfig,
} from "../../client/views.ts";
import type { FieldValue } from "../../shared/protocol.ts";
import type { FieldSchema } from "../../shared/schema.ts";
import { formatFieldDisplayValue } from "./format.ts";

export function RecordFieldDisplay({
  column,
  recordId,
}: {
  column: FieldTableColumnConfig | ReferenceFieldTableColumnConfig;
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

  if (isColorDisplayColumn(column)) {
    return <RecordColorDisplay column={column} recordValue={recordValue} />;
  }

  return (
    <>
      <span>{formatFieldDisplayValue(column, recordValue)}</span>
      {column.suffix ? <span className="text-slate-500">{column.suffix}</span> : null}
    </>
  );
}

function RecordColorDisplay({
  column,
  recordValue,
}: {
  column: TableColumnConfig;
  recordValue: FieldValue | undefined;
}) {
  const displayValue = formatFieldDisplayValue(column, recordValue);
  const color = typeof recordValue === "string" ? recordValue : "";

  return (
    <>
      <ColorDisplaySwatch color={color} label={column.label} />
      <span>{displayValue}</span>
      {column.suffix ? <span className="text-slate-500">{column.suffix}</span> : null}
    </>
  );
}

function ColorDisplaySwatch({ color, label }: { color: string; label: string }) {
  if (!isHexColor(color)) {
    return null;
  }

  return (
    <span
      aria-label={`${label} color swatch`}
      className="relative size-3.5 shrink-0 overflow-hidden rounded-sm border border-slate-300"
    >
      <span
        aria-hidden="true"
        className="absolute inset-0"
        style={{ backgroundColor: toPickerHexColor(color) }}
      />
    </span>
  );
}

function isColorDisplayColumn(column: TableColumnConfig) {
  return (
    column.field.type === "text" && (column.editor === "color" || column.field.format === "color")
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
