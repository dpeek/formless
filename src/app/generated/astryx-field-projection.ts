import type { ImageMediaAssetOption } from "@dpeek/formless-media/client";
import type {
  CreateDraftFieldInput,
  FieldCommitPolicy,
  FieldSchema,
  TableColumnFormat,
} from "@dpeek/formless-schema";
import type { FieldValue } from "@dpeek/formless-storage";
import type {
  AstryxFieldAccessMode,
  AstryxFieldCommitPolicy,
  AstryxFieldData,
  AstryxFieldDensity,
  AstryxFieldDisplayData,
  AstryxFieldEditorData,
  AstryxFieldError,
  AstryxFieldIntentHandlers,
  AstryxFieldKind,
  AstryxFieldOption,
  AstryxFieldPickerKind,
  AstryxFieldPresentation,
  AstryxFieldSurface,
  AstryxFieldValue,
} from "../../../lib/astryx/src/field-contract.ts";
import {
  fieldLabel,
  recordFieldIsWritable,
  recordFieldRef,
  type CreateFieldConfig,
  type RecordFieldConfig,
} from "../../client/views.ts";
import { resolveIconCatalogSvg } from "../../shared/icon-catalog.ts";
import {
  generatedCreateDraftFieldInput,
  type GeneratedCreateDraftSessionFacts,
  type GeneratedCreateDraftSessionState,
} from "./create-field-authoring.ts";
import { selectGeneratedFieldControl, type GeneratedFieldControl } from "./field-controls.ts";
import { selectGeneratedRecordFieldAuthoringAdapter } from "./field-ui-adapters.ts";
import { formatFieldDisplayValue, inputValueToFieldValue } from "./format.ts";
import { generatedReferenceDisplayLabel } from "./reference-field-options.ts";
import { fieldValueToRecordFieldEditorInputValue } from "./record-field-authoring.ts";
import type {
  GeneratedRecordFieldControlDensity,
  GeneratedRecordFieldControlPresentation,
  GeneratedRecordFieldRendererKind,
} from "./record-field-renderer-model.ts";

export type GeneratedAstryxReferenceOption = {
  id: string;
  label: string;
};

export type GeneratedAstryxFieldErrorInput =
  | string
  | null
  | undefined
  | AstryxFieldError
  | readonly AstryxFieldError[];

export type ProjectGeneratedCreateAstryxFieldsOptions = {
  density?: AstryxFieldDensity;
  errorsByFieldName?: Readonly<Record<string, GeneratedAstryxFieldErrorInput>>;
  pendingByFieldName?: Readonly<Record<string, boolean>>;
  pendingLabelByFieldName?: Readonly<Record<string, string | undefined>>;
  referenceOptionsByFieldName?: Readonly<Record<string, readonly GeneratedAstryxReferenceOption[]>>;
  session: Pick<GeneratedCreateDraftSessionFacts, "fieldErrors" | "visibleFields">;
  state: GeneratedCreateDraftSessionState;
  surface?: Extract<AstryxFieldSurface, "create" | "public-action">;
};

export type ProjectGeneratedCreateAstryxFieldOptions = {
  density?: AstryxFieldDensity;
  error?: GeneratedAstryxFieldErrorInput;
  fieldConfig: CreateFieldConfig;
  fieldId?: string;
  isPending?: boolean;
  pendingLabel?: string;
  referenceOptions?: readonly GeneratedAstryxReferenceOption[];
  state?: GeneratedCreateDraftSessionState;
  surface?: Extract<AstryxFieldSurface, "create" | "public-action">;
};

