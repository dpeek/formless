import type { ImageMediaAssetOption } from "@dpeek/formless-media/client";
import type {
  AppSchema,
  FieldSchema,
  FieldValue,
  GeneratedFieldDraftError,
  GeneratedFieldDraftInput,
  QueryEvaluationContext,
} from "@dpeek/formless-schema";
import type {
  FormlessUiBaseField,
  FormlessUiCreateDefault,
  FormlessUiCreateField,
  FormlessUiDisplayField,
  FormlessUiEnumOption,
  FormlessUiEnumValuePresentation,
  FormlessUiField,
  FormlessUiFieldAccess,
  FormlessUiFieldControl,
  FormlessUiFieldError,
  FormlessUiFieldFormatting,
  FormlessUiFieldOptions,
  FormlessUiFieldPending,
  FormlessUiFieldSession,
  FormlessUiFieldSurface,
  FormlessUiMediaAssetOption,
  FormlessUiOperationInputField,
  FormlessUiRecordField,
  FormlessUiRecordFieldDensity,
  FormlessUiRecordFieldPresentation,
  FormlessUiRecordFieldRendererKind,
  FormlessUiReferenceOption,
  FormlessUiStateMachineFacts,
  FormlessUiStateTransitionOperation,
  FormlessUiValueUnitCommit,
} from "../../../lib/astryx/src/formless-ui-contract.ts";
import {
  fieldLabel,
  recordFieldIsWritable,
  recordFieldRef,
  type CreateDefaultConfig,
  type CreateFieldConfig,
  type RecordFieldConfig,
} from "../../client/views.ts";
import {
  selectTransitionStateOperationAvailability,
  stateMachineStateIsTerminal,
  type TransitionStateOperationConfig,
} from "../../client/state-machine-model.ts";
import { resolveIconCatalogSvg } from "../../shared/icon-catalog.ts";
import type {
  GeneratedCreateDraftSessionFacts,
  GeneratedCreateDraftSessionState,
} from "./create-field-authoring.ts";
import { selectGeneratedFieldControl, type GeneratedFieldControl } from "./field-controls.ts";
import { selectGeneratedRecordFieldAuthoringAdapter } from "./field-ui-adapters.ts";
import { fieldValueToInputValue, formatFieldDisplayValue } from "./format.ts";
import type {
  GeneratedOperationDraftSessionFacts,
  GeneratedOperationDraftSessionState,
  GeneratedOperationInputConfigurationError,
  GeneratedOperationInputFieldConfig,
} from "./operation-field-authoring.ts";
import {
  generatedMissingReferenceOptionValue,
  generatedReferenceDisplayLabel,
} from "./reference-field-options.ts";
import {
  generatedRecordFieldEditorDraftFromUpdateDraftInput,
  selectGeneratedRecordFieldMediaAuthoring,
  type GeneratedRecordFieldMediaAuthoring,
  type GeneratedUpdateDraftSessionFacts,
  type GeneratedUpdateDraftSessionState,
} from "./record-field-authoring.ts";

export type GeneratedFormlessUiReferenceOption = {
  id: string;
  label: string;
};

export type GeneratedFormlessUiFieldErrorInput =
  | string
  | null
  | undefined
  | GeneratedFieldDraftError
  | readonly GeneratedFieldDraftError[];

export type GeneratedFormlessUiRecordFieldConfig = RecordFieldConfig & {
  suffix?: string;
};

export type ProjectGeneratedCreateFormlessUiSessionOptions = {
  defaults?: readonly CreateDefaultConfig[];
  queryContext?: QueryEvaluationContext;
  session: Pick<
    GeneratedCreateDraftSessionFacts,
    "canSubmit" | "defaultsResolved" | "fieldErrors" | "values" | "visibleFields"
  >;
  state: GeneratedCreateDraftSessionState;
};

export type ProjectGeneratedCreateFormlessUiFieldsOptions =
  ProjectGeneratedCreateFormlessUiSessionOptions & {
    errorsByFieldName?: Readonly<Record<string, GeneratedFormlessUiFieldErrorInput>>;
    pendingByFieldName?: Readonly<Record<string, boolean>>;
    pendingLabelByFieldName?: Readonly<Record<string, string | undefined>>;
    referenceOptionsByFieldName?: Readonly<
      Record<string, readonly GeneratedFormlessUiReferenceOption[]>
    >;
  };

export type ProjectGeneratedCreateFormlessUiFieldOptions = {
  error?: GeneratedFormlessUiFieldErrorInput;
  fieldConfig: CreateFieldConfig;
  isPending?: boolean;
  pendingLabel?: string;
  recordId?: string;
  referenceOptions?: readonly GeneratedFormlessUiReferenceOption[];
  state?: GeneratedCreateDraftSessionState;
  value?: FieldValue;
};

