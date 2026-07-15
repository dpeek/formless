import type { ImageMediaAssetOption } from "@dpeek/formless-media/client";
import type {
  FormlessUiFieldIntent,
  FormlessUiRecordResultContract,
  FormlessUiRecordResultIntent,
} from "@dpeek/formless-astryx/contract";
import {
  resolveRecordFieldValue,
  type AppSchema,
  type EntitySchema,
  type GeneratedFieldDraftInput,
} from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import { getRecordReadinessWarnings } from "../../client/readiness.ts";
import { selectTransitionStateOperationAvailability } from "../../client/state-machine-model.ts";
import type { RecordResultModel } from "../../client/list-result-model.ts";
import {
  createIdleGeneratedOperationExecutionState,
  projectStateTransitionOperationControlBinding,
  type GeneratedOperationControlBinding,
  type GeneratedOperationExecutionState,
  type RecordFieldConfig,
  type TransitionStateOperationConfig,
  recordFieldRef,
} from "../../client/views.ts";
import {
  generatedRecordResultFieldId,
  projectGeneratedRecordResultFormlessUiContract,
  projectGeneratedRecordResultOperationAction,
  type GeneratedRecordResultPlacedAction,
} from "./formless-ui-record-result-projection.ts";
import { projectGeneratedOperationFormlessUiControl } from "./formless-ui-operation-projection.ts";
import {
  projectGeneratedRecordFormlessUiFields,
  type GeneratedFormlessUiReferenceOption,
} from "./formless-ui-projection.ts";
import { projectDeleteRecordButtonBinding, selectRecordLabel } from "./record-delete.tsx";
import {
  initialGeneratedUpdateDraftSessionState,
  selectGeneratedUpdateDraftSession,
  type GeneratedUpdateDraftSessionState,
} from "./record-field-authoring.ts";

export type GeneratedRecordResultFieldAuthoringState = {
  editorDraftByFieldName: Readonly<Record<string, string | undefined>>;
  errorsByFieldName: Readonly<Record<string, string | undefined>>;
  iconDialogDraftByFieldName: Readonly<Record<string, string | undefined>>;
  iconDialogOpenByFieldName: Readonly<Record<string, boolean | undefined>>;
  iconParseErrorByFieldName: Readonly<Record<string, string | undefined>>;
  pendingByFieldName: Readonly<Record<string, boolean | undefined>>;
  pendingLabelByFieldName: Readonly<Record<string, string | undefined>>;
  session: GeneratedUpdateDraftSessionState;
  unitDraftByFieldName: Readonly<Record<string, string | undefined>>;
  unitDraftInputByFieldName: Readonly<Record<string, GeneratedFieldDraftInput | undefined>>;
};

export type GeneratedRecordResultFieldRuntime = {
  fieldConfig: RecordFieldConfig;
  fieldId: string;
  kind: "field";
  recordId: string;
};

export type GeneratedRecordResultOperationRuntime =
  | {
      binding: GeneratedOperationControlBinding;
      kind: "delete";
      recordId: string;
      recordLabel: string;
    }
  | {
      binding: GeneratedOperationControlBinding;
      kind: "transition";
      operation: TransitionStateOperationConfig;
      recordId: string;
    };

export type GeneratedRecordResultRuntime =
  | GeneratedRecordResultFieldRuntime
  | GeneratedRecordResultOperationRuntime;

export type GeneratedRecordResultRuntimePlan = {
  fieldById: ReadonlyMap<string, GeneratedRecordResultFieldRuntime>;
  fields: readonly GeneratedRecordResultFieldRuntime[];
  operationByControlId: ReadonlyMap<string, GeneratedRecordResultOperationRuntime>;
  operations: readonly GeneratedRecordResultOperationRuntime[];
  recordId?: string;
  resultId: string;
};

export type GeneratedRecordResultFoundation = {
  fieldState?: GeneratedRecordResultFieldAuthoringState;
  recordResult: FormlessUiRecordResultContract;
  runtimePlan: GeneratedRecordResultRuntimePlan;
};

