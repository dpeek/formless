import { generatedFieldDraftInput } from "@dpeek/formless-schema";
import type { GeneratedFieldDraftInput, TableColumnFormat } from "@dpeek/formless-schema";
import type { FieldValue, RecordValues } from "@dpeek/formless-storage";
import type {
  FormlessUiFieldIntent,
  FormlessUiFieldIntentHandler,
} from "@dpeek/formless-astryx/contract";
import type { RecordFieldConfig, RecordUnionPresentationConfig } from "../../client/views.ts";
import {
  nextGeneratedCreateDraftSessionState,
  type GeneratedCreateDraftSessionState,
} from "./create-field-authoring.ts";
import {
  nextGeneratedOperationDraftSessionState,
  type GeneratedOperationDraftSessionState,
} from "./operation-field-authoring.ts";
import {
  fieldValueToRecordFieldEditorInputValue,
  generatedRecordFieldEditorDraftFromUpdateDraftInput,
  generatedRecordFieldUsesUpdateDraftResolver,
  generatedUpdateDraftInputFromEditorDraft,
  generatedUpdateDraftInputFromFieldValue,
  nextGeneratedUpdateDraftSessionState,
  resolveGeneratedUpdateDraftPatchValues,
  resolveGeneratedValueUnitUpdateDraftPatchValues,
  selectGeneratedRecordFieldPatchValues,
  type GeneratedUpdateDraftFieldInput,
  type GeneratedUpdateDraftResolution,
  type GeneratedUpdateDraftSessionState,
} from "./record-field-authoring.ts";
import { inputValueToFieldValue } from "./format.ts";

type CreateDraftChangeIntent = Extract<FormlessUiFieldIntent, { type: "createDraftChange" }>;
type OperationDraftChangeIntent = Extract<FormlessUiFieldIntent, { type: "operationDraftChange" }>;
type RecordDraftChangeIntent = Extract<FormlessUiFieldIntent, { type: "recordDraftChange" }>;
type RecordEditorDraftChangeIntent = Extract<
  FormlessUiFieldIntent,
  { type: "recordEditorDraftChange" }
>;
type RecordDraftRevertIntent = Extract<FormlessUiFieldIntent, { type: "recordDraftRevert" }>;
type RecordDraftCommitIntent = Extract<FormlessUiFieldIntent, { type: "recordDraftCommit" }>;
type RecordValueCommitIntent = Extract<FormlessUiFieldIntent, { type: "recordValueCommit" }>;
type RecordValueUnitCommitIntent = Extract<
  FormlessUiFieldIntent,
  { type: "recordValueUnitCommit" }
>;
type FieldErrorChangeIntent = Extract<FormlessUiFieldIntent, { type: "fieldErrorChange" }>;
type IconDialogDraftChangeIntent = Extract<
  FormlessUiFieldIntent,
  { type: "iconDialogDraftChange" }
>;
type IconDialogOpenChangeIntent = Extract<FormlessUiFieldIntent, { type: "iconDialogOpenChange" }>;
type IconDialogCancelIntent = Extract<FormlessUiFieldIntent, { type: "iconDialogCancel" }>;
type IconDialogSaveIntent = Extract<FormlessUiFieldIntent, { type: "iconDialogSave" }>;
type MediaAssetSelectIntent = Extract<FormlessUiFieldIntent, { type: "mediaAssetSelect" }>;
type MediaFileSelectIntent = Extract<FormlessUiFieldIntent, { type: "mediaFileSelect" }>;
type StateTransitionInvokeIntent = Extract<
  FormlessUiFieldIntent,
  { type: "stateTransitionInvoke" }
>;

export type GeneratedFormlessUiFieldErrorChange = {
  fieldName: string;
  message: string | null;
};

export type GeneratedFormlessUiCreateDraftChange = {
  fieldName: string;
  fieldValue: GeneratedFieldDraftInput;
};

export type GeneratedFormlessUiOperationDraftChange = {
  inputName: string;
  inputValue: GeneratedFieldDraftInput | undefined;
};

export type GeneratedFormlessUiRecordDraftChange = {
  fieldName: string;
  fieldValue: GeneratedUpdateDraftFieldInput | undefined;
};

export type GeneratedFormlessUiEditorDraftChange = {
  fieldName: string;
  value: string;
};

export type GeneratedFormlessUiIconDialogDraftChange = {
  fieldName: string;
  value: string;
};

export type GeneratedFormlessUiIconDialogOpenChange = {
  fieldName: string;
  open: boolean;
};

export type GeneratedFormlessUiMediaFileSelect = {
  fieldName: string;
  file: File | undefined;
};

export type GeneratedFormlessUiCreateDraftChangeResult = {
  kind: "createDraftChange";
  draftChange: GeneratedFormlessUiCreateDraftChange;
  fieldErrorChange: GeneratedFormlessUiFieldErrorChange | undefined;
  state: GeneratedCreateDraftSessionState | undefined;
};