export type ProjectGeneratedRecordAstryxFieldsOptions = {
  canPatch: boolean;
  density?: AstryxFieldDensity | GeneratedRecordFieldControlDensity;
  draftsByFieldName?: Readonly<Record<string, string | undefined>>;
  errorsByFieldName?: Readonly<Record<string, GeneratedAstryxFieldErrorInput>>;
  fields: readonly RecordFieldConfig[];
  mediaAssetOptionsByFieldName?: Readonly<Record<string, readonly ImageMediaAssetOption[]>>;
  mediaPreviewHrefByFieldName?: Readonly<Record<string, string | undefined>>;
  pendingByFieldName?: Readonly<Record<string, boolean>>;
  pendingLabelByFieldName?: Readonly<Record<string, string | undefined>>;
  presentation?: GeneratedRecordFieldControlPresentation;
  recordValues: Readonly<Record<string, FieldValue | undefined>>;
  referenceOptionsByFieldName?: Readonly<Record<string, readonly GeneratedAstryxReferenceOption[]>>;
  showLabel?: boolean;
  surface?: Exclude<AstryxFieldSurface, "create" | "public-action">;
};

export type ProjectGeneratedRecordAstryxFieldOptions = {
  canPatch: boolean;
  density?: AstryxFieldDensity | GeneratedRecordFieldControlDensity;
  draft?: string;
  error?: GeneratedAstryxFieldErrorInput;
  fieldConfig: RecordFieldConfig;
  fieldId?: string;
  isPending?: boolean;
  mediaAssetOptions?: readonly ImageMediaAssetOption[];
  mediaPreviewHref?: string;
  pendingLabel?: string;
  presentation?: GeneratedRecordFieldControlPresentation;
  recordValue: FieldValue | undefined;
  referenceOptions?: readonly GeneratedAstryxReferenceOption[];
  showLabel?: boolean;
  surface?: Exclude<AstryxFieldSurface, "create" | "public-action">;
};

export type GeneratedAstryxFieldIntentAdapter = {
  commitPolicy: AstryxFieldCommitPolicy;
  field: FieldSchema;
  fieldId: string;
  onCommit?: (value: FieldValue) => void;
  onDraftChange?: (value: AstryxFieldValue) => void;
  onErrorChange?: (message: string | null) => void;
  onMediaAssetSelect?: (assetId: string) => void;
  onOpenPicker?: (picker: AstryxFieldPickerKind) => void;
  onReferenceOptionSelect?: (value: string) => void;
  onRevert?: () => void;
  onUploadFile?: (file: File) => void;
};

export type GeneratedAstryxFieldIntentHandlers = AstryxFieldIntentHandlers & {
  onErrorChange?: (fieldId: string, message: string | null) => void;
  onSelectOption?: (fieldId: string, value: string) => void;
};

export type GeneratedCreateAstryxFieldIntentHandlersOptions = {
  fields: readonly CreateFieldConfig[];
  onDraftChange: (fieldName: string, fieldValue: CreateDraftFieldInput) => void;
  onErrorChange?: (fieldName: string, message: string | null) => void;
  onOpenPicker?: (fieldName: string, picker: AstryxFieldPickerKind) => void;
  onUploadFile?: (fieldName: string, file: File) => void;
};

export function projectGeneratedCreateAstryxFields({
  density,
  errorsByFieldName,
  pendingByFieldName,
  pendingLabelByFieldName,
  referenceOptionsByFieldName,
  session,
  state,
  surface,
}: ProjectGeneratedCreateAstryxFieldsOptions): AstryxFieldEditorData[] {
  return session.visibleFields.map((fieldConfig) =>
    projectGeneratedCreateAstryxField({
      density,
      error:
        errorsByFieldName?.[fieldConfig.fieldName] ??
        session.fieldErrors[fieldConfig.fieldName]?.message,
      fieldConfig,
      isPending: pendingByFieldName?.[fieldConfig.fieldName],
      pendingLabel: pendingLabelByFieldName?.[fieldConfig.fieldName],
      referenceOptions: referenceOptionsByFieldName?.[fieldConfig.fieldName],
      state,
      surface,
    }),
  );
}

