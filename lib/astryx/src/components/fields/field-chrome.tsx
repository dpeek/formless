import * as stylex from "@stylexjs/stylex";
import type { KeyboardEvent, ReactNode } from "react";
import { Field, type FieldStatusInput } from "@astryxdesign/core/Field";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import type { FieldValue, GeneratedFieldDraftInput } from "@dpeek/formless-schema";
import type {
  FormlessUiDisplayField,
  FormlessUiField,
  FormlessUiFieldIntentHandler,
  FormlessUiRecordField,
} from "../../formless-ui-contract.ts";
import type { AstryxInputDensity } from "../input-density.ts";

export type FormlessUiEditorField = Extract<FormlessUiField, { mode: "editor" }>;
export type FieldInputSize = "sm" | "md" | "lg";
export type ISODateInputValue =
  `${number}${number}${number}${number}-${number}${number}-${number}${number}`;

export function FieldChrome({
  children,
  field,
  inputId,
}: {
  children: ReactNode;
  field: FormlessUiField;
  inputId: string;
}) {
  return (
    <Field
      label={field.label}
      inputID={inputId}
      isLabelHidden={fieldLabelIsHidden(field)}
      isDisabled={field.access.kind === "disabled"}
      isRequired={fieldRequiredMarkerIsVisible(field)}
      status={fieldStatus(field)}
      width="100%"
    >
      {children}
    </Field>
  );
}

export function fieldChromeProps(field: FormlessUiEditorField) {
  return {
    label: field.label,
    isLabelHidden: fieldLabelIsHidden(field),
    description: fieldDescription(field),
    isRequired: fieldRequiredMarkerIsVisible(field),
    isDisabled: fieldInteractionIsDisabled(field),
    placeholder: field.control.label,
    status: fieldStatus(field),
    width: "100%",
  };
}

export function fieldStatus(field: FormlessUiField): FieldStatusInput | undefined {
  const error = field.errors?.[0];

  if (!error) {
    return undefined;
  }

  return {
    type: "error",
    message: error.message,
  };
}

export function fieldDescription(field: FormlessUiField) {
  return field.access.kind === "disabled" ? field.access.disabledReason : undefined;
}

export function fieldInteractionIsDisabled(field: FormlessUiField) {
  return (
    field.access.kind === "disabled" ||
    field.access.kind === "readOnly" ||
    field.access.kind === "system" ||
    field.access.kind === "stateMachine" ||
    Boolean(field.pending?.isPending)
  );
}

export function fieldIsReadOnly(field: FormlessUiEditorField) {
  return field.access.kind !== "editable";
}

export function fieldLabelIsHidden(field: FormlessUiField) {
  return field.labelVisibility === "hidden";
}

function fieldRequiredMarkerIsVisible(field: FormlessUiField) {
  return field.mode === "editor" && field.required && field.access.kind !== "stateMachine";
}

export function inputSize(field: FormlessUiField): FieldInputSize {
  const density = astryxDensity(field);

  if (density === "compact") {
    return "sm";
  }

  if (density === "comfortable") {
    return "lg";
  }

  return "md";
}

export function astryxDensity(field: FormlessUiField): AstryxInputDensity {
  return field.density === "compact" ? "compact" : "balanced";
}

export function editorFieldValue(field: FormlessUiEditorField): FieldValue | string {
  if (isRecordEditorField(field)) {
    if (field.rendererKind === "checkbox" || field.rendererKind === "completion-checkbox") {
      if (field.drafts.draftInput?.kind === "value") {
        return field.drafts.draftInput.value;
      }

      return field.drafts.draft === "true";
    }

    return field.drafts.draft;
  }

  if (field.draftInput !== undefined) {
    return field.draftInput.value;
  }

  if (field.control.controlKind === "checkbox") {
    return field.control.createDefaultChecked;
  }

  return field.value ?? field.control.createDefaultValue ?? "";
}