export type GeneratedFormlessUiOperationDraftChangeResult = {
  kind: "operationDraftChange";
  draftChange: GeneratedFormlessUiOperationDraftChange;
  fieldErrorChange: GeneratedFormlessUiFieldErrorChange | undefined;
  state: GeneratedOperationDraftSessionState | undefined;
};

export type GeneratedFormlessUiRecordDraftChangeResult = {
  additionalDraftChanges?: readonly GeneratedFormlessUiRecordDraftChange[];
  kind: "recordDraftChange" | "recordEditorDraftChange" | "recordDraftRevert";
  draftChange: GeneratedFormlessUiRecordDraftChange;
  editorDraftChange: GeneratedFormlessUiEditorDraftChange | undefined;
  fieldErrorChange: GeneratedFormlessUiFieldErrorChange | undefined;
  state: GeneratedUpdateDraftSessionState | undefined;
};

export type GeneratedFormlessUiRecordValueCommitResult = {
  kind: "recordValueCommit";
  draftChange: GeneratedFormlessUiRecordDraftChange | undefined;
  fieldName: string;
  fieldErrorChange: GeneratedFormlessUiFieldErrorChange | undefined;
  noop: boolean;
  patchValues: Partial<RecordValues>;
  resolution: GeneratedUpdateDraftResolution | undefined;
};

export type GeneratedFormlessUiRecordValueUnitCommitResult = {
  kind: "recordValueUnitCommit";
  draftChange: GeneratedFormlessUiRecordDraftChange;
  fieldName: string;
  fieldErrorChange: GeneratedFormlessUiFieldErrorChange | undefined;
  noop: boolean;
  patchValues: Partial<RecordValues>;
  resolution: GeneratedUpdateDraftResolution;
};

export type GeneratedFormlessUiFieldErrorChangeResult = {
  kind: "fieldErrorChange";
  fieldErrorChange: GeneratedFormlessUiFieldErrorChange;
};

export type GeneratedFormlessUiIconDialogDraftChangeResult = {
  kind: "iconDialogDraftChange";
  iconDialogDraftChange: GeneratedFormlessUiIconDialogDraftChange;
};

export type GeneratedFormlessUiIconDialogOpenChangeResult = {
  kind: "iconDialogOpenChange";
  iconDialogOpenChange: GeneratedFormlessUiIconDialogOpenChange;
};

export type GeneratedFormlessUiIconDialogCancelResult = {
  kind: "iconDialogCancel";
  iconDialogDraftChange: GeneratedFormlessUiIconDialogDraftChange;
  iconDialogOpenChange: GeneratedFormlessUiIconDialogOpenChange;
};

export type GeneratedFormlessUiIconDialogSaveResult = {
  kind: "iconDialogSave";
  commit: GeneratedFormlessUiRecordValueCommitResult;
  onCommitSuccess:
    | {
        editorDraftChange: GeneratedFormlessUiEditorDraftChange;
        iconDialogOpenChange: GeneratedFormlessUiIconDialogOpenChange;
      }
    | undefined;
};

export type GeneratedFormlessUiMediaAssetSelectResult = {
  kind: "mediaAssetSelect";
  commit: GeneratedFormlessUiRecordValueCommitResult | undefined;
  editorDraftChange: GeneratedFormlessUiEditorDraftChange | undefined;
  reason: string | undefined;
};

export type GeneratedFormlessUiMediaFileSelectResult = {
  kind: "mediaFileSelect";
  fileSelect: GeneratedFormlessUiMediaFileSelect;
};

export type GeneratedFormlessUiStateTransitionDeferredResult = {
  kind: "stateTransitionDeferred";
  intent: StateTransitionInvokeIntent;
  reason: string;
};

export type GeneratedFormlessUiUnsupportedIntentResult = {
  kind: "unsupported";
  intentType: FormlessUiFieldIntent["type"];
  reason: string;
};

export type GeneratedFormlessUiFieldIntentResult =
  | GeneratedFormlessUiCreateDraftChangeResult
  | GeneratedFormlessUiFieldErrorChangeResult
  | GeneratedFormlessUiIconDialogCancelResult
  | GeneratedFormlessUiIconDialogDraftChangeResult
  | GeneratedFormlessUiIconDialogOpenChangeResult
  | GeneratedFormlessUiIconDialogSaveResult
  | GeneratedFormlessUiMediaAssetSelectResult
  | GeneratedFormlessUiMediaFileSelectResult
  | GeneratedFormlessUiOperationDraftChangeResult
  | GeneratedFormlessUiRecordDraftChangeResult
  | GeneratedFormlessUiRecordValueCommitResult
  | GeneratedFormlessUiRecordValueUnitCommitResult
  | GeneratedFormlessUiStateTransitionDeferredResult
  | GeneratedFormlessUiUnsupportedIntentResult;

