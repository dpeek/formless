import { MEDIA_IMAGE_UPLOAD_MAX_BYTES } from "@dpeek/formless-media";
import {
  coreImageMediaAssetOptionForId,
  IMAGE_UPLOAD_ACCEPT,
  type ImageMediaAssetOption,
} from "@dpeek/formless-media/client";
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
  FormlessUiColorFacts,
  FormlessUiCreateDefault,
  FormlessUiCreateField,
  FormlessUiCreateSurfaceContract,
  FormlessUiButtonContent,
  FormlessUiDisplayField,
  FormlessUiEnumFacts,
  FormlessUiEnumOption,
  FormlessUiEnumValuePresentation,
  FormlessUiField,
  FormlessUiFieldAccess,
  FormlessUiFieldControl,
  FormlessUiFieldDensity,
  FormlessUiFieldError,
  FormlessUiFieldFormatting,
  FormlessUiFieldOptions,
  FormlessUiFieldPending,
  FormlessUiFieldSession,
  FormlessUiFieldSurface,
  FormlessUiIconOption,
  FormlessUiIconPickerFacts,
  FormlessUiIconPickerSelection,
  FormlessUiMediaAssetOption,
  FormlessUiMediaAuthoring,
  FormlessUiMediaPresentation,
  FormlessUiOperationInputField,
  FormlessUiRecordField,
  FormlessUiRecordFieldPresentation,
  FormlessUiRecordFieldRendererKind,
  FormlessUiReferenceFacts,
  FormlessUiReferenceOption,
  FormlessUiReferenceValueStatus,
  FormlessUiStateMachineFacts,
  FormlessUiStateTransitionOperation,
  FormlessUiValueUnitCommit,
  FormlessUiValueUnitField,
} from "@dpeek/formless-presentation/contract";
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
import {
  listIconCatalogEntries,
  resolveIconCatalogSvg,
  type IconCatalogEntry,
} from "../../shared/icon-catalog.ts";
import type {
  GeneratedCreateDraftSessionFacts,
  GeneratedCreateDraftSessionState,
} from "./create-field-authoring.ts";
import { selectGeneratedFieldControl, type GeneratedFieldControl } from "./field-controls.ts";
import { fieldValueToInputValue, formatFieldDisplayValue } from "./format.ts";
import type {
  GeneratedOperationDraftSessionFacts,
  GeneratedOperationDraftSessionState,
  GeneratedOperationInputConfigurationError,
  GeneratedOperationInputFieldConfig,
} from "./operation-field-authoring.ts";
import { generatedReferenceDisplayLabel } from "./reference-field-options.ts";
import { toOpaquePickerHexColor } from "./color-utils.ts";
import {
  generatedRecordFieldEditorDraftFromUpdateDraftInput,
  selectGeneratedRecordFieldMediaAuthoring,
  type GeneratedUpdateDraftSessionFacts,
  type GeneratedUpdateDraftSessionState,
} from "./record-field-authoring.ts";
import { selectGeneratedRecordFieldRendererKind } from "./record-field-renderer-model.ts";

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

export type GeneratedFormlessUiFieldOwner =
  | {
      kind: "createSurface";
      surfaceId: string;
    }
  | {
      kind: "listItem";
      listId: string;
      recordId: string;
    }
  | {
      formId: string;
      kind: "operationForm";
    }
  | {
      kind: "recordResult";
      recordId: string;
      resultId: string;
    }
  | {
      kind: "standalone";
      ownerId: string;
    }
  | {
      cellId: string;
      kind: "tableCell";
      tableId: string;
    }
  | {
      fieldSetId: string;
      kind: "tableEditFieldSet";
      tableId: string;
    };

export type GeneratedFormlessUiFieldOccurrence = {
  owner: GeneratedFormlessUiFieldOwner;
  placementId: string;
};

type GeneratedFormlessUiCreateFieldOwner = Extract<
  GeneratedFormlessUiFieldOwner,
  { kind: "createSurface" }
>;

type GeneratedFormlessUiOperationFieldOwner = Extract<
  GeneratedFormlessUiFieldOwner,
  { kind: "operationForm" }
>;

export type GeneratedFormlessUiRecordFieldOwner = Exclude<
  GeneratedFormlessUiFieldOwner,
  GeneratedFormlessUiCreateFieldOwner | GeneratedFormlessUiOperationFieldOwner
>;

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
    iconDialogDraftByFieldName?: Readonly<Record<string, string | undefined>>;
    iconDialogOpenByFieldName?: Readonly<Record<string, boolean | undefined>>;
    iconParseErrorByFieldName?: Readonly<Record<string, string | undefined>>;
    pendingByFieldName?: Readonly<Record<string, boolean>>;
    pendingLabelByFieldName?: Readonly<Record<string, string | undefined>>;
    mediaAssetOptionsByFieldName?: Readonly<Record<string, readonly ImageMediaAssetOption[]>>;
    referenceOptionsByFieldName?: Readonly<
      Record<string, readonly GeneratedFormlessUiReferenceOption[]>
    >;
    owner: GeneratedFormlessUiCreateFieldOwner;
  };

