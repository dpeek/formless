import { SvgIcon } from "@dpeek/formless-ui/svg-icon";
import {
  useRecordFieldValue,
  useReferenceOptions,
  type ReferenceOption,
} from "../../client/store.ts";
import type {
  FieldTableColumnConfig,
  RecordFieldConfig,
  ReferenceFieldTableColumnConfig,
} from "../../client/views.ts";
import { recordFieldRef } from "../../client/views.ts";
import type { FieldValue } from "@dpeek/formless-storage";
import type { FieldSchema } from "@dpeek/formless-schema";
import {
  EMPTY_GENERATED_REFERENCE_OPTIONS,
  shouldUseAppReplicaReferenceOptions,
} from "./reference-field-options.ts";
import { StateMachineStateBadge } from "./state-machine-ui.tsx";
import { LegacyDisplayFieldAdapter } from "./legacy-record-field-adapter.tsx";
import {
  projectGeneratedDisplayFormlessUiField,
  type GeneratedFormlessUiRecordFieldOwner,
} from "./formless-ui-projection.ts";

type DisplayTableColumnConfig =
  | FieldTableColumnConfig
  | ReferenceFieldTableColumnConfig
  | (RecordFieldConfig & { display?: "editor" | "readOnly" | "hidden"; suffix?: string });

export function RecordFieldDisplay({
  column,
  fieldOwner,
  recordId,
}: {
  column: DisplayTableColumnConfig;
  fieldOwner: GeneratedFormlessUiRecordFieldOwner;
  recordId: string;
}) {
  const recordValue = useRecordFieldValue(recordId, recordFieldRef(column));

  if (column.field.type === "reference") {
    return (
      <RecordReferenceDisplay
        column={{ ...column, field: column.field }}
        fieldOwner={fieldOwner}
        recordId={recordId}
        recordValue={recordValue}
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

  if (isIconDisplayColumn(column)) {
    return <RecordIconDisplay column={column} recordValue={recordValue} />;
  }

  return (
    <LegacyDisplayFieldAdapter
      field={projectLegacyDisplayField(column, fieldOwner, recordId, recordValue)}
    />
  );
}

function projectLegacyDisplayField(
  column: DisplayTableColumnConfig,
  fieldOwner: GeneratedFormlessUiRecordFieldOwner,
  recordId: string,
  recordValue: FieldValue | undefined,
  referenceOptions: readonly ReferenceOption[] = [],
) {
  return projectGeneratedDisplayFormlessUiField({
    fieldConfig: column,
    occurrence: {
      owner: fieldOwner,
      placementId: column.fieldName,
    },
    recordId,
    recordValue,
    referenceOptions,
    surface: "table-cell",
  });
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

function isIconDisplayColumn(column: DisplayTableColumnConfig) {
  return (
    column.field.type === "text" && (column.editor === "icon" || column.field.format === "icon")
  );
}

function RecordReferenceDisplay({
  column,
  fieldOwner,
  recordId,
  recordValue,
}: {
  column: DisplayTableColumnConfig & { field: Extract<FieldSchema, { type: "reference" }> };
  fieldOwner: GeneratedFormlessUiRecordFieldOwner;
  recordId: string;
  recordValue: FieldValue | undefined;
}) {
  const { field } = column;
  if (!shouldUseAppReplicaReferenceOptions(field)) {
    return (
      <LegacyDisplayFieldAdapter
        field={projectLegacyDisplayField(
          column,
          fieldOwner,
          recordId,
          recordValue,
          EMPTY_GENERATED_REFERENCE_OPTIONS,
        )}
      />
    );
  }

  return (
    <LocalRecordReferenceDisplay
      column={column}
      fieldOwner={fieldOwner}
      recordId={recordId}
      recordValue={recordValue}
    />
  );
}

function LocalRecordReferenceDisplay({
  column,
  fieldOwner,
  recordId,
  recordValue,
}: {
  column: DisplayTableColumnConfig & { field: Extract<FieldSchema, { type: "reference" }> };
  fieldOwner: GeneratedFormlessUiRecordFieldOwner;
  recordId: string;
  recordValue: FieldValue | undefined;
}) {
  const { field } = column;
  const options = useReferenceOptions(field.to, field.displayField);

  return (
    <LegacyDisplayFieldAdapter
      field={projectLegacyDisplayField(column, fieldOwner, recordId, recordValue, options)}
    />
  );
}