export type SelectGeneratedRecordResultFoundationOptions = {
  confirmationOpenByControlId?: Readonly<Record<string, boolean | undefined>>;
  density?: FormlessUiRecordResultContract["density"];
  editingDisabledReason?: string;
  emptyStateDescription?: string;
  emptyStateTitle?: string;
  entity: EntitySchema;
  entityName: string;
  fieldState?: GeneratedRecordResultFieldAuthoringState;
  id: string;
  mediaAssetOptionsByFieldName?: Readonly<Record<string, readonly ImageMediaAssetOption[]>>;
  operationStateByExecutionKey?: Readonly<
    Record<string, GeneratedOperationExecutionState | undefined>
  >;
  recordIds: readonly string[];
  recordsById: Readonly<Record<string, StoredRecord>>;
  referenceOptionsByFieldName?: Readonly<
    Record<string, readonly GeneratedFormlessUiReferenceOption[]>
  >;
  result: RecordResultModel;
  schema?: AppSchema | null;
};

export function selectGeneratedRecordResultFoundation({
  confirmationOpenByControlId = {},
  density = "default",
  editingDisabledReason,
  emptyStateDescription,
  emptyStateTitle,
  entity,
  entityName,
  fieldState,
  id,
  mediaAssetOptionsByFieldName,
  operationStateByExecutionKey = {},
  recordIds,
  recordsById,
  referenceOptionsByFieldName,
  result,
  schema = null,
}: SelectGeneratedRecordResultFoundationOptions): GeneratedRecordResultFoundation {
  const recordId = recordIds[0];
  const record = recordId === undefined ? undefined : recordsById[recordId];
  const resolvedEditingDisabledReason =
    editingDisabledReason ?? `Editing is disabled for ${entity.label}.`;

  if (recordId === undefined) {
    return {
      recordResult: projectGeneratedRecordResultFormlessUiContract({
        accessibilityLabel: `${entity.label} record`,
        density,
        editingDisabledReason: resolvedEditingDisabledReason,
        editingEnabled: result.updateOperation !== undefined,
        id,
        result: {
          ...(emptyStateDescription === undefined ? {} : { description: emptyStateDescription }),
          state: "empty",
          title: emptyStateTitle ?? `No ${entity.label.toLowerCase()} record found.`,
        },
      }),
      runtimePlan: emptyRuntimePlan(id),
    };
  }

  if (record === undefined) {
    return {
      recordResult: projectGeneratedRecordResultFormlessUiContract({
        accessibilityLabel: `${entity.label} record`,
        density,
        editingDisabledReason: resolvedEditingDisabledReason,
        editingEnabled: result.updateOperation !== undefined,
        id,
        result: {
          message: "Record unavailable.",
          recordId,
          recordLabel: `${entity.label} ${recordId}`,
          state: "unavailable",
        },
      }),
      runtimePlan: { ...emptyRuntimePlan(id), recordId },
    };
  }

  const initialFieldState =
    fieldState ?? createGeneratedRecordResultFieldAuthoringState(record, result);
  const nextFieldState = resolveGeneratedRecordResultSystemFieldValues(
    record,
    initialFieldState,
    result,
  );
  const session = selectGeneratedUpdateDraftSession({
    fields: result.recordFields,
    state: nextFieldState.session,
    union: result.recordUnion,
  });
  const fieldDisabledReasons = Object.fromEntries(
    session.visibleFields.map((field) => [field.fieldName, resolvedEditingDisabledReason]),
  );
  const fields = projectGeneratedRecordFormlessUiFields({
    canPatch: result.updateOperation !== undefined,
    density,
    disabledReasonByFieldName: fieldDisabledReasons,
    editorDraftByFieldName: nextFieldState.editorDraftByFieldName,
    entityName,
    errorsByFieldName: nextFieldState.errorsByFieldName,
    iconDialogDraftByFieldName: nextFieldState.iconDialogDraftByFieldName,
    iconDialogOpenByFieldName: nextFieldState.iconDialogOpenByFieldName,
    iconParseErrorByFieldName: nextFieldState.iconParseErrorByFieldName,
    mediaAssetOptionsByFieldName,
    pendingByFieldName: nextFieldState.pendingByFieldName as Readonly<Record<string, boolean>>,
    pendingLabelByFieldName: nextFieldState.pendingLabelByFieldName,
    recordId,
    referenceOptionsByFieldName,
    schema,
    session,
    showLabel: true,
    state: nextFieldState.session,
    surface: "record",
    unitDraftByFieldName: nextFieldState.unitDraftByFieldName,
    unitDraftInputByFieldName: nextFieldState.unitDraftInputByFieldName,
  });
  const recordLabel = selectRecordLabel(record, session.visibleFields, entity.label, recordId);
  const runtimePlan = selectGeneratedRecordResultRuntimePlan({
    entity,
    id,
    record,
    recordLabel,
    result,
    visibleFields: session.visibleFields,
  });
  const actions = projectGeneratedRecordResultActions({
    confirmationOpenByControlId,
    density,
    operationStateByExecutionKey,
    runtimePlan,
  });

  return {
    fieldState: nextFieldState,
    recordResult: projectGeneratedRecordResultFormlessUiContract({
      accessibilityLabel: `${entity.label} record`,
      density,
      editingDisabledReason: resolvedEditingDisabledReason,
      editingEnabled: result.updateOperation !== undefined,
      id,
      result: {
        actions,
        fields,
        readinessWarnings: getRecordReadinessWarnings(record, recordsById),
        recordId,
        recordLabel,
        state: "ready",
      },
    }),
    runtimePlan,
  };
}