export type ProjectGeneratedRecordFormlessUiSessionOptions = {
  session: Pick<GeneratedUpdateDraftSessionFacts, "fieldErrors" | "patchValues" | "visibleFields">;
  state: GeneratedUpdateDraftSessionState;
};

export type ProjectGeneratedRecordFormlessUiFieldsOptions =
  ProjectGeneratedRecordFormlessUiSessionOptions & {
    canPatch: boolean;
    density?: FormlessUiRecordFieldDensity;
    disabledReasonByFieldName?: Readonly<Record<string, string | undefined>>;
    entityName?: string;
    errorsByFieldName?: Readonly<Record<string, GeneratedFormlessUiFieldErrorInput>>;
    mediaAssetOptionsByFieldName?: Readonly<Record<string, readonly ImageMediaAssetOption[]>>;
    pendingByFieldName?: Readonly<Record<string, boolean>>;
    pendingLabelByFieldName?: Readonly<Record<string, string | undefined>>;
    presentation?: FormlessUiRecordFieldPresentation;
    recordId?: string;
    referenceOptionsByFieldName?: Readonly<
      Record<string, readonly GeneratedFormlessUiReferenceOption[]>
    >;
    schema?: AppSchema | null;
    showLabel?: boolean;
    surface?: Extract<FormlessUiFieldSurface, "detail" | "record" | "table-cell">;
    transitionOperationsByFieldName?: Readonly<
      Record<string, readonly TransitionStateOperationConfig[]>
    >;
    unitDraftByFieldName?: Readonly<Record<string, string | undefined>>;
    unitDraftInputByFieldName?: Readonly<Record<string, GeneratedFieldDraftInput | undefined>>;
  };

export type ProjectGeneratedRecordFormlessUiFieldOptions = {
  canPatch: boolean;
  density?: FormlessUiRecordFieldDensity;
  disabledReason?: string;
  draftInput?: GeneratedFieldDraftInput;
  entityName?: string;
  error?: GeneratedFormlessUiFieldErrorInput;
  fieldConfig: GeneratedFormlessUiRecordFieldConfig;
  isPending?: boolean;
  mediaAssetOptions?: readonly ImageMediaAssetOption[];
  pendingLabel?: string;
  presentation?: FormlessUiRecordFieldPresentation;
  recordId?: string;
  recordValue: FieldValue | undefined;
  referenceOptions?: readonly GeneratedFormlessUiReferenceOption[];
  schema?: AppSchema | null;
  showLabel?: boolean;
  surface?: Extract<FormlessUiFieldSurface, "detail" | "record" | "table-cell">;
  transitionOperations?: readonly TransitionStateOperationConfig[];
  unitDraft?: string;
  unitDraftInput?: GeneratedFieldDraftInput;
  unitRecordValue?: FieldValue;
};

export type ProjectGeneratedDisplayFormlessUiFieldOptions = {
  fieldConfig: GeneratedFormlessUiRecordFieldConfig;
  recordId?: string;
  recordValue: FieldValue | undefined;
  referenceOptions?: readonly GeneratedFormlessUiReferenceOption[];
  surface?: Exclude<FormlessUiFieldSurface, "create" | "operation">;
  transitionOperations?: readonly TransitionStateOperationConfig[];
};

export type ProjectGeneratedOperationFormlessUiSessionOptions = {
  session: Pick<
    GeneratedOperationDraftSessionFacts,
    "canSubmit" | "configurationErrors" | "fieldErrors" | "input" | "visibleFields"
  >;
  state: GeneratedOperationDraftSessionState;
};

export type ProjectGeneratedOperationFormlessUiFieldsOptions =
  ProjectGeneratedOperationFormlessUiSessionOptions & {
    errorsByFieldName?: Readonly<Record<string, GeneratedFormlessUiFieldErrorInput>>;
    pendingByFieldName?: Readonly<Record<string, boolean>>;
    pendingLabelByFieldName?: Readonly<Record<string, string | undefined>>;
  };

export type ProjectGeneratedOperationFormlessUiFieldOptions = {
  error?: GeneratedFormlessUiFieldErrorInput;
  fieldConfig: GeneratedOperationInputFieldConfig;
  isPending?: boolean;
  pendingLabel?: string;
  state?: GeneratedOperationDraftSessionState;
  value?: FieldValue;
};