export function emitFieldDraftChange(
  field: FormlessUiEditorField,
  value: FieldValue | string,
  onIntent: FormlessUiFieldIntentHandler | undefined,
) {
  if (field.surface === "create") {
    void onIntent?.({
      type: "createDraftChange",
      fieldName: field.fieldName,
      fieldValue: draftInputFromValue(value),
    });
    return;
  }

  if (field.surface === "operation") {
    void onIntent?.({
      type: "operationDraftChange",
      inputName: field.inputName,
      inputValue: draftInputFromValue(value),
    });
    return;
  }

  if (typeof value === "string") {
    void onIntent?.({
      type: "recordEditorDraftChange",
      fieldName: field.fieldName,
      value,
    });
    return;
  }

  void onIntent?.({
    type: "recordDraftChange",
    fieldName: field.fieldName,
    fieldValue: draftInputFromValue(value),
  });
}

export function emitRecordUnitDraftChange(
  field: FormlessUiRecordField,
  unit: string,
  onIntent: FormlessUiFieldIntentHandler | undefined,
) {
  if (!field.valueUnit) {
    return;
  }

  void onIntent?.({
    type: "recordDraftChange",
    fieldName: field.valueUnit.unitFieldName,
    fieldValue: { kind: "input", value: unit },
  });
}

export function emitRecordDraftCommit(
  field: FormlessUiEditorField,
  onIntent: FormlessUiFieldIntentHandler | undefined,
) {
  if (!isRecordEditorField(field)) {
    return;
  }

  void onIntent?.({
    type: "recordDraftCommit",
    fieldName: field.fieldName,
    fieldValue: field.drafts.draftInput ?? draftInputFromValue(field.drafts.draft),
  });
}

export function emitRecordDraftValueCommit(
  field: FormlessUiEditorField,
  value: FieldValue | string,
  onIntent: FormlessUiFieldIntentHandler | undefined,
) {
  if (!isRecordEditorField(field) || field.commit !== "field-commit") {
    return;
  }

  void onIntent?.({
    type: "recordDraftCommit",
    fieldName: field.fieldName,
    fieldValue: draftInputFromValue(value),
  });
}

export function emitRecordDraftRevert(
  field: FormlessUiRecordField,
  onIntent: FormlessUiFieldIntentHandler | undefined,
) {
  void onIntent?.({
    type: "recordDraftRevert",
    fieldName: field.fieldName,
  });
}

export function recordCommitHandlers(
  field: FormlessUiEditorField,
  onIntent: FormlessUiFieldIntentHandler | undefined,
) {
  return {
    commitImmediate: (value: FieldValue | string) =>
      emitImmediateRecordFieldCommit(field, value, onIntent),
    commitInput: (value: FieldValue | string) => emitRecordFieldCommit(field, value, onIntent),
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>, value: FieldValue | string) => {
      if (event.key === "Enter") {
        event.preventDefault();
        emitRecordFieldCommit(field, value, onIntent);
      }
    },
  };
}

export function valueUnitCommitHandlers(
  field: FormlessUiRecordField,
  onIntent: FormlessUiFieldIntentHandler | undefined,
) {
  return {
    commitImmediate: (value: FieldValue | string) =>
      emitImmediateValueUnitCommit(field, draftInputFromValue(value), onIntent),
    commitInput: (value: FieldValue | string) =>
      emitValueUnitCommit(field, draftInputFromValue(value), field.drafts.unitDraftInput, onIntent),
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>, value: FieldValue | string) => {
      if (event.key === "Enter") {
        event.preventDefault();
        emitValueUnitCommit(
          field,
          draftInputFromValue(value),
          field.drafts.unitDraftInput,
          onIntent,
        );
      }
    },
  };
}

export function emitImmediateRecordFieldCommit(
  field: FormlessUiEditorField,
  value: FieldValue | string,
  onIntent: FormlessUiFieldIntentHandler | undefined,
) {
  if (!isRecordEditorField(field) || field.commit !== "immediate") {
    return;
  }

  emitRecordFieldCommit(field, value, onIntent);
}