export function projectGeneratedCreateAstryxField({
  density = "comfortable",
  error,
  fieldConfig,
  fieldId,
  isPending = false,
  pendingLabel,
  referenceOptions = [],
  state,
  surface = "create",
}: ProjectGeneratedCreateAstryxFieldOptions): AstryxFieldEditorData {
  const { editor, field, fieldName } = fieldConfig;
  const label = fieldLabel(fieldName, field);
  const fieldControl = selectGeneratedFieldControl({ editor, field, label });
  const draftValue = selectCreateDraftValue(fieldConfig, fieldControl, state);
  const kind = selectAstryxFieldKind(fieldControl, undefined);
  const base = projectAstryxFieldBase({
    accessMode: fieldConfig.stateMachine ? "state-machine" : "editable",
    density,
    error,
    fieldControl,
    fieldId: fieldId ?? fieldName,
    fieldName,
    isPending,
    kind,
    optionValue: draftValue,
    pendingLabel,
    presentation: projectAstryxFieldPresentation({
      draftValue,
      field,
      fieldControl,
      kind,
      mediaPreviewHref: undefined,
      tableFormat: "plain",
    }),
    referenceOptions,
    surface,
  });

  return {
    ...base,
    committedDisplayValue: "",
    commitPolicy: "submit",
    draftValue,
    mode: "editor",
  };
}

export function projectGeneratedRecordAstryxFields({
  canPatch,
  density,
  draftsByFieldName,
  errorsByFieldName,
  fields,
  mediaAssetOptionsByFieldName,
  mediaPreviewHrefByFieldName,
  pendingByFieldName,
  pendingLabelByFieldName,
  presentation,
  recordValues,
  referenceOptionsByFieldName,
  showLabel,
  surface,
}: ProjectGeneratedRecordAstryxFieldsOptions): AstryxFieldData[] {
  return fields.map((fieldConfig) =>
    projectGeneratedRecordAstryxField({
      canPatch,
      density,
      draft: draftsByFieldName?.[fieldConfig.fieldName],
      error: errorsByFieldName?.[fieldConfig.fieldName],
      fieldConfig,
      isPending: pendingByFieldName?.[fieldConfig.fieldName],
      mediaAssetOptions: mediaAssetOptionsByFieldName?.[fieldConfig.fieldName],
      mediaPreviewHref: mediaPreviewHrefByFieldName?.[fieldConfig.fieldName],
      pendingLabel: pendingLabelByFieldName?.[fieldConfig.fieldName],
      presentation,
      recordValue: recordValues[fieldConfig.fieldName],
      referenceOptions: referenceOptionsByFieldName?.[fieldConfig.fieldName],
      showLabel,
      surface,
    }),
  );
}

export function projectGeneratedRecordAstryxField({
  canPatch,
  density,
  draft,
  error,
  fieldConfig,
  fieldId,
  isPending = false,
  mediaAssetOptions = [],
  mediaPreviewHref,
  pendingLabel,
  presentation = "default",
  recordValue,
  referenceOptions = [],
  showLabel = false,
  surface = "record",
}: ProjectGeneratedRecordAstryxFieldOptions): AstryxFieldData {
  const { field, fieldName } = fieldConfig;
  const label = fieldConfig.label ?? fieldLabel(fieldName, field);
  const numberFormat = fieldConfig.format ?? "plain";
  const controlDensity = toGeneratedControlDensity(density);
  const { fieldControl, rendererKind } = selectGeneratedRecordFieldAuthoringAdapter({
    density: controlDensity,
    fieldConfig,
    label,
    presentation,
    showLabel,
  });
  const accessMode = selectRecordAccessMode(fieldConfig, canPatch);
  const kind = selectAstryxFieldKind(fieldControl, rendererKind);
  const draftValue = selectRecordDraftValue({
    draft:
      draft ??
      fieldValueToRecordFieldEditorInputValue(fieldConfig.field, recordValue, numberFormat),
    field,
    recordValue,
    rendererKind,
  });
  const displayValue = selectRecordDisplayValue({
    fieldConfig,
    recordValue,
    referenceOptions,
  });
  const base = projectAstryxFieldBase({
    accessMode,
    density: toAstryxDensity(density, "balanced"),
    error,
    fieldControl,
    fieldId: fieldId ?? fieldName,
    fieldName,
    isPending,
    kind,
    mediaAssetOptions,
    optionValue: draftValue,
    pendingLabel,
    presentation: projectAstryxFieldPresentation({
      draftValue,
      field,
      fieldControl,
      kind,
      mediaPreviewHref,
      recordValue,
      tableFormat: numberFormat,
    }),
    referenceOptions,
    surface,
  });

  if (accessMode === "system" || accessMode === "read-only" || accessMode === "state-machine") {
    return {
      ...base,
      displayValue,
      mode: "display",
      value: toAstryxFieldValue(recordValue),
    };
  }

  return {
    ...base,
    committedDisplayValue: displayValue,
    ...(recordValue === undefined ? {} : { committedValue: toAstryxFieldValue(recordValue) }),
    commitPolicy: toAstryxCommitPolicy(fieldConfig.commit),
    draftValue,
    mode: "editor",
  };
}