export function projectGeneratedCreateFormlessUiSession({
  defaults = [],
  queryContext,
  session,
  state,
}: ProjectGeneratedCreateFormlessUiSessionOptions): FormlessUiFieldSession {
  return {
    canSubmit: session.canSubmit,
    defaults: projectGeneratedCreateDefaults(defaults),
    defaultsResolved: session.defaultsResolved,
    draft: state.draft,
    fieldErrors: projectFieldErrorMap(session.fieldErrors),
    ...(queryContext === undefined ? {} : { queryContext }),
    values: session.values,
    visibleFieldNames: session.visibleFields.map((field) => field.fieldName),
  };
}

export function projectGeneratedCreateDefaults(
  defaults: readonly CreateDefaultConfig[],
): FormlessUiCreateDefault[] {
  return defaults.map((defaultConfig) => ({
    field: defaultConfig.field,
    fieldName: defaultConfig.fieldName,
    value: defaultConfig.value,
  }));
}

export function projectGeneratedCreateFormlessUiFields({
  errorsByFieldName,
  pendingByFieldName,
  pendingLabelByFieldName,
  referenceOptionsByFieldName,
  session,
  state,
}: ProjectGeneratedCreateFormlessUiFieldsOptions): FormlessUiCreateField[] {
  return session.visibleFields.map((fieldConfig) =>
    projectGeneratedCreateFormlessUiField({
      error:
        errorsByFieldName?.[fieldConfig.fieldName] ?? session.fieldErrors[fieldConfig.fieldName],
      fieldConfig,
      isPending: pendingByFieldName?.[fieldConfig.fieldName],
      pendingLabel: pendingLabelByFieldName?.[fieldConfig.fieldName],
      referenceOptions: referenceOptionsByFieldName?.[fieldConfig.fieldName],
      state,
      value: session.values[fieldConfig.fieldName],
    }),
  );
}

export function projectGeneratedCreateFormlessUiField({
  error,
  fieldConfig,
  isPending = false,
  pendingLabel,
  recordId,
  referenceOptions = [],
  state,
  value,
}: ProjectGeneratedCreateFormlessUiFieldOptions): FormlessUiCreateField {
  const { editor, field, fieldName } = fieldConfig;
  const label = fieldLabel(fieldName, field);
  const control = selectGeneratedFieldControl({ editor, field, label });
  const draftInput = state?.draft.values[fieldName];
  const currentValue = value ?? stateMachineCreateValue(fieldConfig, draftInput);

  return {
    ...projectBaseField({
      access: fieldConfig.stateMachine === undefined ? editableAccess() : stateMachineAccess(),
      commit: "submit",
      control,
      error,
      fieldConfig: {
        editor,
        field,
        fieldName,
        ...(fieldConfig.presentation === undefined
          ? {}
          : { presentation: fieldConfig.presentation }),
        ...(fieldConfig.stateMachine === undefined
          ? {}
          : { stateMachine: fieldConfig.stateMachine }),
        ...(fieldConfig.visibleWhen === undefined ? {} : { visibleWhen: fieldConfig.visibleWhen }),
      },
      label,
      options: projectFieldOptions({
        field,
        optionValue: draftInput?.value ?? currentValue,
        referenceOptions,
      }),
      pending: projectPending(isPending, pendingLabel),
      recordId,
      stateMachineFacts: projectStateMachineFacts({
        currentValue,
        stateMachine: fieldConfig.stateMachine,
      }),
      surface: "create",
    }),
    commit: "submit",
    draftInput,
    mode: "editor",
    surface: "create",
    value: currentValue,
  };
}

export function projectGeneratedRecordFormlessUiSession({
  session,
  state,
}: ProjectGeneratedRecordFormlessUiSessionOptions): FormlessUiFieldSession {
  return {
    draft: state.draft,
    fieldErrors: projectFieldErrorMap(session.fieldErrors),
    values: session.patchValues,
    visibleFieldNames: session.visibleFields.map((field) => field.fieldName),
  };
}