export type AdaptGeneratedCreateFormlessUiDraftChangeOptions = {
  clearFieldError?: boolean;
  state?: GeneratedCreateDraftSessionState;
};

export type AdaptGeneratedOperationFormlessUiDraftChangeOptions = {
  clearFieldError?: boolean;
  state?: GeneratedOperationDraftSessionState;
};

export type AdaptGeneratedRecordFormlessUiIntentOptions = {
  editorDraftByFieldName?: Readonly<Record<string, string | undefined>>;
  fields: readonly RecordFieldConfig[];
  iconDialogDraftByFieldName?: Readonly<Record<string, string | undefined>>;
  mediaEditorModeByFieldName?: Readonly<Record<string, "asset" | "url" | undefined>>;
  numberFormatByFieldName?: Readonly<Record<string, TableColumnFormat | undefined>>;
  recordDraftByFieldName?: Readonly<Record<string, string | undefined>>;
  state: GeneratedUpdateDraftSessionState;
  union?: RecordUnionPresentationConfig;
};

export type AdaptGeneratedFormlessUiFieldIntentOptions = {
  create?: AdaptGeneratedCreateFormlessUiDraftChangeOptions;
  operation?: AdaptGeneratedOperationFormlessUiDraftChangeOptions;
  record?: AdaptGeneratedRecordFormlessUiIntentOptions;
};

export type GeneratedFormlessUiFieldIntentCallbacks = {
  onCreateDraftChange?: (
    change: GeneratedFormlessUiCreateDraftChange,
    state: GeneratedCreateDraftSessionState | undefined,
  ) => void;
  onFieldErrorChange?: (change: GeneratedFormlessUiFieldErrorChange) => void;
  onIconDialogDraftChange?: (change: GeneratedFormlessUiIconDialogDraftChange) => void;
  onIconDialogOpenChange?: (change: GeneratedFormlessUiIconDialogOpenChange) => void;
  onMediaFileSelect?: (select: GeneratedFormlessUiMediaFileSelect) => void;
  onOperationDraftChange?: (
    change: GeneratedFormlessUiOperationDraftChange,
    state: GeneratedOperationDraftSessionState | undefined,
  ) => void;
  onRecordDraftChange?: (
    change: GeneratedFormlessUiRecordDraftChange,
    state: GeneratedUpdateDraftSessionState | undefined,
  ) => void;
  onRecordEditorDraftChange?: (change: GeneratedFormlessUiEditorDraftChange) => void;
  onRecordPatchResolve?: (
    fieldName: string,
    result:
      | GeneratedFormlessUiRecordValueCommitResult
      | GeneratedFormlessUiRecordValueUnitCommitResult,
  ) => void;
  onUnsupportedIntent?: (
    result:
      | GeneratedFormlessUiStateTransitionDeferredResult
      | GeneratedFormlessUiUnsupportedIntentResult,
  ) => void;
};

export function adaptGeneratedCreateFormlessUiDraftChange(
  intent: CreateDraftChangeIntent,
  options: AdaptGeneratedCreateFormlessUiDraftChangeOptions = {},
): GeneratedFormlessUiCreateDraftChangeResult {
  const draftChange = {
    fieldName: intent.fieldName,
    fieldValue: intent.fieldValue,
  };

  return {
    kind: "createDraftChange",
    draftChange,
    fieldErrorChange:
      options.clearFieldError === false ? undefined : clearFieldError(intent.fieldName),
    state:
      options.state === undefined
        ? undefined
        : nextGeneratedCreateDraftSessionState({
            fieldName: intent.fieldName,
            fieldValue: intent.fieldValue,
            state: options.state,
          }),
  };
}

export function adaptGeneratedOperationFormlessUiDraftChange(
  intent: OperationDraftChangeIntent,
  options: AdaptGeneratedOperationFormlessUiDraftChangeOptions = {},
): GeneratedFormlessUiOperationDraftChangeResult {
  const draftChange = {
    inputName: intent.inputName,
    inputValue: intent.inputValue,
  };

  return {
    kind: "operationDraftChange",
    draftChange,
    fieldErrorChange:
      options.clearFieldError === false ? undefined : clearFieldError(intent.inputName),
    state:
      options.state === undefined
        ? undefined
        : nextGeneratedOperationDraftSessionState({
            inputName: intent.inputName,
            inputValue: intent.inputValue,
            state: options.state,
          }),
  };
}