export function createGeneratedCreateAstryxFieldIntentHandlers({
  fields,
  onDraftChange,
  onErrorChange,
  onOpenPicker,
  onUploadFile,
}: GeneratedCreateAstryxFieldIntentHandlersOptions): GeneratedAstryxFieldIntentHandlers {
  const fieldsById = new Map(fields.map((fieldConfig) => [fieldConfig.fieldName, fieldConfig]));

  function updateDraft(fieldId: string, value: AstryxFieldValue) {
    const fieldConfig = fieldsById.get(fieldId);

    if (!fieldConfig) {
      return;
    }

    onDraftChange(
      fieldConfig.fieldName,
      generatedCreateDraftFieldInput(astryxValueToCreateDraftValue(value)),
    );
    onErrorChange?.(fieldConfig.fieldName, null);
  }

  return {
    onCommit: updateDraft,
    onDraftChange: updateDraft,
    onErrorChange: (fieldId, message) => {
      const fieldConfig = fieldsById.get(fieldId);

      if (fieldConfig) {
        onErrorChange?.(fieldConfig.fieldName, message);
      }
    },
    onOpenPicker: (fieldId, picker) => {
      const fieldConfig = fieldsById.get(fieldId);

      if (fieldConfig) {
        onOpenPicker?.(fieldConfig.fieldName, picker);
      }
    },
    onSelectOption: updateDraft,
    onUploadFile: (fieldId, file) => {
      const fieldConfig = fieldsById.get(fieldId);

      if (fieldConfig) {
        onUploadFile?.(fieldConfig.fieldName, file);
      }
    },
  };
}

export function createGeneratedAstryxFieldIntentHandlers(
  adapters: readonly GeneratedAstryxFieldIntentAdapter[],
): GeneratedAstryxFieldIntentHandlers {
  const adaptersByFieldId = new Map(adapters.map((adapter) => [adapter.fieldId, adapter]));

  return {
    onCommit: (fieldId, value) => {
      const adapter = adaptersByFieldId.get(fieldId);

      if (adapter) {
        commitGeneratedAstryxFieldValue(adapter, value);
      }
    },
    onDraftChange: (fieldId, value) => {
      const adapter = adaptersByFieldId.get(fieldId);

      if (!adapter) {
        return;
      }

      adapter.onDraftChange?.(value);

      if (adapter.commitPolicy === "immediate") {
        commitGeneratedAstryxFieldValue(adapter, value);
      }
    },
    onErrorChange: (fieldId, message) => {
      adaptersByFieldId.get(fieldId)?.onErrorChange?.(message);
    },
    onOpenPicker: (fieldId, picker) => {
      adaptersByFieldId.get(fieldId)?.onOpenPicker?.(picker);
    },
    onRevert: (fieldId) => {
      const adapter = adaptersByFieldId.get(fieldId);

      adapter?.onRevert?.();
      adapter?.onErrorChange?.(null);
    },
    onSelectOption: (fieldId, value) => {
      const adapter = adaptersByFieldId.get(fieldId);

      if (!adapter) {
        return;
      }

      adapter.onDraftChange?.(value);
      adapter.onReferenceOptionSelect?.(value);
      adapter.onMediaAssetSelect?.(value);

      if (
        adapter.commitPolicy === "immediate" &&
        adapter.onReferenceOptionSelect === undefined &&
        adapter.onMediaAssetSelect === undefined
      ) {
        commitGeneratedAstryxFieldValue(adapter, value);
      }
    },
    onUploadFile: (fieldId, file) => {
      adaptersByFieldId.get(fieldId)?.onUploadFile?.(file);
    },
  };
}