export function projectGeneratedRecordFormlessUiFields({
  canPatch,
  density = "default",
  disabledReasonByFieldName,
  entityName,
  errorsByFieldName,
  mediaAssetOptionsByFieldName,
  pendingByFieldName,
  pendingLabelByFieldName,
  presentation = "default",
  recordId,
  referenceOptionsByFieldName,
  schema = null,
  session,
  showLabel = false,
  state,
  surface = "record",
  transitionOperationsByFieldName,
  unitDraftByFieldName,
  unitDraftInputByFieldName,
}: ProjectGeneratedRecordFormlessUiFieldsOptions): FormlessUiField[] {
  return session.visibleFields.map((fieldConfig) => {
    const valueUnit = fieldConfig.valueUnit;
    const unitFieldName = valueUnit?.unitFieldName;

    return projectGeneratedRecordFormlessUiField({
      canPatch,
      density,
      disabledReason: disabledReasonByFieldName?.[fieldConfig.fieldName],
      draftInput: state.draft.values[fieldConfig.fieldName],
      entityName,
      error:
        errorsByFieldName?.[fieldConfig.fieldName] ?? session.fieldErrors[fieldConfig.fieldName],
      fieldConfig,
      isPending: pendingByFieldName?.[fieldConfig.fieldName],
      mediaAssetOptions: mediaAssetOptionsByFieldName?.[fieldConfig.fieldName],
      pendingLabel: pendingLabelByFieldName?.[fieldConfig.fieldName],
      presentation,
      recordId,
      recordValue: state.baselineValues[fieldConfig.fieldName],
      referenceOptions: referenceOptionsByFieldName?.[fieldConfig.fieldName],
      schema,
      showLabel,
      surface,
      transitionOperations: transitionOperationsByFieldName?.[fieldConfig.fieldName],
      unitDraft: unitDraftByFieldName?.[fieldConfig.fieldName],
      unitDraftInput:
        unitDraftInputByFieldName?.[fieldConfig.fieldName] ??
        (unitFieldName === undefined ? undefined : state.draft.values[unitFieldName]),
      unitRecordValue:
        unitFieldName === undefined ? undefined : state.baselineValues[unitFieldName],
    });
  });
}

export function projectGeneratedRecordFormlessUiField({
  canPatch,
  density = "default",
  disabledReason,
  draftInput,
  entityName = "",
  error,
  fieldConfig,
  isPending = false,
  mediaAssetOptions = [],
  pendingLabel,
  presentation = "default",
  recordId,
  recordValue,
  referenceOptions = [],
  schema = null,
  showLabel = false,
  surface = "record",
  transitionOperations,
  unitDraft,
  unitDraftInput,
  unitRecordValue,
}: ProjectGeneratedRecordFormlessUiFieldOptions): FormlessUiRecordField | FormlessUiDisplayField {
  const { field, fieldName } = fieldConfig;
  const label = fieldConfig.label ?? fieldLabel(fieldName, field);
  const control = selectGeneratedFieldControl({ editor: fieldConfig.editor, field, label });
  const access = selectRecordAccess(fieldConfig, canPatch, disabledReason);
  const displayField = projectGeneratedDisplayFormlessUiField({
    fieldConfig,
    recordId,
    recordValue,
    referenceOptions,
    surface,
    transitionOperations,
  });

  if (access.kind === "system" || access.kind === "readOnly" || access.kind === "stateMachine") {
    return {
      ...displayField,
      access,
      control,
      errors: projectFieldErrors(fieldName, error),
      pending: projectPending(isPending, pendingLabel),
    };
  }

  const { rendererKind } = selectGeneratedRecordFieldAuthoringAdapter({
    density,
    fieldConfig,
    label,
    presentation,
    showLabel,
  });
  const numberFormat = fieldConfig.format ?? "plain";
  const draft = generatedRecordFieldEditorDraftFromUpdateDraftInput({
    draftInput,
    fieldConfig,
    numberFormat,
    recordValue,
  });
  const projectedUnitDraft = projectUnitDraft({
    fieldConfig,
    unitDraft,
    unitDraftInput,
    unitRecordValue,
  });
  const mediaAuthoring = selectProjectedMediaAuthoring({
    draft,
    entityName,
    fieldConfig,
    mediaAssetOptions,
    rendererKind,
    schema,
  });

  return {
    ...projectBaseField({
      access,
      commit: fieldConfig.commit,
      control,
      error,
      fieldConfig,
      label,
      options: projectFieldOptions({
        field,
        mediaAssetOptions,
        optionValue: draft,
        referenceOptions,
      }),
      pending: projectPending(isPending, pendingLabel),
      recordId,
      stateMachineFacts: projectStateMachineFacts({
        currentValue: recordValue,
        stateMachine: fieldConfig.stateMachine,
        transitionOperations,
      }),
      surface,
    }),
    commit: fieldConfig.commit,
    density,
    drafts: {
      draft,
      draftInput,
      recordValue,
      unitDraft: projectedUnitDraft.unitDraft,
      unitDraftInput: projectedUnitDraft.unitDraftInput,
      unitRecordValue,
    },
    formatting: displayField.formatting,
    ...(mediaAuthoring === undefined ? {} : { media: mediaAuthoring }),
    mode: "editor",
    presentationMode: presentation,
    rendererKind,
    surface,
  };
}