export function adaptGeneratedRecordFormlessUiDraftChange(
  intent: RecordDraftChangeIntent,
  options: AdaptGeneratedRecordFormlessUiIntentOptions,
): GeneratedFormlessUiRecordDraftChangeResult {
  return recordDraftChangeResult({
    draftChange: {
      fieldName: intent.fieldName,
      fieldValue: intent.fieldValue,
    },
    editorDraftChange: undefined,
    fieldErrorChange: undefined,
    kind: "recordDraftChange",
    state: options.state,
  });
}

export function adaptGeneratedRecordEditorFormlessUiDraftChange(
  intent: RecordEditorDraftChangeIntent,
  options: AdaptGeneratedRecordFormlessUiIntentOptions,
): GeneratedFormlessUiFieldIntentResult {
  const fieldConfig = findRecordFieldConfig(options.fields, intent.fieldName);

  if (fieldConfig === undefined) {
    return unsupportedIntent(intent, `Record field "${intent.fieldName}" is not available.`);
  }

  const fieldValue = generatedUpdateDraftInputFromEditorDraft({
    fieldConfig,
    numberFormat: numberFormatForField(fieldConfig, options),
    value: intent.value,
  });

  return recordDraftChangeResult({
    draftChange: {
      fieldName: intent.fieldName,
      fieldValue,
    },
    editorDraftChange: {
      fieldName: intent.fieldName,
      value: intent.value,
    },
    fieldErrorChange: undefined,
    kind: "recordEditorDraftChange",
    state: options.state,
  });
}

export function adaptGeneratedRecordFormlessUiDraftRevert(
  intent: RecordDraftRevertIntent,
  options: AdaptGeneratedRecordFormlessUiIntentOptions,
): GeneratedFormlessUiFieldIntentResult {
  const fieldConfig = findRecordFieldConfig(options.fields, intent.fieldName);

  if (fieldConfig === undefined) {
    return unsupportedIntent(intent, `Record field "${intent.fieldName}" is not available.`);
  }

  const additionalDraftChanges = fieldConfig.valueUnit
    ? [{ fieldName: fieldConfig.valueUnit.unitFieldName, fieldValue: undefined }]
    : [];
  const state = additionalDraftChanges.reduce(
    (nextState, change) =>
      nextGeneratedUpdateDraftSessionState({
        fieldName: change.fieldName,
        fieldValue: change.fieldValue,
        state: nextState,
      }),
    options.state,
  );

  return recordDraftChangeResult({
    additionalDraftChanges,
    draftChange: {
      fieldName: intent.fieldName,
      fieldValue: undefined,
    },
    editorDraftChange: {
      fieldName: intent.fieldName,
      value: recordDraftForField(fieldConfig, options),
    },
    fieldErrorChange: undefined,
    kind: "recordDraftRevert",
    state,
  });
}

export function adaptGeneratedRecordFormlessUiDraftCommit(
  intent: RecordDraftCommitIntent,
  options: AdaptGeneratedRecordFormlessUiIntentOptions,
): GeneratedFormlessUiRecordValueCommitResult | GeneratedFormlessUiUnsupportedIntentResult {
  const fieldConfig = findRecordFieldConfig(options.fields, intent.fieldName);

  if (fieldConfig === undefined) {
    return unsupportedIntent(intent, `Record field "${intent.fieldName}" is not available.`);
  }

  if (!generatedRecordFieldUsesUpdateDraftResolver(fieldConfig)) {
    return recordValueCommitResult({
      fieldConfig,
      options,
      value: intent.fieldValue.value,
    });
  }

  return recordDraftCommitResult({ fieldConfig, fieldValue: intent.fieldValue, options });
}

export function adaptGeneratedRecordFormlessUiValueCommit(
  intent: RecordValueCommitIntent,
  options: AdaptGeneratedRecordFormlessUiIntentOptions,
): GeneratedFormlessUiFieldIntentResult {
  const fieldConfig = findRecordFieldConfig(options.fields, intent.fieldName);

  if (fieldConfig === undefined) {
    return unsupportedIntent(intent, `Record field "${intent.fieldName}" is not available.`);
  }

  return recordValueCommitResult({
    fieldConfig,
    options,
    value: intent.value,
  });
}