export function emitRecordFieldCommit(
  field: FormlessUiEditorField,
  value: FieldValue | string,
  onIntent: FormlessUiFieldIntentHandler | undefined,
) {
  if (!isRecordEditorField(field)) {
    return;
  }

  return onIntent?.({
    type: "recordValueCommit",
    fieldName: field.fieldName,
    value: fieldValueFromDraftValue(field, value),
  });
}

export function emitRecordFieldRevert(
  field: FormlessUiEditorField,
  onIntent: FormlessUiFieldIntentHandler | undefined,
) {
  if (!isRecordEditorField(field)) {
    return;
  }

  void onIntent?.({
    type: "recordDraftRevert",
    fieldName: field.fieldName,
  });
}

export function emitImmediateValueUnitCommit(
  field: FormlessUiRecordField,
  fieldDraftInput: GeneratedFieldDraftInput,
  onIntent: FormlessUiFieldIntentHandler | undefined,
) {
  if (field.commit !== "immediate") {
    return;
  }

  emitValueUnitCommit(field, fieldDraftInput, field.drafts.unitDraftInput, onIntent);
}

export function emitValueUnitCommit(
  field: FormlessUiRecordField,
  fieldDraftInput: GeneratedFieldDraftInput,
  unitDraftInput: GeneratedFieldDraftInput | undefined,
  onIntent: FormlessUiFieldIntentHandler | undefined,
) {
  if (!field.valueUnit) {
    return;
  }

  void onIntent?.({
    type: "recordValueUnitCommit",
    fieldName: field.fieldName,
    unitFieldName: field.valueUnit.unitFieldName,
    commit: {
      fieldDraftInput,
      unitDraftInput: unitDraftInput ?? {
        kind: "input",
        value: field.drafts.unitDraft ?? "",
      },
    },
  });
}

export function emitMediaAssetSelect(
  field: FormlessUiEditorField,
  assetId: string,
  onIntent: FormlessUiFieldIntentHandler | undefined,
) {
  if (isRecordEditorField(field)) {
    void onIntent?.({
      type: "mediaAssetSelect",
      assetId,
      fieldName: field.fieldName,
    });
    return;
  }

  emitFieldDraftChange(field, assetId, onIntent);
}

export function draftInputFromValue(value: FieldValue | string): GeneratedFieldDraftInput {
  if (typeof value === "boolean" || typeof value === "number") {
    return { kind: "value", value };
  }

  return { kind: "input", value };
}

export function fieldValueFromDraftValue(
  field: FormlessUiRecordField,
  value: FieldValue | string,
): FieldValue {
  if (field.field.type === "boolean") {
    return value === true || value === "true";
  }

  if (field.field.type === "number") {
    if (typeof value === "number") {
      return value;
    }

    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }

  return String(value);
}

export function displayTextWithSuffix(field: FormlessUiDisplayField) {
  const suffix = field.formatting.suffix ?? field.suffix;

  return suffix ? `${field.formatting.displayValue} ${suffix}` : field.formatting.displayValue;
}

export function numberDraftIsInvalid(field: FormlessUiEditorField) {
  if (field.control.controlKind !== "number") {
    return false;
  }

  const value = formatInputValue(editorFieldValue(field)).trim();

  return value !== "" && !Number.isFinite(Number(value));
}

export function dateInputValue(value: string): ISODateInputValue | undefined {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? (value as ISODateInputValue) : undefined;
}

export function numberInputValue(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

export function defaultFormlessUiFieldInputId(field: FormlessUiField) {
  return `formless-ui-field-${field.recordId ? `${field.recordId}-` : ""}${field.inputName ?? field.fieldName}`;
}

export function formatInputValue(value: FieldValue | string | undefined) {
  return value === undefined ? "" : String(value);
}

export function isRecordEditorField(field: FormlessUiField): field is FormlessUiRecordField {
  return field.mode === "editor" && field.surface !== "create" && field.surface !== "operation";
}

export const fieldChromeStyles = stylex.create({
  displayValue: {
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    minHeight: spacingVars["--spacing-9"],
    minWidth: 0,
  },
});