export function projectGeneratedDisplayFormlessUiField({
  fieldConfig,
  recordId,
  recordValue,
  referenceOptions = [],
  surface = "detail",
  transitionOperations,
}: ProjectGeneratedDisplayFormlessUiFieldOptions): FormlessUiDisplayField {
  const label = fieldConfig.label ?? fieldLabel(fieldConfig.fieldName, fieldConfig.field);
  const control = selectGeneratedFieldControl({
    editor: fieldConfig.editor,
    field: fieldConfig.field,
    label,
  });

  return {
    ...projectBaseField({
      access: selectDisplayAccess(fieldConfig),
      commit: "submit",
      control,
      fieldConfig,
      label,
      options: projectFieldOptions({
        field: fieldConfig.field,
        optionValue: recordValue,
        referenceOptions,
      }),
      recordId,
      stateMachineFacts: projectStateMachineFacts({
        currentValue: recordValue,
        stateMachine: fieldConfig.stateMachine,
        transitionOperations,
      }),
      surface,
    }),
    formatting: projectDisplayFormatting({ fieldConfig, recordValue, referenceOptions }),
    mode: "display",
    value: recordValue,
  };
}

export function projectGeneratedOperationFormlessUiSession({
  session,
  state,
}: ProjectGeneratedOperationFormlessUiSessionOptions): FormlessUiFieldSession {
  return {
    canSubmit: session.canSubmit,
    configurationErrors: projectOperationConfigurationErrors(session.configurationErrors),
    draft: state.draft,
    fieldErrors: projectFieldErrorMap(session.fieldErrors),
    values: session.input,
    visibleFieldNames: session.visibleFields.map((field) => field.inputName),
  };
}

export function projectGeneratedOperationFormlessUiFields({
  errorsByFieldName,
  pendingByFieldName,
  pendingLabelByFieldName,
  session,
  state,
}: ProjectGeneratedOperationFormlessUiFieldsOptions): FormlessUiOperationInputField[] {
  return session.visibleFields.map((fieldConfig) =>
    projectGeneratedOperationFormlessUiField({
      error:
        errorsByFieldName?.[fieldConfig.inputName] ?? session.fieldErrors[fieldConfig.inputName],
      fieldConfig,
      isPending: pendingByFieldName?.[fieldConfig.inputName],
      pendingLabel: pendingLabelByFieldName?.[fieldConfig.inputName],
      state,
      value: session.input[fieldConfig.inputName],
    }),
  );
}

export function projectGeneratedOperationFormlessUiField({
  error,
  fieldConfig,
  isPending = false,
  pendingLabel,
  state,
  value,
}: ProjectGeneratedOperationFormlessUiFieldOptions): FormlessUiOperationInputField {
  const { editor, field, inputName, label } = fieldConfig;
  const control = selectGeneratedFieldControl({ editor, field, label });
  const draftInput = state?.draft.values[inputName];

  return {
    ...projectBaseField({
      access: editableAccess(),
      commit: "submit",
      control,
      error,
      fieldConfig,
      inputName,
      label,
      options: projectFieldOptions({
        field,
        optionValue: draftInput?.value ?? value,
      }),
      pending: projectPending(isPending, pendingLabel),
      surface: "operation",
    }),
    commit: "submit",
    draftInput,
    input: fieldConfig,
    inputName,
    mode: "editor",
    surface: "operation",
    value,
  };
}

export function selectFormlessUiValueUnitCommit(
  field: FormlessUiRecordField,
): FormlessUiValueUnitCommit | undefined {
  if (field.valueUnit === undefined) {
    return undefined;
  }

  const { draftInput, unitDraftInput } = field.drafts;

  if (draftInput === undefined || unitDraftInput === undefined) {
    return undefined;
  }

  return {
    fieldDraftInput: draftInput,
    unitDraftInput,
  };
}

