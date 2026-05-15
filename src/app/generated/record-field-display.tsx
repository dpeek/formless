import { isHexColor, toPickerHexColor } from "@dpeek/formless-ui/color-utils";
import { MarkdownRenderer } from "@dpeek/formless-ui/markdown";
import { SvgIcon } from "@dpeek/formless-ui/svg-icon";
import { useRecordField, useReferenceOptions } from "../../client/store.ts";
import type {
  FieldTableColumnConfig,
  ReferenceFieldTableColumnConfig,
} from "../../client/views.ts";
import type { FieldValue } from "../../shared/protocol.ts";
import type { FieldSchema } from "../../shared/schema.ts";
import { formatFieldDisplayValue } from "./format.ts";

type DisplayTableColumnConfig = FieldTableColumnConfig | ReferenceFieldTableColumnConfig;

export function RecordFieldDisplay({
  column,
  recordId,
}: {
  column: DisplayTableColumnConfig;
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

  if (isIconDisplayColumn(column)) {
    return <RecordIconDisplay column={column} recordValue={recordValue} />;
  }

  if (isMarkdownDisplayColumn(column)) {
    return <RecordMarkdownDisplay column={column} recordValue={recordValue} />;
  }

  return (
    <>
      <span>{formatFieldDisplayValue(column, recordValue)}</span>
      {column.suffix ? <span className="text-slate-500">{column.suffix}</span> : null}
    </>
  );
}

function RecordIconDisplay({
  column,
  recordValue,
}: {
  column: DisplayTableColumnConfig;
  recordValue: FieldValue | undefined;
}) {
  const source = typeof recordValue === "string" ? recordValue : "";

  return (
    <>
      <SvgIcon ariaLabel={column.label} className="size-4" source={source} />
      {column.suffix ? <span className="text-slate-500">{column.suffix}</span> : null}
    </>
  );
}

function RecordMarkdownDisplay({
  column,
  recordValue,
}: {
  column: DisplayTableColumnConfig;
  recordValue: FieldValue | undefined;
}) {
  if (typeof recordValue !== "string" || recordValue === "") {
    return (
      <>
        <span>{formatFieldDisplayValue(column, recordValue)}</span>
        {column.suffix ? <span className="text-slate-500">{column.suffix}</span> : null}
      </>
    );
  }

  return (
    <>
      <MarkdownRenderer
        className="min-w-0 flex-1 text-xs [&>:first-child]:mt-0 [&>:last-child]:mb-0"
        content={recordValue}
        minHeadingLevel={2}
      />
      {column.suffix ? <span className="text-slate-500">{column.suffix}</span> : null}
    </>
  );
}

function RecordColorDisplay({
  column,
  recordValue,
}: {
  column: DisplayTableColumnConfig;
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

function isColorDisplayColumn(column: DisplayTableColumnConfig) {
  return (
    column.field.type === "text" && (column.editor === "color" || column.field.format === "color")
  );
}

function isIconDisplayColumn(column: DisplayTableColumnConfig) {
  return (
    column.field.type === "text" && (column.editor === "icon" || column.field.format === "icon")
  );
}

function isMarkdownDisplayColumn(column: DisplayTableColumnConfig) {
  return (
    column.display === "readOnly" &&
    column.field.type === "text" &&
    (column.editor === "markdown" || column.field.format === "markdown")
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