export function createGeneratedRecordResultFieldAuthoringState(
  record: StoredRecord,
  result: Pick<RecordResultModel, "recordFields" | "recordUnion">,
): GeneratedRecordResultFieldAuthoringState {
  return {
    editorDraftByFieldName: {},
    errorsByFieldName: {},
    iconDialogDraftByFieldName: {},
    iconDialogOpenByFieldName: {},
    iconParseErrorByFieldName: {},
    pendingByFieldName: {},
    pendingLabelByFieldName: {},
    session: initialGeneratedUpdateDraftSessionState({
      baselineValues: record.values,
      fields: result.recordFields,
      union: result.recordUnion,
    }),
    unitDraftByFieldName: {},
    unitDraftInputByFieldName: {},
  };
}

export function selectGeneratedRecordResultRuntimeForIntent(
  runtimePlan: GeneratedRecordResultRuntimePlan,
  intent: FormlessUiRecordResultIntent,
): GeneratedRecordResultRuntime | undefined {
  if (intent.resultId !== runtimePlan.resultId || intent.recordId !== runtimePlan.recordId) {
    return undefined;
  }

  if (intent.type === "recordResultOperationIntent") {
    if (intent.controlId !== intent.intent.controlId) {
      return undefined;
    }

    return runtimePlan.operationByControlId.get(intent.controlId);
  }

  const runtime = runtimePlan.fieldById.get(intent.fieldId);
  const fieldName = recordResultFieldIntentFieldName(intent.intent);

  return runtime?.fieldConfig.fieldName === fieldName ? runtime : undefined;
}

function selectGeneratedRecordResultRuntimePlan({
  entity,
  id,
  record,
  recordLabel,
  result,
  visibleFields,
}: {
  entity: EntitySchema;
  id: string;
  record: StoredRecord;
  recordLabel: string;
  result: RecordResultModel;
  visibleFields: readonly RecordFieldConfig[];
}): GeneratedRecordResultRuntimePlan {
  const fields = visibleFields.map(
    (fieldConfig): GeneratedRecordResultFieldRuntime => ({
      fieldConfig,
      fieldId: generatedRecordResultFieldId(id, record.id, fieldConfig.fieldName),
      kind: "field",
      recordId: record.id,
    }),
  );
  const operations: GeneratedRecordResultOperationRuntime[] = [];

  for (const operation of result.transitionOperations) {
    const availability = selectTransitionStateOperationAvailability({
      currentValue: record.values[operation.fieldName],
      field: operation.field,
      operation,
    });
    const binding = projectStateTransitionOperationControlBinding({
      availability,
      operation,
      options: { executionTargetKey: record.id, idPrefix: `${id}:${record.id}` },
    });

    operations.push({ binding, kind: "transition", operation, recordId: record.id });
  }

  if (result.deleteOperation) {
    const binding = projectDeleteRecordButtonBinding({
      deleteOperation: result.deleteOperation,
      entityLabel: entity.label,
      recordId: record.id,
      recordLabel,
    });

    if (binding) {
      operations.push({ binding, kind: "delete", recordId: record.id, recordLabel });
    }
  }

  return {
    fieldById: new Map(fields.map((field) => [field.fieldId, field])),
    fields,
    operationByControlId: new Map(operations.map((operation) => [operation.binding.id, operation])),
    operations,
    recordId: record.id,
    resultId: id,
  };
}