function projectBaseField({
  access,
  commit,
  control,
  error,
  fieldConfig,
  inputName,
  label,
  options,
  pending,
  recordId,
  stateMachineFacts,
  surface,
}: {
  access: FormlessUiFieldAccess;
  commit: FormlessUiField["commit"];
  control: GeneratedFieldControl;
  error?: GeneratedFormlessUiFieldErrorInput;
  fieldConfig:
    | CreateFieldConfig
    | GeneratedFormlessUiRecordFieldConfig
    | GeneratedOperationInputFieldConfig;
  inputName?: string;
  label: string;
  options?: FormlessUiFieldOptions;
  pending?: FormlessUiFieldPending;
  recordId?: string;
  stateMachineFacts?: FormlessUiStateMachineFacts;
  surface: FormlessUiFieldSurface;
}): FormlessUiBaseField {
  return {
    access,
    commit,
    control: control as FormlessUiFieldControl,
    editor: fieldConfig.editor,
    errors: projectFieldErrors(fieldConfig.fieldName, error),
    field: fieldConfig.field,
    fieldName: fieldConfig.fieldName,
    ...(recordFieldConfigHasFieldRef(fieldConfig) && fieldConfig.fieldRef !== undefined
      ? { fieldRef: fieldConfig.fieldRef }
      : {}),
    ...(inputName === undefined ? {} : { inputName }),
    label,
    options,
    pending,
    presentation: fieldConfigPresentation(fieldConfig),
    recordId,
    required: fieldConfig.field.required,
    stateMachine: fieldConfigStateMachine(fieldConfig),
    stateMachineFacts,
    surface,
    suffix: "suffix" in fieldConfig ? fieldConfig.suffix : undefined,
    valueUnit: "valueUnit" in fieldConfig ? fieldConfig.valueUnit : undefined,
    visibleWhen: fieldConfigVisibleWhen(fieldConfig),
    writable: "writable" in fieldConfig ? fieldConfig.writable : undefined,
  };
}

function projectFieldOptions({
  field,
  mediaAssetOptions,
  optionValue,
  referenceOptions = [],
}: {
  field: FieldSchema;
  mediaAssetOptions?: readonly ImageMediaAssetOption[];
  optionValue: FieldValue | undefined;
  referenceOptions?: readonly GeneratedFormlessUiReferenceOption[];
}): FormlessUiFieldOptions | undefined {
  if (field.type === "enum") {
    const enumValue = typeof optionValue === "string" ? optionValue : "";

    return {
      enumOptions: projectEnumOptions(field, enumValue),
      unknownEnumValue: unknownEnumValue(field, enumValue),
    };
  }

  if (field.type === "reference") {
    const referenceValue = typeof optionValue === "string" ? optionValue : "";
    const missingReferenceValue = generatedMissingReferenceOptionValue(
      referenceValue,
      referenceOptions,
    );

    return {
      missingReferenceValue,
      referenceOptions: projectReferenceOptions(referenceOptions, missingReferenceValue),
    };
  }

  if (mediaAssetOptions !== undefined) {
    return {
      mediaAssetOptions: mediaAssetOptions.map(projectMediaAssetOption),
    };
  }

  return undefined;
}

function projectDisplayFormatting({
  fieldConfig,
  recordValue,
  referenceOptions,
}: {
  fieldConfig: GeneratedFormlessUiRecordFieldConfig;
  recordValue: FieldValue | undefined;
  referenceOptions: readonly GeneratedFormlessUiReferenceOption[];
}): FormlessUiFieldFormatting & { displayValue: string } {
  const displayValue =
    fieldConfig.field.type === "reference"
      ? generatedReferenceDisplayLabel(recordValue, referenceOptions)
      : fieldConfig.stateMachine !== undefined
        ? stateMachineDisplayValue(fieldConfig.field, recordValue)
        : formatFieldDisplayValue(fieldConfig, recordValue);

  return {
    displayValue,
    ...(fieldConfig.field.type === "enum" && typeof recordValue === "string"
      ? { enumValuePresentation: projectEnumValuePresentation(fieldConfig.field, recordValue) }
      : {}),
    format: fieldConfig.format,
    suffix: fieldConfig.suffix,
  };
}

function projectStateMachineFacts({
  currentValue,
  stateMachine,
  transitionOperations = [],
}: {
  currentValue: FieldValue | undefined;
  stateMachine: RecordFieldConfig["stateMachine"];
  transitionOperations?: readonly TransitionStateOperationConfig[];
}): FormlessUiStateMachineFacts | undefined {
  if (stateMachine === undefined) {
    return undefined;
  }

  return {
    currentValue,
    initialState: stateMachine.initialState,
    stateMachine,
    terminal: stateMachineStateIsTerminal(stateMachine, currentValue),
    transitions:
      transitionOperations.length === 0
        ? undefined
        : transitionOperations.map(
            (operation): FormlessUiStateTransitionOperation => ({
              ...operation,
              availability: selectTransitionStateOperationAvailability({
                currentValue,
                field: operation.field,
                operation,
              }),
            }),
          ),
  };
}