export type ProjectGeneratedCreateFormlessUiSurfaceOptions = Omit<
  ProjectGeneratedCreateFormlessUiFieldsOptions,
  "owner"
> & {
  enabled: boolean;
  entityLabel: string;
  formErrors?: readonly string[];
  id: string;
  isSubmitting: boolean;
  open: boolean;
  submitLabel: string;
  trigger: {
    content: FormlessUiButtonContent;
    density: "default" | "compact";
    prominence: "primary" | "secondary" | "quiet";
  };
  triggerLabel: string;
};

export type ProjectGeneratedCreateFormlessUiFieldOptions = {
  error?: GeneratedFormlessUiFieldErrorInput;
  fieldConfig: CreateFieldConfig;
  iconDialogDraft?: string;
  iconDialogOpen?: boolean;
  iconParseError?: string;
  isPending?: boolean;
  mediaAssetOptions?: readonly ImageMediaAssetOption[];
  occurrence: GeneratedFormlessUiFieldOccurrence & {
    owner: GeneratedFormlessUiCreateFieldOwner;
  };
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
    density?: FormlessUiFieldDensity;
    densityByFieldName?: Readonly<Record<string, FormlessUiFieldDensity | undefined>>;
    disabledReasonByFieldName?: Readonly<Record<string, string | undefined>>;
    editorDraftByFieldName?: Readonly<Record<string, string | undefined>>;
    entityName?: string;
    errorsByFieldName?: Readonly<Record<string, GeneratedFormlessUiFieldErrorInput>>;
    iconDialogDraftByFieldName?: Readonly<Record<string, string | undefined>>;
    iconDialogOpenByFieldName?: Readonly<Record<string, boolean | undefined>>;
    iconParseErrorByFieldName?: Readonly<Record<string, string | undefined>>;
    mediaAssetOptionsByFieldName?: Readonly<Record<string, readonly ImageMediaAssetOption[]>>;
    owner: GeneratedFormlessUiRecordFieldOwner;
    pendingByFieldName?: Readonly<Record<string, boolean>>;
    pendingLabelByFieldName?: Readonly<Record<string, string | undefined>>;
    presentation?: FormlessUiRecordFieldPresentation;
    presentationByFieldName?: Readonly<
      Record<string, FormlessUiRecordFieldPresentation | undefined>
    >;
    recordId?: string;
    referenceOptionsByFieldName?: Readonly<
      Record<string, readonly GeneratedFormlessUiReferenceOption[]>
    >;
    schema?: AppSchema | null;
    showLabel?: boolean;
    showLabelByFieldName?: Readonly<Record<string, boolean | undefined>>;
    surface?: Extract<FormlessUiFieldSurface, "detail" | "record" | "table-cell">;
    transitionOperationsByFieldName?: Readonly<
      Record<string, readonly TransitionStateOperationConfig[]>
    >;
    unitDraftByFieldName?: Readonly<Record<string, string | undefined>>;
    unitDraftInputByFieldName?: Readonly<Record<string, GeneratedFieldDraftInput | undefined>>;
  };

export type ProjectGeneratedRecordFormlessUiFieldOptions = {
  canPatch: boolean;
  density?: FormlessUiFieldDensity;
  disabledReason?: string;
  draftInput?: GeneratedFieldDraftInput;
  editorDraft?: string;
  entityName?: string;
  error?: GeneratedFormlessUiFieldErrorInput;
  fieldConfig: GeneratedFormlessUiRecordFieldConfig;
  iconDialogDraft?: string;
  iconDialogOpen?: boolean;
  iconParseError?: string;
  isPending?: boolean;
  mediaAssetOptions?: readonly ImageMediaAssetOption[];
  occurrence: GeneratedFormlessUiFieldOccurrence & {
    owner: GeneratedFormlessUiRecordFieldOwner;
  };
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
  density?: FormlessUiFieldDensity;
  fieldConfig: GeneratedFormlessUiRecordFieldConfig;
  mediaAssetOptions?: readonly ImageMediaAssetOption[];
  occurrence: GeneratedFormlessUiFieldOccurrence & {
    owner: GeneratedFormlessUiRecordFieldOwner;
  };
  recordId?: string;
  recordValue: FieldValue | undefined;
  referenceOptions?: readonly GeneratedFormlessUiReferenceOption[];
  showLabel?: boolean;
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
    owner: GeneratedFormlessUiOperationFieldOwner;
  };

export type ProjectGeneratedOperationFormlessUiFieldOptions = {
  error?: GeneratedFormlessUiFieldErrorInput;
  fieldConfig: GeneratedOperationInputFieldConfig;
  isPending?: boolean;
  occurrence: GeneratedFormlessUiFieldOccurrence & {
    owner: GeneratedFormlessUiOperationFieldOwner;
  };
  pendingLabel?: string;
  state?: GeneratedOperationDraftSessionState;
  value?: FieldValue;
};