export function astryxFieldValueToGeneratedFieldValue(
  field: FieldSchema,
  value: AstryxFieldValue,
): FieldValue {
  if (field.type === "boolean" && typeof value === "boolean") {
    return value;
  }

  if (field.type === "number" && typeof value === "number") {
    return value;
  }

  return inputValueToFieldValue(field, value === null ? "" : String(value));
}

function astryxValueToCreateDraftValue(value: AstryxFieldValue) {
  return value === null ? "" : value;
}

function projectAstryxFieldBase({
  accessMode,
  density,
  error,
  fieldControl,
  fieldId,
  fieldName,
  isPending,
  kind,
  mediaAssetOptions = [],
  optionValue,
  pendingLabel,
  presentation,
  referenceOptions,
  surface,
}: {
  accessMode: AstryxFieldAccessMode;
  density: AstryxFieldDensity;
  error: GeneratedAstryxFieldErrorInput;
  fieldControl: GeneratedFieldControl;
  fieldId: string;
  fieldName: string;
  isPending: boolean;
  kind: AstryxFieldKind;
  mediaAssetOptions?: readonly ImageMediaAssetOption[];
  optionValue: AstryxFieldValue;
  pendingLabel: string | undefined;
  presentation: AstryxFieldPresentation | undefined;
  referenceOptions: readonly GeneratedAstryxReferenceOption[];
  surface: AstryxFieldSurface;
}): Omit<AstryxFieldDisplayData, "displayValue" | "mode" | "value"> {
  const errors = projectAstryxFieldErrors(fieldId, error);
  const options = projectAstryxOptions({
    fieldControl,
    mediaAssetOptions,
    optionValue,
    referenceOptions,
  });

  return {
    accessMode,
    density,
    ...(errors === undefined ? {} : { errors }),
    id: fieldId,
    isRequired: fieldControl.required,
    kind,
    label: fieldControl.label,
    name: fieldName,
    ...(options === undefined ? {} : { options }),
    ...(isPending
      ? { pending: { isPending, ...(pendingLabel ? { label: pendingLabel } : {}) } }
      : {}),
    ...(presentation === undefined ? {} : { presentation }),
    surface,
  };
}

function selectCreateDraftValue(
  fieldConfig: CreateFieldConfig,
  fieldControl: GeneratedFieldControl,
  state: GeneratedCreateDraftSessionState | undefined,
): AstryxFieldValue {
  const inputValue = state?.draft.values[fieldConfig.fieldName]?.value;

  if (inputValue !== undefined) {
    return inputValue;
  }

  if (fieldConfig.field.type === "enum" && fieldConfig.stateMachine) {
    return fieldConfig.stateMachine.initialState;
  }

  if (fieldControl.controlKind === "checkbox") {
    return fieldControl.createDefaultChecked;
  }

  return fieldControl.createDefaultValue ?? "";
}

function selectRecordDraftValue({
  draft,
  field,
  recordValue,
  rendererKind,
}: {
  draft: string;
  field: FieldSchema;
  recordValue: FieldValue | undefined;
  rendererKind: GeneratedRecordFieldRendererKind;
}): AstryxFieldValue {
  if (rendererKind === "checkbox" || rendererKind === "completion-checkbox") {
    return recordValue === true;
  }

  if (field.type === "number" && typeof recordValue === "number" && draft === String(recordValue)) {
    return recordValue;
  }

  return draft;
}