function selectProjectedMediaAuthoring({
  draft,
  entityName,
  fieldConfig,
  mediaAssetOptions,
  rendererKind,
  schema,
}: {
  draft: string;
  entityName: string;
  fieldConfig: GeneratedFormlessUiRecordFieldConfig;
  mediaAssetOptions: readonly ImageMediaAssetOption[];
  rendererKind: FormlessUiRecordFieldRendererKind;
  schema: AppSchema | null;
}): GeneratedRecordFieldMediaAuthoring | undefined {
  if (rendererKind !== "image" && rendererKind !== "media") {
    return undefined;
  }

  return selectGeneratedRecordFieldMediaAuthoring({
    draft,
    entityName,
    fieldConfig,
    mediaAssetOptions: Array.from(mediaAssetOptions),
    schema,
  });
}

function selectRecordAccess(
  fieldConfig: GeneratedFormlessUiRecordFieldConfig,
  canPatch: boolean,
  disabledReason: string | undefined,
): FormlessUiFieldAccess {
  const fieldRef = recordFieldRef(fieldConfig);

  if (fieldRef.kind === "system") {
    return { kind: "system", fieldRef };
  }

  if (fieldConfig.stateMachine !== undefined) {
    return stateMachineAccess();
  }

  if (!recordFieldIsWritable(fieldConfig)) {
    return { kind: "readOnly", writable: false };
  }

  if (!canPatch) {
    return {
      kind: "disabled",
      canPatch: false,
      disabledReason,
      writable: true,
    };
  }

  return editableAccess();
}

function selectDisplayAccess(
  fieldConfig: GeneratedFormlessUiRecordFieldConfig,
): FormlessUiFieldAccess {
  const fieldRef = recordFieldRef(fieldConfig);

  if (fieldRef.kind === "system") {
    return { kind: "system", fieldRef };
  }

  if (fieldConfig.stateMachine !== undefined) {
    return stateMachineAccess();
  }

  return { kind: "readOnly", writable: false };
}

function editableAccess(): FormlessUiFieldAccess {
  return {
    kind: "editable",
    canPatch: true,
    writable: true,
  };
}

function stateMachineAccess(): FormlessUiFieldAccess {
  return {
    kind: "stateMachine",
    writable: false,
  };
}

function projectPending(
  isPending: boolean,
  label: string | undefined,
): FormlessUiFieldPending | undefined {
  if (!isPending) {
    return undefined;
  }

  return {
    isPending,
    ...(label === undefined ? {} : { label }),
  };
}

function projectFieldErrors(
  fieldName: string,
  error: GeneratedFormlessUiFieldErrorInput,
): readonly FormlessUiFieldError[] | undefined {
  if (error === undefined || error === null) {
    return undefined;
  }

  if (typeof error === "string") {
    return error === "" ? undefined : [{ fieldName, message: error }];
  }

  if (isFieldErrorList(error)) {
    return error.length === 0 ? undefined : error;
  }

  return [error];
}

function projectFieldErrorMap(
  fieldErrors: Record<string, GeneratedFieldDraftError>,
): Record<string, FormlessUiFieldError> {
  return { ...fieldErrors };
}

function projectOperationConfigurationErrors(
  errors: readonly GeneratedOperationInputConfigurationError[],
) {
  return errors.map((error) => ({
    inputName: error.inputName,
    message: error.message,
  }));
}

function projectReferenceOptions(
  options: readonly GeneratedFormlessUiReferenceOption[],
  missingReferenceValue: string | null,
): readonly FormlessUiReferenceOption[] {
  return [
    ...(missingReferenceValue === null
      ? []
      : [{ id: missingReferenceValue, label: missingReferenceValue, missing: true }]),
    ...options.map((option) => ({
      id: option.id,
      label: option.label,
    })),
  ];
}

function projectMediaAssetOption(option: ImageMediaAssetOption): FormlessUiMediaAssetOption {
  return {
    ...(option.height === undefined ? {} : { height: option.height }),
    href: option.href,
    id: option.id,
    label: option.label,
    ...(option.width === undefined ? {} : { width: option.width }),
  };
}

function projectEnumOptions(
  field: Extract<FieldSchema, { type: "enum" }>,
  selectedValue: string,
): readonly FormlessUiEnumOption[] {
  const unknownValue = unknownEnumValue(field, selectedValue);

  return [
    ...(unknownValue === null
      ? []
      : [
          {
            label: unknownValue,
            missing: true,
            presentation: projectEnumValuePresentation(field, unknownValue),
            value: unknownValue,
          },
        ]),
    ...Object.entries(field.values).map(([value, option]) => ({
      label: option.label,
      presentation: projectEnumValuePresentation(field, value),
      value,
    })),
  ];
}

function unknownEnumValue(
  field: Extract<FieldSchema, { type: "enum" }>,
  value: string,
): string | null {
  return value !== "" && !Object.hasOwn(field.values, value) ? value : null;
}