export function projectGeneratedFormlessUiFieldId({
  owner,
  placementId,
}: GeneratedFormlessUiFieldOccurrence): string {
  const ownerParts = (() => {
    switch (owner.kind) {
      case "createSurface":
        return [owner.surfaceId];
      case "listItem":
        return [owner.listId, owner.recordId];
      case "operationForm":
        return [owner.formId];
      case "recordResult":
        return [owner.resultId, owner.recordId];
      case "standalone":
        return [owner.ownerId];
      case "tableCell":
        return [owner.tableId, owner.cellId];
      case "tableEditFieldSet":
        return [owner.tableId, owner.fieldSetId];
    }
  })();

  return ["field", owner.kind, ...ownerParts, placementId]
    .map((part) => encodeURIComponent(part))
    .join(":");
}

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
  iconDialogDraftByFieldName,
  iconDialogOpenByFieldName,
  iconParseErrorByFieldName,
  mediaAssetOptionsByFieldName,
  pendingByFieldName,
  pendingLabelByFieldName,
  referenceOptionsByFieldName,
  owner,
  session,
  state,
}: ProjectGeneratedCreateFormlessUiFieldsOptions): FormlessUiCreateField[] {
  return session.visibleFields.map((fieldConfig) =>
    projectGeneratedCreateFormlessUiField({
      error:
        errorsByFieldName?.[fieldConfig.fieldName] ?? session.fieldErrors[fieldConfig.fieldName],
      fieldConfig,
      iconDialogDraft: iconDialogDraftByFieldName?.[fieldConfig.fieldName],
      iconDialogOpen: iconDialogOpenByFieldName?.[fieldConfig.fieldName],
      iconParseError: iconParseErrorByFieldName?.[fieldConfig.fieldName],
      isPending: pendingByFieldName?.[fieldConfig.fieldName],
      mediaAssetOptions: mediaAssetOptionsByFieldName?.[fieldConfig.fieldName],
      occurrence: { owner, placementId: fieldConfig.fieldName },
      pendingLabel: pendingLabelByFieldName?.[fieldConfig.fieldName],
      referenceOptions: referenceOptionsByFieldName?.[fieldConfig.fieldName],
      state,
      value: session.values[fieldConfig.fieldName],
    }),
  );
}

export function projectGeneratedCreateFormlessUiSurface({
  enabled,
  entityLabel,
  errorsByFieldName,
  formErrors: runtimeFormErrors = [],
  iconDialogDraftByFieldName,
  iconDialogOpenByFieldName,
  iconParseErrorByFieldName,
  id,
  isSubmitting,
  mediaAssetOptionsByFieldName,
  open,
  pendingByFieldName,
  pendingLabelByFieldName,
  referenceOptionsByFieldName,
  session,
  state,
  submitLabel,
  trigger,
  triggerLabel,
}: ProjectGeneratedCreateFormlessUiSurfaceOptions): FormlessUiCreateSurfaceContract {
  const disabledReason = !enabled
    ? `Create is disabled for ${entityLabel}.`
    : !session.defaultsResolved
      ? `Create ${entityLabel.toLowerCase()} requires a selected context.`
      : undefined;
  const fieldsDisabled = disabledReason !== undefined || isSubmitting;
  const visibleFieldNames = new Set(session.visibleFields.map((field) => field.fieldName));
  const formErrors = [
    ...runtimeFormErrors,
    ...Object.values(session.fieldErrors)
      .filter((error) => !visibleFieldNames.has(error.fieldName))
      .map((error) => error.message),
  ];
  const fields = projectGeneratedCreateFormlessUiFields({
    errorsByFieldName,
    iconDialogDraftByFieldName,
    iconDialogOpenByFieldName,
    iconParseErrorByFieldName,
    mediaAssetOptionsByFieldName,
    owner: { kind: "createSurface", surfaceId: id },
    pendingByFieldName,
    pendingLabelByFieldName,
    referenceOptionsByFieldName,
    session,
    state,
  });

  return {
    dialog: {
      form: {
        cancel: {
          accessibilityLabel: "Cancel",
          content: { kind: "label", label: "Cancel" },
          density: "default",
          id: `${id}:cancel`,
          kind: "button",
          prominence: "secondary",
          type: "button",
        },
        errors: formErrors,
        fieldSet: {
          disabled: fieldsDisabled,
          ...(fieldsDisabled
            ? {
                disabledReason:
                  disabledReason ?? `Create ${entityLabel.toLowerCase()} is being submitted.`,
              }
            : {}),
          errors: formErrors,
          fields,
          id: `${id}:fields`,
          kind: "fieldSet",
        },
        id: `${id}:form`,
        kind: "createForm",
        submit: {
          accessibilityLabel: submitLabel,
          content: {
            kind: "label",
            label: isSubmitting ? "Saving..." : enabled ? submitLabel : "Create disabled",
          },
          density: "default",
          disabled: !session.canSubmit || isSubmitting,
          id: `${id}:submit`,
          kind: "button",
          pending: isSubmitting ? { isPending: true, label: "Saving" } : undefined,
          prominence: "primary",
          type: "submit",
        },
      },
      id: `${id}:dialog`,
      kind: "createDialog",
      open,
      title: submitLabel,
    },
    id,
    kind: "createSurface",
    trigger: {
      accessibilityLabel: triggerLabel,
      content: trigger.content,
      density: trigger.density,
      disabled: disabledReason !== undefined,
      ...(disabledReason === undefined ? {} : { disabledReason }),
      id: `${id}:trigger`,
      kind: "button",
      prominence: trigger.prominence,
      type: "button",
    },
  };
}