function selectAstryxFieldKind(
  fieldControl: GeneratedFieldControl,
  rendererKind: GeneratedRecordFieldRendererKind | undefined,
): AstryxFieldKind {
  if (rendererKind === "autosize-text") {
    return "text";
  }

  if (fieldControl.controlKind === "checkbox") {
    return "boolean";
  }

  if (fieldControl.controlKind === "date") {
    return "date";
  }

  if (fieldControl.controlKind === "number") {
    return "number";
  }

  if (fieldControl.kind === "enum") {
    return "enum";
  }

  if (fieldControl.kind === "reference") {
    return "reference";
  }

  if (fieldControl.controlKind === "markdown") {
    return "markdown";
  }

  if (fieldControl.controlKind === "icon") {
    return "source-icon";
  }

  if (fieldControl.controlKind === "color") {
    return "color";
  }

  if (fieldControl.controlKind === "image") {
    return "image";
  }

  if (fieldControl.controlKind === "media") {
    return "media";
  }

  if (fieldControl.controlKind === "textarea") {
    return "long-text";
  }

  return "text";
}

function projectAstryxOptions({
  fieldControl,
  mediaAssetOptions,
  optionValue,
  referenceOptions,
}: {
  fieldControl: GeneratedFieldControl;
  mediaAssetOptions: readonly ImageMediaAssetOption[];
  optionValue: AstryxFieldValue;
  referenceOptions: readonly GeneratedAstryxReferenceOption[];
}): readonly AstryxFieldOption[] | undefined {
  if (fieldControl.kind === "enum") {
    const selectedValue = stringOptionValue(optionValue);
    const selectedValueMissing =
      selectedValue !== "" && fieldControl.field.values[selectedValue] === undefined;

    return [
      ...(fieldControl.required ? [] : [{ label: "None", value: "" }]),
      ...(selectedValueMissing
        ? [{ isMissing: true, label: selectedValue, value: selectedValue }]
        : []),
      ...Object.entries(fieldControl.field.values).map(([value, option]) => ({
        label: option.label,
        value,
        ...(option.presentation?.color === undefined ? {} : { color: option.presentation.color }),
        ...(option.presentation?.icon === undefined
          ? {}
          : {
              icon: option.presentation.icon,
              ...(resolveIconCatalogSvg(option.presentation.icon) === undefined
                ? {}
                : { source: resolveIconCatalogSvg(option.presentation.icon) }),
            }),
      })),
    ];
  }

  if (fieldControl.kind === "reference") {
    const selectedValue = stringOptionValue(optionValue);
    const selectedValueMissing =
      selectedValue !== "" && !referenceOptions.some((option) => option.id === selectedValue);

    return [
      ...(selectedValueMissing
        ? [{ isMissing: true, label: selectedValue, value: selectedValue }]
        : []),
      ...referenceOptions.map((option) => ({ label: option.label, value: option.id })),
    ];
  }

  if (fieldControl.controlKind === "media") {
    return mediaAssetOptions.map((option) => ({
      detail: option.href,
      label: option.label,
      value: option.id,
    }));
  }

  return undefined;
}

function stringOptionValue(value: AstryxFieldValue) {
  return typeof value === "string" ? value : "";
}

function projectAstryxFieldPresentation({
  draftValue,
  field,
  fieldControl,
  kind,
  mediaPreviewHref,
  recordValue,
  tableFormat,
}: {
  draftValue: AstryxFieldValue;
  field: FieldSchema;
  fieldControl: GeneratedFieldControl;
  kind: AstryxFieldKind;
  mediaPreviewHref: string | undefined;
  recordValue?: FieldValue;
  tableFormat: TableColumnFormat;
}): AstryxFieldPresentation | undefined {
  const value = typeof recordValue === "string" ? recordValue : String(draftValue ?? "");
  const presentation: AstryxFieldPresentation = {};

  if (
    kind === "text" ||
    kind === "long-text" ||
    kind === "markdown" ||
    kind === "color" ||
    kind === "source-icon" ||
    kind === "image" ||
    kind === "media"
  ) {
    presentation.placeholder = fieldControl.label;
  }

  if (kind === "long-text") {
    presentation.maxLines = 4;
  }

  if (kind === "markdown") {
    presentation.maxLines = 8;
  }

  if (kind === "source-icon") {
    presentation.sourceIcon = value;
  }

  if (kind === "color") {
    presentation.colorValue = value;
  }

  if (kind === "image" || kind === "media") {
    if (mediaPreviewHref !== undefined) {
      presentation.mediaPreviewUrl = mediaPreviewHref;
    }
    presentation.mediaAlt = fieldControl.label;
  }

  if (field.type === "text" && field.format) {
    const format = textFieldFormatToAstryxFormat(field.format);

    if (format !== undefined) {
      presentation.format = format;
    }
  }

  if (field.type === "number" && (tableFormat === "currency" || tableFormat === "percent")) {
    presentation.format = tableFormat;
  }

  return Object.keys(presentation).length === 0 ? undefined : presentation;
}