function projectEnumValuePresentation(
  field: Extract<FieldSchema, { type: "enum" }>,
  value: string,
): FormlessUiEnumValuePresentation {
  const option = field.values[value];
  const icon = resolvePresentationIcon(option?.presentation?.icon);

  return {
    color: resolvePresentationColor(option?.presentation?.color),
    ...(icon === undefined ? {} : { icon }),
    label: option?.label ?? value,
  };
}

function resolvePresentationIcon(token: string | undefined) {
  const source = resolveIconCatalogSvg(token);

  return source === undefined ? undefined : { kind: "svg" as const, source };
}

function resolvePresentationColor(token: string | undefined) {
  const intent = token === undefined ? undefined : presentationColorIntents[token];

  return {
    intent: intent ?? "neutral",
    known: token === undefined || intent !== undefined,
    ...(token === undefined ? {} : { token }),
  };
}

function stateMachineDisplayValue(field: FieldSchema, value: FieldValue | undefined) {
  if (field.type !== "enum") {
    return "";
  }

  const stateValue = typeof value === "string" ? value : "";

  if (stateValue === "") {
    return "Unset";
  }

  return projectEnumValuePresentation(field, stateValue).label;
}

function stateMachineCreateValue(
  fieldConfig: CreateFieldConfig,
  draftInput: GeneratedFieldDraftInput | undefined,
): FieldValue | undefined {
  if (fieldConfig.stateMachine === undefined) {
    return undefined;
  }

  if (draftInput !== undefined) {
    return draftInput.value;
  }

  return fieldConfig.stateMachine?.initialState;
}

function projectUnitDraft({
  fieldConfig,
  unitDraft,
  unitDraftInput,
  unitRecordValue,
}: {
  fieldConfig: GeneratedFormlessUiRecordFieldConfig;
  unitDraft: string | undefined;
  unitDraftInput: GeneratedFieldDraftInput | undefined;
  unitRecordValue: FieldValue | undefined;
}) {
  if (fieldConfig.valueUnit === undefined) {
    return {
      unitDraft: undefined,
      unitDraftInput: undefined,
    };
  }

  if (unitDraft !== undefined) {
    return {
      unitDraft,
      unitDraftInput: unitDraftInput ?? { kind: "input" as const, value: unitDraft },
    };
  }

  if (unitDraftInput?.kind === "input") {
    return {
      unitDraft: unitDraftInput.value,
      unitDraftInput,
    };
  }

  if (unitDraftInput?.kind === "value") {
    return {
      unitDraft: fieldValueToInputValue(fieldConfig.valueUnit.unitField, unitDraftInput.value),
      unitDraftInput,
    };
  }

  return {
    unitDraft: fieldValueToInputValue(fieldConfig.valueUnit.unitField, unitRecordValue),
    unitDraftInput,
  };
}

function recordFieldConfigHasFieldRef(
  fieldConfig:
    | CreateFieldConfig
    | GeneratedFormlessUiRecordFieldConfig
    | GeneratedOperationInputFieldConfig,
): fieldConfig is GeneratedFormlessUiRecordFieldConfig {
  return "fieldRef" in fieldConfig;
}

function fieldConfigPresentation(
  fieldConfig:
    | CreateFieldConfig
    | GeneratedFormlessUiRecordFieldConfig
    | GeneratedOperationInputFieldConfig,
) {
  return "presentation" in fieldConfig ? fieldConfig.presentation : undefined;
}

function fieldConfigStateMachine(
  fieldConfig:
    | CreateFieldConfig
    | GeneratedFormlessUiRecordFieldConfig
    | GeneratedOperationInputFieldConfig,
) {
  return "stateMachine" in fieldConfig ? fieldConfig.stateMachine : undefined;
}

function fieldConfigVisibleWhen(
  fieldConfig:
    | CreateFieldConfig
    | GeneratedFormlessUiRecordFieldConfig
    | GeneratedOperationInputFieldConfig,
) {
  return "visibleWhen" in fieldConfig ? fieldConfig.visibleWhen : undefined;
}

function isFieldErrorList(
  error: GeneratedFieldDraftError | readonly GeneratedFieldDraftError[],
): error is readonly GeneratedFieldDraftError[] {
  return Array.isArray(error);
}

const presentationColorIntents: Record<string, FormlessUiEnumValuePresentation["color"]["intent"]> =
  {
    danger: "danger",
    error: "danger",
    "priority.high": "danger",
    "priority.low": "success",
    "priority.normal": "warning",
    success: "success",
    warning: "warning",
  };