export function projectGeneratedCreateFormlessUiField({
  error,
  fieldConfig,
  iconDialogDraft,
  iconDialogOpen,
  iconParseError,
  isPending = false,
  mediaAssetOptions = [],
  occurrence,
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
  const referenceDefault =
    field.type === "reference" &&
    field.required &&
    draftInput === undefined &&
    (value === undefined || value === "")
      ? referenceOptions[0]?.id
      : undefined;
  const projectedDraftInput =
    referenceDefault === undefined
      ? draftInput
      : ({ kind: "input", value: referenceDefault } as const);
  const typedDraftValue =
    projectedDraftInput?.kind === "value" ? projectedDraftInput.value : undefined;
  const resolvedValue =
    referenceDefault ??
    value ??
    typedDraftValue ??
    stateMachineCreateValue(fieldConfig, projectedDraftInput);
  const editorValue = projectedDraftInput?.value ?? resolvedValue;
  const media = projectCreateMediaAuthoring({
    control,
    fieldName,
    mediaAssetOptions,
    value: editorValue,
  });
  const icon = selectProjectedIconAuthoring({
    dialogDraft: iconDialogDraft,
    dialogOpen: iconDialogOpen,
    draft: typeof editorValue === "string" ? editorValue : "",
    isIcon: control.controlKind === "icon",
    isPending,
    parseError: iconParseError,
    required: field.required,
  });

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
      fieldId: projectGeneratedFormlessUiFieldId(occurrence),
      label,
      labelVisibility: "visible",
      options: projectFieldOptions({
        field,
        includeIconOptions: control.controlKind === "icon",
        mediaAssetOptions: control.controlKind === "media" ? mediaAssetOptions : undefined,
        referenceOptions,
      }),
      pending: projectPending(isPending, pendingLabel),
      recordId,
      stateMachineFacts: projectStateMachineFacts({
        currentValue: resolvedValue,
        field,
        stateMachine: fieldConfig.stateMachine,
      }),
      surface: "create",
    }),
    color: projectColorFacts(control, editorValue),
    commit: "submit",
    density: "default",
    draftInput: projectedDraftInput,
    enum:
      fieldConfig.stateMachine === undefined
        ? projectEnumEditorFacts({
            field,
            style: "plain",
            surface: "create",
            value: editorValue,
          })
        : undefined,
    ...(icon === undefined ? {} : { icon }),
    mode: "editor",
    ...(media === undefined ? {} : { media }),
    reference: projectReferenceEditorFacts(field, editorValue, referenceOptions),
    surface: "create",
    value: resolvedValue,
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
  densityByFieldName,
  disabledReasonByFieldName,
  editorDraftByFieldName,
  entityName,
  errorsByFieldName,
  iconDialogDraftByFieldName,
  iconDialogOpenByFieldName,
  iconParseErrorByFieldName,
  mediaAssetOptionsByFieldName,
  owner,
  pendingByFieldName,
  pendingLabelByFieldName,
  presentation = "default",
  presentationByFieldName,
  recordId,
  referenceOptionsByFieldName,
  schema = null,
  session,
  showLabel = false,
  showLabelByFieldName,
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
      density: densityByFieldName?.[fieldConfig.fieldName] ?? density,
      disabledReason: disabledReasonByFieldName?.[fieldConfig.fieldName],
      draftInput: state.draft.values[fieldConfig.fieldName],
      editorDraft: editorDraftByFieldName?.[fieldConfig.fieldName],
      entityName,
      error:
        errorsByFieldName?.[fieldConfig.fieldName] ?? session.fieldErrors[fieldConfig.fieldName],
      fieldConfig,
      iconDialogDraft: iconDialogDraftByFieldName?.[fieldConfig.fieldName],
      iconDialogOpen: iconDialogOpenByFieldName?.[fieldConfig.fieldName],
      iconParseError: iconParseErrorByFieldName?.[fieldConfig.fieldName],
      isPending: pendingByFieldName?.[fieldConfig.fieldName],
      mediaAssetOptions: mediaAssetOptionsByFieldName?.[fieldConfig.fieldName],
      occurrence: { owner, placementId: fieldConfig.fieldName },
      pendingLabel: pendingLabelByFieldName?.[fieldConfig.fieldName],
      presentation: presentationByFieldName?.[fieldConfig.fieldName] ?? presentation,
      recordId,
      recordValue: state.baselineValues[fieldConfig.fieldName],
      referenceOptions: referenceOptionsByFieldName?.[fieldConfig.fieldName],
      schema,
      showLabel: showLabelByFieldName?.[fieldConfig.fieldName] ?? showLabel,
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
  editorDraft,
  entityName = "",
  error,
  fieldConfig,
  iconDialogDraft,
  iconDialogOpen,
  iconParseError,
  isPending = false,
  mediaAssetOptions = [],
  occurrence,
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
    density,
    fieldConfig,
    mediaAssetOptions,
    occurrence,
    recordId,
    recordValue,
    referenceOptions,
    showLabel,
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

  const rendererKind = selectGeneratedRecordFieldRendererKind({
    density,
    fieldConfig,
    fieldControl: control,
    presentation,
    showLabel,
  });
  const numberFormat = fieldConfig.format ?? "plain";
  const draft =
    editorDraft ??
    generatedRecordFieldEditorDraftFromUpdateDraftInput({
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
  const iconAuthoring = selectProjectedIconAuthoring({
    dialogDraft: iconDialogDraft,
    dialogOpen: iconDialogOpen,
    draft,
    isIcon: rendererKind === "icon",
    isPending,
    parseError: iconParseError,
    required: field.required,
  });

  return {
    ...projectBaseField({
      access,
      commit: fieldConfig.commit,
      control,
      error,
      fieldConfig,
      fieldId: projectGeneratedFormlessUiFieldId(occurrence),
      label,
      labelVisibility: showLabel && surface !== "table-cell" ? "visible" : "hidden",
      options: projectFieldOptions({
        field,
        includeIconOptions: control.controlKind === "icon",
        mediaAssetOptions,
        referenceOptions,
      }),
      pending: projectPending(isPending, pendingLabel),
      recordId,
      stateMachineFacts: projectStateMachineFacts({
        currentValue: recordValue,
        field,
        stateMachine: fieldConfig.stateMachine,
        transitionOperations,
      }),
      surface,
    }),
    color: projectColorFacts(control, draft),
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
    enum: projectEnumEditorFacts({
      field,
      presentation: fieldConfig.presentation,
      style: rendererKind === "enum-icon" ? "rich" : "plain",
      surface,
      value: draft,
    }),
    ...(iconAuthoring === undefined ? {} : { icon: iconAuthoring }),
    ...(mediaAuthoring === undefined ? {} : { media: mediaAuthoring }),
    mode: "editor",
    presentationMode: presentation,
    reference: projectReferenceEditorFacts(field, draft, referenceOptions),
    rendererKind,
    surface,
    value: recordValue,
    valueUnit: projectValueUnitField(fieldConfig.valueUnit, projectedUnitDraft.unitDraft),
  };
}

export function projectGeneratedDisplayFormlessUiField({
  density = "default",
  fieldConfig,
  mediaAssetOptions = [],
  occurrence,
  recordId,
  recordValue,
  referenceOptions = [],
  showLabel,
  surface = "detail",
  transitionOperations,
}: ProjectGeneratedDisplayFormlessUiFieldOptions): FormlessUiDisplayField {
  const label = fieldConfig.label ?? fieldLabel(fieldConfig.fieldName, fieldConfig.field);
  const control = selectGeneratedFieldControl({
    editor: fieldConfig.editor,
    field: fieldConfig.field,
    label,
  });
  const media = projectMediaPresentation({
    control,
    mediaAssetOptions,
    value: recordValue,
  });

  return {
    ...projectBaseField({
      access: selectDisplayAccess(fieldConfig),
      commit: "submit",
      control,
      fieldConfig,
      fieldId: projectGeneratedFormlessUiFieldId(occurrence),
      label,
      labelVisibility:
        surface === "table-cell" || (surface === "record" && showLabel !== true)
          ? "hidden"
          : "visible",
      options: projectFieldOptions({
        field: fieldConfig.field,
        mediaAssetOptions: control.controlKind === "media" ? mediaAssetOptions : undefined,
        referenceOptions,
      }),
      recordId,
      stateMachineFacts: projectStateMachineFacts({
        currentValue: recordValue,
        field: fieldConfig.field,
        stateMachine: fieldConfig.stateMachine,
        transitionOperations,
      }),
      surface,
    }),
    color: projectColorFacts(control, recordValue),
    density,
    enum: projectEnumDisplayFacts({
      field: fieldConfig.field,
      presentation: fieldConfig.presentation,
      value: recordValue,
    }),
    formatting: projectDisplayFormatting({ fieldConfig, recordValue, referenceOptions }),
    ...(media === undefined ? {} : { media }),
    mode: "display",
    reference: projectReferenceDisplayFacts(fieldConfig.field, recordValue, referenceOptions),
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
  owner,
  session,
  state,
}: ProjectGeneratedOperationFormlessUiFieldsOptions): FormlessUiOperationInputField[] {
  return session.visibleFields.map((fieldConfig) =>
    projectGeneratedOperationFormlessUiField({
      error:
        errorsByFieldName?.[fieldConfig.inputName] ?? session.fieldErrors[fieldConfig.inputName],
      fieldConfig,
      isPending: pendingByFieldName?.[fieldConfig.inputName],
      occurrence: { owner, placementId: fieldConfig.inputName },
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
  occurrence,
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
      fieldId: projectGeneratedFormlessUiFieldId(occurrence),
      inputName,
      label,
      labelVisibility: "visible",
      options: projectFieldOptions({
        field,
        includeIconOptions: control.controlKind === "icon",
      }),
      pending: projectPending(isPending, pendingLabel),
      surface: "operation",
    }),
    color: projectColorFacts(control, draftInput?.value ?? value),
    commit: "submit",
    density: "default",
    draftInput,
    enum: projectEnumEditorFacts({
      field,
      style: "plain",
      surface: "operation",
      value: draftInput?.value ?? value,
    }),
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
  fieldId,
  inputName,
  label,
  labelVisibility,
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
  fieldId: string;
  inputName?: string;
  label: string;
  labelVisibility: FormlessUiBaseField["labelVisibility"];
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
    fieldId,
    fieldName: fieldConfig.fieldName,
    ...(recordFieldConfigHasFieldRef(fieldConfig) && fieldConfig.fieldRef !== undefined
      ? { fieldRef: fieldConfig.fieldRef }
      : {}),
    ...(inputName === undefined ? {} : { inputName }),
    label,
    labelVisibility,
    options,
    pending,
    presentation: fieldConfigPresentation(fieldConfig),
    recordId,
    required: fieldConfig.field.required,
    stateMachine: fieldConfigStateMachine(fieldConfig),
    stateMachineFacts,
    surface,
    suffix: "suffix" in fieldConfig ? fieldConfig.suffix : undefined,
    valueUnit:
      "valueUnit" in fieldConfig ? projectValueUnitField(fieldConfig.valueUnit) : undefined,
    visibleWhen: fieldConfigVisibleWhen(fieldConfig),
    writable: "writable" in fieldConfig ? fieldConfig.writable : undefined,
  };
}

function projectColorFacts(
  control: FormlessUiFieldControl,
  value: FieldValue | undefined,
): FormlessUiColorFacts | undefined {
  if (control.controlKind !== "color") {
    return undefined;
  }

  const text = typeof value === "string" ? value : "";
  const colorValue = toOpaquePickerHexColor(text);

  return {
    picker: colorValue === undefined ? { kind: "unavailable" } : { kind: "hex", value: colorValue },
    swatch: colorValue === undefined ? { kind: "unavailable" } : { kind: "hex", value: colorValue },
  };
}

function projectValueUnitField(
  valueUnit: GeneratedFormlessUiRecordFieldConfig["valueUnit"] | undefined,
  currentValue = "",
): FormlessUiValueUnitField | undefined {
  if (valueUnit === undefined) {
    return undefined;
  }

  const declaredOptions = Object.entries(valueUnit.unitField.values).map(([value, option]) => ({
    label: option.label,
    status: "declared" as const,
    value,
  }));
  const options =
    currentValue !== "" && valueUnit.unitField.values[currentValue] === undefined
      ? [
          {
            label: currentValue,
            status: "undeclaredCurrent" as const,
            value: currentValue,
          },
          ...declaredOptions,
        ]
      : declaredOptions;

  return {
    clearable: !valueUnit.unitField.required,
    options,
    required: valueUnit.unitField.required,
    unitField: valueUnit.unitField,
    unitFieldName: valueUnit.unitFieldName,
  };
}

function projectFieldOptions({
  field,
  includeIconOptions = false,
  mediaAssetOptions,
  referenceOptions = [],
}: {
  field: FieldSchema;
  includeIconOptions?: boolean;
  mediaAssetOptions?: readonly ImageMediaAssetOption[];
  referenceOptions?: readonly GeneratedFormlessUiReferenceOption[];
}): FormlessUiFieldOptions | undefined {
  if (field.type === "enum") {
    return {
      enumOptions: projectEnumOptions(field),
    };
  }

  if (field.type === "reference") {
    return {
      referenceOptions: projectReferenceOptions(referenceOptions),
    };
  }

  if (includeIconOptions) {
    return {
      iconOptions: projectIconOptions(),
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
  const temporal = projectTemporalDisplay(fieldConfig, recordValue);

  return {
    displayValue,
    ...(fieldConfig.field.type === "enum" && typeof recordValue === "string"
      ? { enumValuePresentation: projectEnumValuePresentation(fieldConfig.field, recordValue) }
      : {}),
    format: fieldConfig.format,
    suffix: fieldConfig.suffix,
    ...(temporal === undefined ? {} : { temporal }),
  };
}

function projectTemporalDisplay(
  fieldConfig: GeneratedFormlessUiRecordFieldConfig,
  recordValue: FieldValue | undefined,
): FormlessUiFieldFormatting["temporal"] {
  if (typeof recordValue !== "string" || recordValue === "") {
    return undefined;
  }

  if (fieldConfig.field.type === "date") {
    return /^\d{4}-\d{2}-\d{2}$/.test(recordValue)
      ? { kind: "date", value: recordValue }
      : undefined;
  }

  const fieldRef = recordFieldRef(fieldConfig);

  if (
    fieldRef.kind === "system" &&
    fieldRef.name !== "id" &&
    Number.isFinite(Date.parse(recordValue))
  ) {
    return { kind: "dateTime", value: recordValue };
  }

  return undefined;
}

function projectStateMachineFacts({
  currentValue,
  field,
  stateMachine,
  transitionOperations = [],
}: {
  currentValue: FieldValue | undefined;
  field: FieldSchema;
  stateMachine: RecordFieldConfig["stateMachine"];
  transitionOperations?: readonly TransitionStateOperationConfig[];
}): FormlessUiStateMachineFacts | undefined {
  if (stateMachine === undefined) {
    return undefined;
  }

  return {
    currentValue,
    initialState: stateMachine.initialState,
    interaction:
      transitionOperations.length === 0
        ? { kind: "display" }
        : {
            invocationSource: "menuItem",
            kind: "transitions",
            transitions: transitionOperations.map(
              (operation): FormlessUiStateTransitionOperation => ({
                ...operation,
                availability: selectTransitionStateOperationAvailability({
                  currentValue,
                  field: operation.field,
                  operation,
                }),
              }),
            ),
          },
    stateMachine,
    terminal: stateMachineStateIsTerminal(stateMachine, currentValue),
    valueStatus: stateMachineValueStatus(field, currentValue),
  };
}

function stateMachineValueStatus(
  field: FieldSchema,
  currentValue: FieldValue | undefined,
): FormlessUiStateMachineFacts["valueStatus"] {
  if (typeof currentValue !== "string" || currentValue.trim() === "") {
    return { kind: "unset", message: "Current state is missing." };
  }

  if (field.type !== "enum" || field.values[currentValue] === undefined) {
    return {
      kind: "undeclared",
      message: `Current state "${currentValue}" is not declared.`,
      value: currentValue,
    };
  }

  return { kind: "declared", value: currentValue };
}

function projectCreateMediaAuthoring({
  control,
  fieldName,
  mediaAssetOptions,
  value,
}: {
  control: FormlessUiFieldControl;
  fieldName: string;
  mediaAssetOptions: readonly ImageMediaAssetOption[];
  value: FieldValue | undefined;
}): FormlessUiMediaAuthoring | undefined {
  if (control.controlKind !== "media") {
    return undefined;
  }

  return {
    ...projectMediaPresentation({ control, mediaAssetOptions, value }),
    accept: IMAGE_UPLOAD_ACCEPT,
    fileSelectEnabled: true,
    maxSize: MEDIA_IMAGE_UPLOAD_MAX_BYTES,
    uploadEnabled: true,
    uploadPatchFields: { mediaAssetFieldName: fieldName },
  };
}

function projectMediaPresentation({
  control,
  mediaAssetOptions,
  value,
}: {
  control: FormlessUiFieldControl;
  mediaAssetOptions: readonly ImageMediaAssetOption[];
  value: FieldValue | undefined;
}): FormlessUiMediaPresentation | undefined {
  if (control.controlKind !== "media") {
    return undefined;
  }

  const selectedValue = typeof value === "string" ? value : "";

  if (selectedValue === "") {
    return {};
  }

  const selectedAsset =
    mediaAssetOptions.find((asset) => asset.id === selectedValue) ??
    coreImageMediaAssetOptionForId(selectedValue);

  return {
    ...(selectedAsset === undefined
      ? {
          missingSelectedAsset: {
            assetId: selectedValue,
            reason: "Selected media asset is unavailable.",
          },
        }
      : { previewHref: selectedAsset.href }),
    selectedAssetId: selectedValue,
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
}): FormlessUiMediaAuthoring | undefined {
  if (rendererKind !== "media") {
    return undefined;
  }

  const mediaAuthoring = selectGeneratedRecordFieldMediaAuthoring({
    draft,
    entityName,
    fieldConfig,
    mediaAssetOptions: Array.from(mediaAssetOptions),
    schema,
  });
  const selectedAssetId = draft !== "" ? draft : undefined;
  const previewHref = mediaAuthoring.mediaPreviewHref;
  const missingSelectedAsset =
    selectedAssetId !== undefined && mediaAuthoring.mediaPreviewHref === undefined
      ? {
          assetId: selectedAssetId,
          reason: "Selected media asset is unavailable.",
        }
      : undefined;

  return {
    ...mediaAuthoring,
    accept: IMAGE_UPLOAD_ACCEPT,
    fileSelectEnabled: mediaAuthoring.uploadEnabled,
    maxSize: MEDIA_IMAGE_UPLOAD_MAX_BYTES,
    ...(missingSelectedAsset === undefined ? {} : { missingSelectedAsset }),
    ...(previewHref === undefined ? {} : { previewHref }),
    ...(selectedAssetId === undefined ? {} : { selectedAssetId }),
  };
}

function selectProjectedIconAuthoring({
  dialogDraft,
  dialogOpen = false,
  draft,
  isIcon,
  isPending,
  parseError,
  required,
}: {
  dialogDraft?: string;
  dialogOpen?: boolean;
  draft: string;
  isIcon: boolean;
  isPending: boolean;
  parseError?: string;
  required: boolean;
}): FormlessUiIconPickerFacts | undefined {
  if (!isIcon) {
    return undefined;
  }

  const projectedDialogDraft = dialogDraft ?? draft;
  const previewSource = dialogOpen ? projectedDialogDraft : draft;

  return {
    canCancel: dialogOpen,
    canSave:
      dialogOpen &&
      !isPending &&
      parseError === undefined &&
      (!required || projectedDialogDraft.trim() !== ""),
    ...(parseError === undefined ? {} : { customParseError: parseError }),
    dialogDraft: projectedDialogDraft,
    dialogOpen,
    emptyValue: projectedDialogDraft.trim() === "",
    previewSource: parseError === undefined ? previewSource : draft,
    savePending: isPending,
    selection: selectIconPickerSelection(projectedDialogDraft),
    valueMode: "svgSource",
  };
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
): readonly FormlessUiReferenceOption[] {
  return options.map((option) => ({
    id: option.id,
    label: option.label,
  }));
}

function projectReferenceEditorFacts(
  field: FieldSchema,
  value: FieldValue | undefined,
  options: readonly GeneratedFormlessUiReferenceOption[],
): FormlessUiReferenceFacts | undefined {
  if (field.type !== "reference") {
    return undefined;
  }

  return {
    clearable: !field.required,
    kind: "editor",
    valueStatus: referenceValueStatus(value, options),
  };
}

function projectReferenceDisplayFacts(
  field: FieldSchema,
  value: FieldValue | undefined,
  options: readonly GeneratedFormlessUiReferenceOption[],
): FormlessUiReferenceFacts | undefined {
  if (field.type !== "reference") {
    return undefined;
  }

  return {
    kind: "display",
    valueStatus: referenceValueStatus(value, options),
  };
}

function referenceValueStatus(
  value: FieldValue | undefined,
  options: readonly GeneratedFormlessUiReferenceOption[],
): FormlessUiReferenceValueStatus {
  if (typeof value !== "string" || value === "") {
    return { kind: "unset" };
  }

  return options.some((option) => option.id === value)
    ? { kind: "resolved", value }
    : { kind: "missing", value };
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

function projectIconOptions(): readonly FormlessUiIconOption[] {
  return listIconCatalogEntries().map(projectIconOption);
}

function projectIconOption(entry: IconCatalogEntry): FormlessUiIconOption {
  return {
    group: entry.group,
    id: entry.key,
    label: entry.label,
    source: entry.source,
  };
}

function selectIconPickerSelection(source: string): FormlessUiIconPickerSelection {
  if (source.trim() === "") {
    return { kind: "empty" };
  }

  const option = projectIconOptions().find((entry) => entry.source === source);

  if (option !== undefined) {
    return {
      kind: "option",
      optionId: option.id,
      source: option.source,
    };
  }

  return {
    kind: "customSource",
    source,
  };
}

function projectEnumOptions(
  field: Extract<FieldSchema, { type: "enum" }>,
): readonly FormlessUiEnumOption[] {
  return Object.entries(field.values).map(([value, option]) => ({
    label: option.label,
    presentation: projectEnumValuePresentation(field, value),
    status: "declared",
    value,
  }));
}

function projectEnumValuePresentation(
  field: Extract<FieldSchema, { type: "enum" }>,
  value: string,
): FormlessUiEnumValuePresentation {
  const option = field.values[value];
  const iconToken = option?.presentation?.icon;
  const icon = resolvePresentationIcon(option?.presentation?.icon);

  return {
    color: resolvePresentationColor(option?.presentation?.color),
    ...(icon === undefined ? {} : { icon }),
    iconKnown: iconToken === undefined || icon !== undefined,
    ...(iconToken === undefined ? {} : { iconToken }),
    label: option?.label ?? value,
  };
}

function projectEnumEditorFacts({
  field,
  presentation,
  style,
  surface,
  value,
}: {
  field: FieldSchema;
  presentation?: FormlessUiField["presentation"];
  style: "plain" | "rich";
  surface: "create" | "detail" | "operation" | "record" | "table-cell";
  value: FieldValue | undefined;
}): FormlessUiEnumFacts | undefined {
  if (field.type !== "enum") {
    return undefined;
  }

  const valueStatus = enumValueStatus(field, value);
  const placeholder =
    surface === "operation"
      ? "Select"
      : style === "rich" && valueStatus.kind === "unset"
        ? "None"
        : valueStatus.kind === "unset"
          ? ""
          : undefined;

  return {
    clearable: surface === "operation" || !field.required,
    kind: "editor",
    listContent: style === "rich" ? (presentation?.list ?? "both") : "label",
    ...(placeholder === undefined ? {} : { placeholder }),
    style,
    triggerContent: style === "rich" && presentation?.trigger !== "label" ? "both" : "label",
    valueStatus,
  };
}

function projectEnumDisplayFacts({
  field,
  presentation,
  value,
}: {
  field: FieldSchema;
  presentation?: FormlessUiField["presentation"];
  value: FieldValue | undefined;
}): FormlessUiEnumFacts | undefined {
  if (field.type !== "enum") {
    return undefined;
  }

  return {
    content: presentation?.mode === "iconOnly" ? "icon" : "label",
    kind: "display",
    valueStatus: enumValueStatus(field, value),
  };
}

function enumValueStatus(
  field: Extract<FieldSchema, { type: "enum" }>,
  value: FieldValue | undefined,
): FormlessUiEnumFacts["valueStatus"] {
  if (typeof value !== "string" || value === "") {
    return { kind: "unset" };
  }

  return Object.hasOwn(field.values, value)
    ? { kind: "declared", value }
    : { kind: "undeclared", value };
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
