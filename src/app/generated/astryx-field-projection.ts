import type { ImageMediaAssetOption } from "@dpeek/formless-media/client";
import { generatedFieldDraftInput } from "@dpeek/formless-schema";
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
  type RecordUnionPresentationConfig,
} from "../../client/views.ts";
import { resolveIconCatalogSvg } from "../../shared/icon-catalog.ts";
import {
  type GeneratedCreateDraftSessionFacts,
  type GeneratedCreateDraftSessionState,
} from "./create-field-authoring.ts";
import { selectGeneratedFieldControl, type GeneratedFieldControl } from "./field-controls.ts";
import { selectGeneratedRecordFieldAuthoringAdapter } from "./field-ui-adapters.ts";
import { formatFieldDisplayValue } from "./format.ts";
import {
  generatedOperationDraftInput,
  type GeneratedOperationDraftFieldInput,
  type GeneratedOperationDraftSessionFacts,
  type GeneratedOperationDraftSessionState,
  type GeneratedOperationInputFieldConfig,
} from "./operation-field-authoring.ts";
import { generatedReferenceDisplayLabel } from "./reference-field-options.ts";
import {
  generatedRecordFieldEditorDraftFromUpdateDraftInput,
  generatedUpdateDraftInputFromEditorDraft,
  generatedUpdateDraftInputFromFieldValue,
  resolveGeneratedUpdateDraftPatchValues,
  type GeneratedUpdateDraftFieldInput,
  type GeneratedUpdateDraftResolution,
  type GeneratedUpdateDraftSessionFacts,
  type GeneratedUpdateDraftSessionState,
} from "./record-field-authoring.ts";
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
  errorsByFieldName?: Readonly<Record<string, GeneratedAstryxFieldErrorInput>>;
  mediaAssetOptionsByFieldName?: Readonly<Record<string, readonly ImageMediaAssetOption[]>>;
  mediaPreviewHrefByFieldName?: Readonly<Record<string, string | undefined>>;
  pendingByFieldName?: Readonly<Record<string, boolean>>;
  pendingLabelByFieldName?: Readonly<Record<string, string | undefined>>;
  presentation?: GeneratedRecordFieldControlPresentation;
  referenceOptionsByFieldName?: Readonly<Record<string, readonly GeneratedAstryxReferenceOption[]>>;
  session: Pick<GeneratedUpdateDraftSessionFacts, "fieldErrors" | "visibleFields">;
  showLabel?: boolean;
  state: GeneratedUpdateDraftSessionState;
  surface?: Exclude<AstryxFieldSurface, "create" | "public-action">;
};