function selectRecordDisplayValue({
  fieldConfig,
  recordValue,
  referenceOptions,
}: {
  fieldConfig: RecordFieldConfig;
  recordValue: FieldValue | undefined;
  referenceOptions: readonly GeneratedAstryxReferenceOption[];
}) {
  if (fieldConfig.field.type === "reference") {
    return generatedReferenceDisplayLabel(recordValue, referenceOptions);
  }

  return formatFieldDisplayValue(fieldConfig, recordValue);
}

function selectRecordAccessMode(
  fieldConfig: RecordFieldConfig,
  canPatch: boolean,
): AstryxFieldAccessMode {
  if (recordFieldRef(fieldConfig).kind === "system") {
    return "system";
  }

  if (fieldConfig.stateMachine !== undefined) {
    return "state-machine";
  }

  if (!recordFieldIsWritable(fieldConfig)) {
    return "read-only";
  }

  return canPatch ? "editable" : "disabled";
}

function toAstryxCommitPolicy(commitPolicy: FieldCommitPolicy): AstryxFieldCommitPolicy {
  return commitPolicy === "field-commit" ? "field" : "immediate";
}

function toAstryxDensity(
  density: AstryxFieldDensity | GeneratedRecordFieldControlDensity | undefined,
  fallback: AstryxFieldDensity,
): AstryxFieldDensity {
  if (density === "compact" || density === "balanced" || density === "comfortable") {
    return density;
  }

  return density === "default" ? "balanced" : fallback;
}

function toGeneratedControlDensity(
  density: AstryxFieldDensity | GeneratedRecordFieldControlDensity | undefined,
): GeneratedRecordFieldControlDensity {
  return density === "compact" ? "compact" : "default";
}

function toAstryxFieldValue(value: FieldValue | undefined): AstryxFieldValue {
  return value === undefined ? null : value;
}

function textFieldFormatToAstryxFormat(
  format: Extract<FieldSchema, { type: "text" }>["format"],
): AstryxFieldPresentation["format"] {
  if (format === "email" || format === "phone" || format === "href") {
    return format;
  }

  return undefined;
}

function projectAstryxFieldErrors(
  fieldId: string,
  error: GeneratedAstryxFieldErrorInput,
): readonly AstryxFieldError[] | undefined {
  if (error === undefined || error === null) {
    return undefined;
  }

  if (typeof error === "string") {
    return error === "" ? undefined : [{ id: `${fieldId}:error`, message: error }];
  }

  if (isAstryxFieldErrorList(error)) {
    return error.length === 0 ? undefined : error;
  }

  return [error];
}

function isAstryxFieldErrorList(
  error: AstryxFieldError | readonly AstryxFieldError[],
): error is readonly AstryxFieldError[] {
  return Array.isArray(error);
}

function commitGeneratedAstryxFieldValue(
  adapter: GeneratedAstryxFieldIntentAdapter,
  value: AstryxFieldValue,
) {
  const fieldValue = astryxFieldValueToGeneratedFieldValue(adapter.field, value);

  if (typeof fieldValue === "number" && !Number.isFinite(fieldValue)) {
    adapter.onErrorChange?.("Enter a finite number.");
    return;
  }

  adapter.onErrorChange?.(null);
  adapter.onCommit?.(fieldValue);
}
