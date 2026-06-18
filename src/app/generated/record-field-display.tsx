import { ColorSwatch } from "@dpeek/formless-ui/color-swatch";
import { MarkdownRenderer } from "@dpeek/formless-ui/markdown";
import { SvgIcon } from "@dpeek/formless-ui/svg-icon";
import { useRecordFieldValue, useReferenceOptions } from "../../client/store.ts";
import type {
  FieldTableColumnConfig,
  RecordFieldConfig,
  ReferenceFieldTableColumnConfig,
} from "../../client/views.ts";
import { recordFieldRef } from "../../client/views.ts";
import type { FieldValue } from "@dpeek/formless-storage";
import type { FieldSchema } from "@dpeek/formless-schema";
import { expandHexColor, isHexColor } from "./color-utils.ts";
import {
  enumValuePresentation,
  fieldPresentationTextColorClassName,
  GeneratedFieldPresentationIcon,
} from "./field-presentation.tsx";
import { formatFieldDisplayValue } from "./format.ts";
import { StateMachineStateBadge } from "./state-machine-ui.tsx";

type DisplayTableColumnConfig =
  | FieldTableColumnConfig
  | ReferenceFieldTableColumnConfig
  | (RecordFieldConfig & { display?: "editor" | "readOnly" | "hidden"; suffix?: string });

export function RecordFieldDisplay({
  column,
  recordId,
}: {
  column: DisplayTableColumnConfig;
  recordId: string;
}) {
  const recordValue = useRecordFieldValue(recordId, recordFieldRef(column));

  if (column.field.type === "reference") {
    return (
      <RecordReferenceDisplay
        field={column.field}
        recordValue={recordValue}
        suffix={column.suffix}
      />
    );
  }

  if (column.field.type === "enum" && column.stateMachine) {
    return (
      <>
        <StateMachineStateBadge
          field={column.field}
          label={column.label ?? column.fieldName}
          stateMachine={column.stateMachine}
          value={recordValue}
        />
        {column.suffix ? <span className="text-slate-500">{column.suffix}</span> : null}
      </>
    );
  }

  if (isColorDisplayColumn(column)) {
    return <RecordColorDisplay column={column} recordValue={recordValue} />;
  }

  if (isIconDisplayColumn(column)) {
    return <RecordIconDisplay column={column} recordValue={recordValue} />;
  }

  if (isEnumIconDisplayColumn(column)) {
    return <RecordEnumIconDisplay column={column} recordValue={recordValue} />;
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

function RecordEnumIconDisplay({
  column,
  recordValue,
}: {
  column: DisplayTableColumnConfig;
  recordValue: FieldValue | undefined;
}) {
  if (column.field.type !== "enum") {
    return null;
  }

  const value = typeof recordValue === "string" ? recordValue : "";
  const option = column.field.values[value];
  const presentation = enumValuePresentation({ option, value });
  const label = value === "" ? "" : presentation.label;

  if (label === "") {
    return (
      <>
        <span />
        {column.suffix ? <span className="text-slate-500">{column.suffix}</span> : null}
      </>
    );
  }

  return (
    <>
      <span
        aria-label={`${column.label}: ${label}`}
        className={`inline-flex min-h-5 items-center gap-1 ${fieldPresentationTextColorClassName(
          presentation.color.intent,
        )}`}
        data-formless-field-presentation-color={presentation.color.intent}
        data-formless-field-presentation-color-token={presentation.color.token}
        data-formless-field-presentation-icon={option?.presentation?.icon}
        data-formless-field-presentation-mode="iconOnly"
      >
        {presentation.icon ? (
          <>
            <span className="sr-only">{`${column.label}: ${label}`}</span>
            <GeneratedFieldPresentationIcon className="size-4" icon={presentation.icon} />
          </>
        ) : (
          <span>{label}</span>
        )}
      </span>
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
      <ColorDisplaySwatch color={color} label={column.label ?? column.fieldName} />
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
    <ColorSwatch
      aria-label={`${label} color swatch`}
      className="size-3.5 overflow-hidden rounded-sm border border-slate-300"
      color={expandHexColor(color)}
    />
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

function isEnumIconDisplayColumn(column: DisplayTableColumnConfig) {
  return column.field.type === "enum" && column.presentation?.mode === "iconOnly";
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