function projectGeneratedRecordResultActions({
  confirmationOpenByControlId,
  density,
  operationStateByExecutionKey,
  runtimePlan,
}: {
  confirmationOpenByControlId: Readonly<Record<string, boolean | undefined>>;
  density: FormlessUiRecordResultContract["density"];
  operationStateByExecutionKey: Readonly<
    Record<string, GeneratedOperationExecutionState | undefined>
  >;
  runtimePlan: GeneratedRecordResultRuntimePlan;
}): readonly GeneratedRecordResultPlacedAction[] {
  return runtimePlan.operations.map((operation): GeneratedRecordResultPlacedAction => {
    const binding = operation.binding;
    const deleting = operation.kind === "delete";
    const state =
      operationStateByExecutionKey[binding.executionKey] ??
      createIdleGeneratedOperationExecutionState(binding.executionKey);
    const control = projectGeneratedOperationFormlessUiControl({
      binding,
      confirmationOpen: confirmationOpenByControlId[binding.id] ?? false,
      presentation: {
        accessibilityLabel: deleting ? `Delete ${operation.recordLabel}` : binding.label,
        content: { kind: "label", label: binding.label },
        density,
        pendingLabel: `${binding.label}...`,
        prominence: deleting ? "destructive" : "primary",
      },
      state,
    });

    return {
      action: projectGeneratedRecordResultOperationAction(
        control,
        deleting ? "delete" : "transition",
      ),
      placement: deleting ? "secondary" : "primary",
    };
  });
}

function emptyRuntimePlan(resultId: string): GeneratedRecordResultRuntimePlan {
  return {
    fieldById: new Map(),
    fields: [],
    operationByControlId: new Map(),
    operations: [],
    resultId,
  };
}

function resolveGeneratedRecordResultSystemFieldValues(
  record: StoredRecord,
  fieldState: GeneratedRecordResultFieldAuthoringState,
  result: Pick<RecordResultModel, "recordFields" | "recordUnion">,
): GeneratedRecordResultFieldAuthoringState {
  const session = selectGeneratedUpdateDraftSession({
    fields: result.recordFields,
    state: fieldState.session,
    union: result.recordUnion,
  });
  const baselineValues = { ...fieldState.session.baselineValues };

  for (const fieldConfig of session.visibleFields) {
    const fieldRef = recordFieldRef(fieldConfig);

    if (fieldRef.kind !== "system") {
      continue;
    }

    const value = resolveRecordFieldValue(record, fieldRef);

    if (value === undefined) {
      delete baselineValues[fieldConfig.fieldName];
    } else {
      baselineValues[fieldConfig.fieldName] = value;
    }
  }

  return {
    ...fieldState,
    session: { ...fieldState.session, baselineValues },
  };
}

function recordResultFieldIntentFieldName(intent: FormlessUiFieldIntent): string | undefined {
  switch (intent.type) {
    case "fieldErrorChange":
    case "iconDialogCancel":
    case "iconDialogDraftChange":
    case "iconDialogOpenChange":
    case "iconDialogSave":
    case "mediaAssetSelect":
    case "mediaFileSelect":
    case "recordDraftChange":
    case "recordDraftCommit":
    case "recordDraftRevert":
    case "recordEditorDraftChange":
    case "recordValueCommit":
    case "recordValueUnitCommit":
      return intent.fieldName;
    case "createDraftChange":
    case "operationDraftChange":
    case "stateTransitionInvoke":
      return undefined;
  }
}