export function adaptGeneratedRecordFormlessUiValueUnitCommit(
  intent: RecordValueUnitCommitIntent,
  options: AdaptGeneratedRecordFormlessUiIntentOptions,
): GeneratedFormlessUiFieldIntentResult {
  const fieldConfig = findRecordFieldConfig(options.fields, intent.fieldName);

  if (fieldConfig === undefined) {
    return unsupportedIntent(intent, `Record field "${intent.fieldName}" is not available.`);
  }

  if (fieldConfig.valueUnit === undefined) {
    return unsupportedIntent(intent, `Record field "${intent.fieldName}" has no value unit.`);
  }

  if (fieldConfig.valueUnit.unitFieldName !== intent.unitFieldName) {
    return unsupportedIntent(
      intent,
      `Record field "${intent.fieldName}" uses unit field "${fieldConfig.valueUnit.unitFieldName}".`,
    );
  }

  const resolution = resolveGeneratedValueUnitUpdateDraftPatchValues({
    baselineValues: options.state.baselineValues,
    draft: { values: { ...options.state.draft.values } },
    fieldConfig: {
      ...fieldConfig,
      valueUnit: fieldConfig.valueUnit,
    },
    fieldDraftInput: intent.commit.fieldDraftInput,
    fields: Array.from(options.fields),
    union: options.union,
    unitDraftInput: intent.commit.unitDraftInput,
  });
  const fieldError = selectFieldError(resolution, intent.fieldName);

  return {
    kind: "recordValueUnitCommit",
    draftChange: {
      fieldName: intent.fieldName,
      fieldValue: intent.commit.fieldDraftInput,
    },
    fieldName: intent.fieldName,
    fieldErrorChange:
      fieldError === undefined ? undefined : fieldErrorChange(intent.fieldName, fieldError.message),
    noop: fieldError === undefined && Object.keys(resolution.patchValues).length === 0,
    patchValues: fieldError === undefined ? resolution.patchValues : {},
    resolution,
  };
}

export function adaptGeneratedFormlessUiFieldErrorChange(
  intent: FieldErrorChangeIntent,
): GeneratedFormlessUiFieldErrorChangeResult {
  return {
    kind: "fieldErrorChange",
    fieldErrorChange: fieldErrorChange(intent.fieldName, intent.message),
  };
}

export function adaptGeneratedFormlessUiIconDialogDraftChange(
  intent: IconDialogDraftChangeIntent,
): GeneratedFormlessUiIconDialogDraftChangeResult {
  return {
    kind: "iconDialogDraftChange",
    iconDialogDraftChange: {
      fieldName: intent.fieldName,
      value: intent.value,
    },
  };
}

export function adaptGeneratedFormlessUiIconDialogOpenChange(
  intent: IconDialogOpenChangeIntent,
): GeneratedFormlessUiIconDialogOpenChangeResult {
  return {
    kind: "iconDialogOpenChange",
    iconDialogOpenChange: {
      fieldName: intent.fieldName,
      open: intent.open,
    },
  };
}

export function adaptGeneratedFormlessUiIconDialogCancel(
  intent: IconDialogCancelIntent,
  options: AdaptGeneratedRecordFormlessUiIntentOptions,
): GeneratedFormlessUiFieldIntentResult {
  const fieldConfig = findRecordFieldConfig(options.fields, intent.fieldName);

  if (fieldConfig === undefined) {
    return unsupportedIntent(intent, `Record field "${intent.fieldName}" is not available.`);
  }

  return {
    kind: "iconDialogCancel",
    iconDialogDraftChange: {
      fieldName: intent.fieldName,
      value: recordDraftForField(fieldConfig, options),
    },
    iconDialogOpenChange: {
      fieldName: intent.fieldName,
      open: false,
    },
  };
}

export function adaptGeneratedFormlessUiIconDialogSave(
  intent: IconDialogSaveIntent,
  options: AdaptGeneratedRecordFormlessUiIntentOptions,
): GeneratedFormlessUiFieldIntentResult {
  const fieldConfig = findRecordFieldConfig(options.fields, intent.fieldName);

  if (fieldConfig === undefined) {
    return unsupportedIntent(intent, `Record field "${intent.fieldName}" is not available.`);
  }

  const dialogDraft = iconDialogDraftForField(fieldConfig, options);
  const commit = recordValueCommitResult({
    fieldConfig,
    options,
    value: inputValueToFieldValue(fieldConfig.field, dialogDraft),
  });

  return {
    kind: "iconDialogSave",
    commit,
    onCommitSuccess:
      commit.fieldErrorChange === undefined
        ? {
            editorDraftChange: {
              fieldName: intent.fieldName,
              value: dialogDraft,
            },
            iconDialogOpenChange: {
              fieldName: intent.fieldName,
              open: false,
            },
          }
        : undefined,
  };
}

export function adaptGeneratedFormlessUiMediaAssetSelect(
  intent: MediaAssetSelectIntent,
  options: AdaptGeneratedRecordFormlessUiIntentOptions,
): GeneratedFormlessUiFieldIntentResult {
  const fieldConfig = findRecordFieldConfig(options.fields, intent.fieldName);

  if (fieldConfig === undefined) {
    return unsupportedIntent(intent, `Record field "${intent.fieldName}" is not available.`);
  }

  const mediaEditorMode = options.mediaEditorModeByFieldName?.[intent.fieldName] ?? "asset";

  if (mediaEditorMode !== "asset") {
    return {
      kind: "mediaAssetSelect",
      commit: undefined,
      editorDraftChange: undefined,
      reason: "Media asset selection is ignored for URL-mode media fields.",
    };
  }

  return {
    kind: "mediaAssetSelect",
    commit: recordValueCommitResult({
      fieldConfig,
      options,
      value: intent.assetId,
    }),
    editorDraftChange: {
      fieldName: intent.fieldName,
      value: intent.assetId,
    },
    reason: undefined,
  };
}