export type ProjectGeneratedRecordAstryxFieldOptions = {
  canPatch: boolean;
  density?: AstryxFieldDensity | GeneratedRecordFieldControlDensity;
  draftInput?: GeneratedUpdateDraftFieldInput;
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

export type ProjectGeneratedOperationAstryxFieldsOptions = {
  density?: AstryxFieldDensity;
  errorsByFieldName?: Readonly<Record<string, GeneratedAstryxFieldErrorInput>>;
  pendingByFieldName?: Readonly<Record<string, boolean>>;
  pendingLabelByFieldName?: Readonly<Record<string, string | undefined>>;
  session: Pick<GeneratedOperationDraftSessionFacts, "fieldErrors" | "visibleFields">;
  state: GeneratedOperationDraftSessionState;
  surface?: Extract<AstryxFieldSurface, "public-action">;
};

export type ProjectGeneratedOperationAstryxFieldOptions = {
  density?: AstryxFieldDensity;
  error?: GeneratedAstryxFieldErrorInput;
  fieldConfig: GeneratedOperationInputFieldConfig;
  fieldId?: string;
  isPending?: boolean;
  pendingLabel?: string;
  state?: GeneratedOperationDraftSessionState;
  surface?: Extract<AstryxFieldSurface, "public-action">;
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

export type GeneratedUpdateAstryxFieldIntentHandlersOptions = {
  fields: readonly RecordFieldConfig[];
  onCommit: (fieldName: string, resolution: GeneratedUpdateDraftResolution) => void;
  onDraftChange: (
    fieldName: string,
    fieldValue: GeneratedUpdateDraftFieldInput | undefined,
  ) => void;
  onErrorChange?: (fieldName: string, message: string | null) => void;
  onOpenPicker?: (fieldName: string, picker: AstryxFieldPickerKind) => void;
  onUploadFile?: (fieldName: string, file: File) => void;
  state: GeneratedUpdateDraftSessionState;
  union?: RecordUnionPresentationConfig;
};

export type GeneratedOperationAstryxFieldIntentHandlersOptions = {
  fields: readonly GeneratedOperationInputFieldConfig[];
  onDraftChange: (inputName: string, inputValue: GeneratedOperationDraftFieldInput) => void;
  onErrorChange?: (inputName: string, message: string | null) => void;
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
  errorsByFieldName,
  mediaAssetOptionsByFieldName,
  mediaPreviewHrefByFieldName,
  pendingByFieldName,
  pendingLabelByFieldName,
  presentation,
  referenceOptionsByFieldName,
  session,
  showLabel,
  state,
  surface,
}: ProjectGeneratedRecordAstryxFieldsOptions): AstryxFieldData[] {
  return session.visibleFields.map((fieldConfig) =>
    projectGeneratedRecordAstryxField({
      canPatch,
      density,
      draftInput: state.draft.values[fieldConfig.fieldName],
      error:
        errorsByFieldName?.[fieldConfig.fieldName] ??
        session.fieldErrors[fieldConfig.fieldName]?.message,
      fieldConfig,
      isPending: pendingByFieldName?.[fieldConfig.fieldName],
      mediaAssetOptions: mediaAssetOptionsByFieldName?.[fieldConfig.fieldName],
      mediaPreviewHref: mediaPreviewHrefByFieldName?.[fieldConfig.fieldName],
      pendingLabel: pendingLabelByFieldName?.[fieldConfig.fieldName],
      presentation,
      recordValue: state.baselineValues[fieldConfig.fieldName],
      referenceOptions: referenceOptionsByFieldName?.[fieldConfig.fieldName],
      showLabel,
      surface,
    }),
  );
}

export function projectGeneratedRecordAstryxField({
  canPatch,
  density,
  draftInput,
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
  const draft = generatedRecordFieldEditorDraftFromUpdateDraftInput({
    draftInput,
    fieldConfig,
    numberFormat,
    recordValue,
  });
  const draftValue = selectRecordDraftValue({
    draft,
    draftInput,
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

export function projectGeneratedOperationAstryxFields({
  density,
  errorsByFieldName,
  pendingByFieldName,
  pendingLabelByFieldName,
  session,
  state,
  surface,
}: ProjectGeneratedOperationAstryxFieldsOptions): AstryxFieldEditorData[] {
  return session.visibleFields.map((fieldConfig) =>
    projectGeneratedOperationAstryxField({
      density,
      error:
        errorsByFieldName?.[fieldConfig.inputName] ??
        session.fieldErrors[fieldConfig.inputName]?.message,
      fieldConfig,
      isPending: pendingByFieldName?.[fieldConfig.inputName],
      pendingLabel: pendingLabelByFieldName?.[fieldConfig.inputName],
      state,
      surface,
    }),
  );
}

export function projectGeneratedOperationAstryxField({
  density = "comfortable",
  error,
  fieldConfig,
  fieldId,
  isPending = false,
  pendingLabel,
  state,
  surface = "public-action",
}: ProjectGeneratedOperationAstryxFieldOptions): AstryxFieldEditorData {
  const { editor, field, inputName, label } = fieldConfig;
  const fieldControl = selectGeneratedFieldControl({ editor, field, label });
  const draftValue = selectOperationDraftValue(fieldConfig, fieldControl, state);
  const kind = selectAstryxFieldKind(fieldControl, undefined);
  const base = projectAstryxFieldBase({
    accessMode: "editable",
    density,
    error,
    fieldControl,
    fieldId: fieldId ?? inputName,
    fieldName: inputName,
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
    referenceOptions: [],
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
      generatedFieldDraftInput(astryxValueToCreateDraftValue(value)),
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

export function createGeneratedOperationAstryxFieldIntentHandlers({
  fields,
  onDraftChange,
  onErrorChange,
}: GeneratedOperationAstryxFieldIntentHandlersOptions): GeneratedAstryxFieldIntentHandlers {
  const fieldsById = new Map(fields.map((fieldConfig) => [fieldConfig.inputName, fieldConfig]));

  function updateDraft(fieldId: string, value: AstryxFieldValue) {
    const fieldConfig = fieldsById.get(fieldId);

    if (!fieldConfig) {
      return;
    }

    onDraftChange(
      fieldConfig.inputName,
      generatedOperationDraftInput(astryxValueToOperationDraftValue(value)),
    );
    onErrorChange?.(fieldConfig.inputName, null);
  }

  return {
    onCommit: updateDraft,
    onDraftChange: updateDraft,
    onErrorChange: (fieldId, message) => {
      const fieldConfig = fieldsById.get(fieldId);

      if (fieldConfig) {
        onErrorChange?.(fieldConfig.inputName, message);
      }
    },
    onSelectOption: updateDraft,
  };
}

export function createGeneratedUpdateAstryxFieldIntentHandlers({
  fields,
  onCommit,
  onDraftChange,
  onErrorChange,
  onOpenPicker,
  onUploadFile,
  state,
  union,
}: GeneratedUpdateAstryxFieldIntentHandlersOptions): GeneratedAstryxFieldIntentHandlers {
  const fieldsById = new Map(fields.map((fieldConfig) => [fieldConfig.fieldName, fieldConfig]));

  function updateDraft(fieldId: string, value: AstryxFieldValue, options: { clearError: boolean }) {
    const fieldConfig = fieldsById.get(fieldId);

    if (!fieldConfig) {
      return undefined;
    }

    const fieldValue = astryxFieldValueToGeneratedUpdateDraftInput(fieldConfig, value);

    onDraftChange(fieldConfig.fieldName, fieldValue);

    if (options.clearError) {
      onErrorChange?.(fieldConfig.fieldName, null);
    }

    return { fieldConfig, fieldValue };
  }

  function commitDraft(fieldConfig: RecordFieldConfig, fieldValue: GeneratedUpdateDraftFieldInput) {
    const resolution = resolveGeneratedUpdateDraftPatchValues({
      baselineValues: state.baselineValues,
      draft: {
        values: {
          ...state.draft.values,
          [fieldConfig.fieldName]: fieldValue,
        },
      },
      fieldNames: [fieldConfig.fieldName],
      fields: Array.from(fields),
      union,
    });
    const fieldError =
      resolution.fieldErrors[fieldConfig.fieldName] ?? Object.values(resolution.fieldErrors)[0];

    if (fieldError !== undefined) {
      onErrorChange?.(fieldConfig.fieldName, fieldError.message);
      return;
    }

    onErrorChange?.(fieldConfig.fieldName, null);
    onCommit(fieldConfig.fieldName, resolution);
  }

  function updateAndMaybeCommit(fieldId: string, value: AstryxFieldValue) {
    const fieldConfig = fieldsById.get(fieldId);
    const shouldCommit = fieldConfig?.commit === "immediate";
    const draftUpdate = updateDraft(fieldId, value, { clearError: !shouldCommit });

    if (draftUpdate && shouldCommit) {
      commitDraft(draftUpdate.fieldConfig, draftUpdate.fieldValue);
    }
  }

  return {
    onCommit: (fieldId, value) => {
      const draftUpdate = updateDraft(fieldId, value, { clearError: false });

      if (draftUpdate) {
        commitDraft(draftUpdate.fieldConfig, draftUpdate.fieldValue);
      }
    },
    onDraftChange: (fieldId, value) => {
      updateAndMaybeCommit(fieldId, value);
    },
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
    onRevert: (fieldId) => {
      const fieldConfig = fieldsById.get(fieldId);

      if (fieldConfig) {
        onDraftChange(fieldConfig.fieldName, undefined);
        onErrorChange?.(fieldConfig.fieldName, null);
      }
    },
    onSelectOption: (fieldId, value) => {
      updateAndMaybeCommit(fieldId, value);
    },
    onUploadFile: (fieldId, file) => {
      const fieldConfig = fieldsById.get(fieldId);

      if (fieldConfig) {
        onUploadFile?.(fieldConfig.fieldName, file);
      }
    },
  };
}

function astryxValueToCreateDraftValue(value: AstryxFieldValue) {
  return value === null ? "" : value;
}

function astryxValueToOperationDraftValue(value: AstryxFieldValue) {
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

function selectOperationDraftValue(
  fieldConfig: GeneratedOperationInputFieldConfig,
  fieldControl: GeneratedFieldControl,
  state: GeneratedOperationDraftSessionState | undefined,
): AstryxFieldValue {
  const inputValue = state?.draft.values[fieldConfig.inputName]?.value;

  if (inputValue !== undefined) {
    return inputValue;
  }

  if (fieldControl.controlKind === "checkbox") {
    return false;
  }

  return "";
}

function selectRecordDraftValue({
  draft,
  draftInput,
  field,
  recordValue,
  rendererKind,
}: {
  draft: string;
  draftInput: GeneratedUpdateDraftFieldInput | undefined;
  field: FieldSchema;
  recordValue: FieldValue | undefined;
  rendererKind: GeneratedRecordFieldRendererKind;
}): AstryxFieldValue {
  if (rendererKind === "checkbox" || rendererKind === "completion-checkbox") {
    if (draftInput?.kind === "value" && typeof draftInput.value === "boolean") {
      return draftInput.value;
    }

    return draft === "true";
  }

  if (field.type === "number" && draftInput?.kind === "value") {
    return draftInput.value;
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

function astryxFieldValueToGeneratedUpdateDraftInput(
  fieldConfig: RecordFieldConfig,
  value: AstryxFieldValue,
): GeneratedUpdateDraftFieldInput {
  if (typeof value === "boolean" || typeof value === "number") {
    return generatedUpdateDraftInputFromFieldValue(value);
  }

  return generatedUpdateDraftInputFromEditorDraft({
    fieldConfig,
    numberFormat: fieldConfig.format ?? "plain",
    value: value === null ? "" : value,
  });
}