export function adaptGeneratedFormlessUiMediaFileSelect(
  intent: MediaFileSelectIntent,
): GeneratedFormlessUiMediaFileSelectResult {
  return {
    kind: "mediaFileSelect",
    fileSelect: {
      fieldName: intent.fieldName,
      file: intent.file,
    },
  };
}

export function adaptGeneratedFormlessUiStateTransitionInvoke(
  intent: StateTransitionInvokeIntent,
): GeneratedFormlessUiStateTransitionDeferredResult {
  return {
    kind: "stateTransitionDeferred",
    intent,
    reason:
      "State transition execution requires the generated operation-control binding; the field intent contract carries field intent facts only.",
  };
}

export function adaptGeneratedFormlessUiFieldIntent(
  intent: FormlessUiFieldIntent,
  options: AdaptGeneratedFormlessUiFieldIntentOptions = {},
): GeneratedFormlessUiFieldIntentResult {
  switch (intent.type) {
    case "createDraftChange":
      return adaptGeneratedCreateFormlessUiDraftChange(intent, options.create);
    case "operationDraftChange":
      return adaptGeneratedOperationFormlessUiDraftChange(intent, options.operation);
    case "recordDraftChange":
      return options.record === undefined
        ? missingRecordContext(intent)
        : adaptGeneratedRecordFormlessUiDraftChange(intent, options.record);
    case "recordEditorDraftChange":
      return options.record === undefined
        ? missingRecordContext(intent)
        : adaptGeneratedRecordEditorFormlessUiDraftChange(intent, options.record);
    case "recordDraftRevert":
      return options.record === undefined
        ? missingRecordContext(intent)
        : adaptGeneratedRecordFormlessUiDraftRevert(intent, options.record);
    case "recordDraftCommit":
      return options.record === undefined
        ? missingRecordContext(intent)
        : adaptGeneratedRecordFormlessUiDraftCommit(intent, options.record);
    case "recordValueCommit":
      return options.record === undefined
        ? missingRecordContext(intent)
        : adaptGeneratedRecordFormlessUiValueCommit(intent, options.record);
    case "recordValueUnitCommit":
      return options.record === undefined
        ? missingRecordContext(intent)
        : adaptGeneratedRecordFormlessUiValueUnitCommit(intent, options.record);
    case "fieldErrorChange":
      return adaptGeneratedFormlessUiFieldErrorChange(intent);
    case "iconDialogDraftChange":
      return adaptGeneratedFormlessUiIconDialogDraftChange(intent);
    case "iconDialogOpenChange":
      return adaptGeneratedFormlessUiIconDialogOpenChange(intent);
    case "iconDialogCancel":
      return options.record === undefined
        ? missingRecordContext(intent)
        : adaptGeneratedFormlessUiIconDialogCancel(intent, options.record);
    case "iconDialogSave":
      return options.record === undefined
        ? missingRecordContext(intent)
        : adaptGeneratedFormlessUiIconDialogSave(intent, options.record);
    case "mediaAssetSelect":
      return options.record === undefined
        ? missingRecordContext(intent)
        : adaptGeneratedFormlessUiMediaAssetSelect(intent, options.record);
    case "mediaFileSelect":
      return adaptGeneratedFormlessUiMediaFileSelect(intent);
    case "stateTransitionInvoke":
      return adaptGeneratedFormlessUiStateTransitionInvoke(intent);
  }
}

export function createGeneratedFormlessUiFieldIntentHandler({
  callbacks,
  options,
}: {
  callbacks: GeneratedFormlessUiFieldIntentCallbacks;
  options?: AdaptGeneratedFormlessUiFieldIntentOptions;
}): FormlessUiFieldIntentHandler {
  return (intent) => {
    applyGeneratedFormlessUiFieldIntentResult(
      adaptGeneratedFormlessUiFieldIntent(intent, options),
      callbacks,
    );
  };
}

export function applyGeneratedFormlessUiFieldIntentResult(
  result: GeneratedFormlessUiFieldIntentResult,
  callbacks: GeneratedFormlessUiFieldIntentCallbacks,
) {
  switch (result.kind) {
    case "createDraftChange":
      callbacks.onCreateDraftChange?.(result.draftChange, result.state);
      applyFieldErrorChange(result.fieldErrorChange, callbacks);
      return;
    case "operationDraftChange":
      callbacks.onOperationDraftChange?.(result.draftChange, result.state);
      applyFieldErrorChange(result.fieldErrorChange, callbacks);
      return;
    case "recordDraftChange":
    case "recordEditorDraftChange":
    case "recordDraftRevert":
      callbacks.onRecordDraftChange?.(result.draftChange, result.state);
      for (const change of result.additionalDraftChanges ?? []) {
        callbacks.onRecordDraftChange?.(change, result.state);
      }
      if (result.editorDraftChange) {
        callbacks.onRecordEditorDraftChange?.(result.editorDraftChange);
      }
      applyFieldErrorChange(result.fieldErrorChange, callbacks);
      return;
    case "recordValueCommit":
    case "recordValueUnitCommit":
      applyFieldErrorChange(result.fieldErrorChange, callbacks);
      callbacks.onRecordPatchResolve?.(result.fieldName, result);
      return;
    case "fieldErrorChange":
      callbacks.onFieldErrorChange?.(result.fieldErrorChange);
      return;
    case "iconDialogDraftChange":
      callbacks.onIconDialogDraftChange?.(result.iconDialogDraftChange);
      return;
    case "iconDialogOpenChange":
      callbacks.onIconDialogOpenChange?.(result.iconDialogOpenChange);
      return;
    case "iconDialogCancel":
      callbacks.onIconDialogDraftChange?.(result.iconDialogDraftChange);
      callbacks.onIconDialogOpenChange?.(result.iconDialogOpenChange);
      return;
    case "iconDialogSave":
      applyGeneratedFormlessUiFieldIntentResult(result.commit, callbacks);
      return;
    case "mediaAssetSelect":
      if (result.commit !== undefined) {
        applyGeneratedFormlessUiFieldIntentResult(result.commit, callbacks);
      }
      return;
    case "mediaFileSelect":
      callbacks.onMediaFileSelect?.(result.fileSelect);
      return;
    case "stateTransitionDeferred":
    case "unsupported":
      callbacks.onUnsupportedIntent?.(result);
      return;
  }
}

function recordDraftChangeResult({
  additionalDraftChanges,
  draftChange,
  editorDraftChange,
  fieldErrorChange,
  kind,
  state,
}: {
  additionalDraftChanges?: readonly GeneratedFormlessUiRecordDraftChange[];
  draftChange: GeneratedFormlessUiRecordDraftChange;
  editorDraftChange: GeneratedFormlessUiEditorDraftChange | undefined;
  fieldErrorChange: GeneratedFormlessUiFieldErrorChange | undefined;
  kind: GeneratedFormlessUiRecordDraftChangeResult["kind"];
  state: GeneratedUpdateDraftSessionState;
}): GeneratedFormlessUiRecordDraftChangeResult {
  return {
    additionalDraftChanges,
    kind,
    draftChange,
    editorDraftChange,
    fieldErrorChange,
    state: nextGeneratedUpdateDraftSessionState({
      fieldName: draftChange.fieldName,
      fieldValue: draftChange.fieldValue,
      state,
    }),
  };
}

function recordValueCommitResult({
  fieldConfig,
  options,
  value,
}: {
  fieldConfig: RecordFieldConfig;
  options: AdaptGeneratedRecordFormlessUiIntentOptions;
  value: FieldValue;
}): GeneratedFormlessUiRecordValueCommitResult {
  if (!generatedRecordFieldUsesUpdateDraftResolver(fieldConfig)) {
    const patchValues = selectGeneratedRecordFieldPatchValues({
      currentValues: options.state.baselineValues,
      values: { [fieldConfig.fieldName]: value },
    });

    return {
      kind: "recordValueCommit",
      draftChange: undefined,
      fieldName: fieldConfig.fieldName,
      fieldErrorChange: undefined,
      noop: Object.keys(patchValues).length === 0,
      patchValues,
      resolution: undefined,
    };
  }

  const fieldValue = generatedUpdateDraftInputFromFieldValue(value);
  const resolution = resolveGeneratedUpdateDraftPatchValues({
    baselineValues: options.state.baselineValues,
    draft: {
      values: {
        ...options.state.draft.values,
        [fieldConfig.fieldName]: fieldValue,
      },
    },
    fieldNames: [fieldConfig.fieldName],
    fields: Array.from(options.fields),
    union: options.union,
  });
  const fieldError = selectFieldError(resolution, fieldConfig.fieldName);
  const patchValues = fieldError === undefined ? resolution.patchValues : {};

  return {
    kind: "recordValueCommit",
    draftChange: {
      fieldName: fieldConfig.fieldName,
      fieldValue,
    },
    fieldName: fieldConfig.fieldName,
    fieldErrorChange:
      fieldError === undefined
        ? undefined
        : fieldErrorChange(fieldConfig.fieldName, fieldError.message),
    noop: fieldError === undefined && Object.keys(patchValues).length === 0,
    patchValues,
    resolution,
  };
}

function recordDraftCommitResult({
  fieldConfig,
  fieldValue,
  options,
}: {
  fieldConfig: RecordFieldConfig;
  fieldValue: GeneratedUpdateDraftFieldInput;
  options: AdaptGeneratedRecordFormlessUiIntentOptions;
}): GeneratedFormlessUiRecordValueCommitResult {
  const resolution = resolveGeneratedUpdateDraftPatchValues({
    baselineValues: options.state.baselineValues,
    draft: {
      values: {
        ...options.state.draft.values,
        [fieldConfig.fieldName]: fieldValue,
      },
    },
    fieldNames: [fieldConfig.fieldName],
    fields: Array.from(options.fields),
    union: options.union,
  });
  const fieldError = selectFieldError(resolution, fieldConfig.fieldName);
  const patchValues = fieldError === undefined ? resolution.patchValues : {};

  return {
    kind: "recordValueCommit",
    draftChange: {
      fieldName: fieldConfig.fieldName,
      fieldValue,
    },
    fieldName: fieldConfig.fieldName,
    fieldErrorChange:
      fieldError === undefined
        ? undefined
        : fieldErrorChange(fieldConfig.fieldName, fieldError.message),
    noop: fieldError === undefined && Object.keys(patchValues).length === 0,
    patchValues,
    resolution,
  };
}

function findRecordFieldConfig(
  fields: readonly RecordFieldConfig[],
  fieldName: string,
): RecordFieldConfig | undefined {
  return fields.find((fieldConfig) => fieldConfig.fieldName === fieldName);
}

function numberFormatForField(
  fieldConfig: RecordFieldConfig,
  options: AdaptGeneratedRecordFormlessUiIntentOptions,
): TableColumnFormat {
  return options.numberFormatByFieldName?.[fieldConfig.fieldName] ?? fieldConfig.format ?? "plain";
}

function editorDraftForField(
  fieldConfig: RecordFieldConfig,
  options: AdaptGeneratedRecordFormlessUiIntentOptions,
): string {
  const provided = options.editorDraftByFieldName?.[fieldConfig.fieldName];

  if (provided !== undefined) {
    return provided;
  }

  return generatedRecordFieldEditorDraftFromUpdateDraftInput({
    draftInput: options.state.draft.values[fieldConfig.fieldName],
    fieldConfig,
    numberFormat: numberFormatForField(fieldConfig, options),
    recordValue: options.state.baselineValues[fieldConfig.fieldName],
  });
}

function iconDialogDraftForField(
  fieldConfig: RecordFieldConfig,
  options: AdaptGeneratedRecordFormlessUiIntentOptions,
): string {
  return (
    options.iconDialogDraftByFieldName?.[fieldConfig.fieldName] ??
    editorDraftForField(fieldConfig, options)
  );
}

function recordDraftForField(
  fieldConfig: RecordFieldConfig,
  options: AdaptGeneratedRecordFormlessUiIntentOptions,
): string {
  const provided = options.recordDraftByFieldName?.[fieldConfig.fieldName];

  if (provided !== undefined) {
    return provided;
  }

  return fieldValueToRecordFieldEditorInputValue(
    fieldConfig.field,
    options.state.baselineValues[fieldConfig.fieldName],
    numberFormatForField(fieldConfig, options),
  );
}

function selectFieldError(resolution: GeneratedUpdateDraftResolution, fieldName: string) {
  return resolution.fieldErrors[fieldName] ?? Object.values(resolution.fieldErrors)[0];
}

function clearFieldError(fieldName: string): GeneratedFormlessUiFieldErrorChange {
  return fieldErrorChange(fieldName, null);
}

function fieldErrorChange(
  fieldName: string,
  message: string | null,
): GeneratedFormlessUiFieldErrorChange {
  return { fieldName, message };
}

function applyFieldErrorChange(
  change: GeneratedFormlessUiFieldErrorChange | undefined,
  callbacks: GeneratedFormlessUiFieldIntentCallbacks,
) {
  if (change !== undefined) {
    callbacks.onFieldErrorChange?.(change);
  }
}

function missingRecordContext(
  intent: FormlessUiFieldIntent,
): GeneratedFormlessUiUnsupportedIntentResult {
  return unsupportedIntent(intent, "Record intent adaptation requires generated record context.");
}

function unsupportedIntent(
  intent: FormlessUiFieldIntent,
  reason: string,
): GeneratedFormlessUiUnsupportedIntentResult {
  return {
    kind: "unsupported",
    intentType: intent.type,
    reason,
  };
}

export function generatedFormlessUiFieldDraftInput(
  value: Parameters<typeof generatedFieldDraftInput>[0],
): GeneratedFieldDraftInput {
  return generatedFieldDraftInput(value);
}
