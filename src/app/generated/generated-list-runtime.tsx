import { useEffect, useMemo, useRef, useState } from "react";
import {
  listCoreImageMediaAssets,
  uploadCoreImageMediaFile,
  type ImageMediaAssetOption,
} from "@dpeek/formless-media/client";
import type { FormlessUiListIntent } from "@dpeek/formless-astryx/contract";
import type { EntitySchema, QueryEvaluationContext, RecordValues } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import { createReferenceOptionsSelector } from "../../client/projections.ts";
import {
  getClientStoreSnapshot,
  useEntityRecordIdsMatchingQuery,
  useRecordsById,
  useSchema,
} from "../../client/store.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import { submitOperation } from "../../client/sync.ts";
import type { HomeQueryTabConfig, RecordFieldConfig } from "../../client/views.ts";
import type { ListResultModel } from "../../client/list-result-model.ts";
import {
  adaptGeneratedFormlessUiFieldIntent,
  type GeneratedFormlessUiFieldIntentResult,
} from "./formless-ui-intents.ts";
import {
  createGeneratedListFieldAuthoringState,
  selectGeneratedListFoundation,
  selectGeneratedListRuntimeForIntent,
  type GeneratedListFieldAuthoringState,
  type GeneratedListOperationRuntime,
} from "./generated-list-foundation.ts";
import {
  LegacyListRenderer,
  type LegacyListFieldIntentHandler,
  type LegacyListOperationIntentHandler,
} from "./legacy-list-renderer.tsx";
import {
  executeGeneratedOrderingMoveOperation,
  handleGeneratedOperationFormlessUiIntent,
  useGeneratedOperationController,
  useGeneratedOperationControllerVersion,
} from "./operation-control-runtime.ts";
import { executeRecordDeleteOperation } from "./record-delete.tsx";
import {
  fieldValueToRecordFieldEditorInputValue,
  imageMediaAssetOptionFromUpload,
  nextGeneratedUpdateDraftSessionState,
  resolveGeneratedMediaUploadUpdateDraftPatchValues,
  selectGeneratedRecordFieldMediaAuthoring,
  type GeneratedUpdateDraftSessionState,
  upsertMediaAssetOption,
} from "./record-field-authoring.ts";
import { shouldUseAppReplicaReferenceOptions } from "./reference-field-options.ts";
import { useSchemaAppTarget, useSchemaAppWriteOptions } from "./schema-app-context.tsx";
import { executeTransitionStateOperation } from "./state-machine-ui.tsx";

type GeneratedListFieldRuntimeState = GeneratedListFieldAuthoringState & {
  baselineUpdatedAt: string;
};

export function GeneratedRecordListFoundation({
  entity,
  entityName,
  query,
  queryContext,
  result,
}: {
  entity: EntitySchema;
  entityName: string;
  query: HomeQueryTabConfig["query"];
  queryContext?: QueryEvaluationContext;
  result: ListResultModel;
}) {
  const appTarget = useSchemaAppTarget();
  const writeOptions = useSchemaAppWriteOptions();
  const schema = useSchema();
  const recordIds = useEntityRecordIdsMatchingQuery(entityName, query, queryContext);
  const recordsById = useRecordsById();
  const listId = `${entityName}:${result.itemViewName}`;
  const [confirmationOpenByControlId, setConfirmationOpenByControlId] = useState<
    Record<string, boolean | undefined>
  >({});
  const [fieldStateByRecordId, setFieldStateByRecordId] = useState<
    Record<string, GeneratedListFieldRuntimeState | undefined>
  >({});
  const [mediaAssetOptions, setMediaAssetOptions] = useState<ImageMediaAssetOption[]>([]);
  const runtimePlan = useMemo(
    () =>
      selectGeneratedListFoundation({
        entity,
        entityName,
        id: listId,
        recordIds,
        recordsById,
        result,
      }).runtimePlan,
    [entity, entityName, listId, recordIds, recordsById, result],
  );
  const bindings = useMemo(
    () => runtimePlan.operations.map((operation) => operation.binding),
    [runtimePlan],
  );
  const controller = useGeneratedOperationController(bindings);
  useGeneratedOperationControllerVersion(controller);
  const referenceOptionsByRecordId = useMemo(
    () => generatedListReferenceOptions(recordIds, recordsById, result),
    [recordIds, recordsById, result],
  );
  const mediaAssetOptionsByRecordId = useMemo(
    () => generatedListMediaOptions(recordIds, mediaAssetOptions, result),
    [mediaAssetOptions, recordIds, result],
  );
  const operationStateByExecutionKey = Object.fromEntries(
    runtimePlan.operations.flatMap((operation) => {
      const state = controller.getStateByExecutionKey(operation.binding.executionKey);
      return state ? [[operation.binding.executionKey, state]] : [];
    }),
  );
  const foundation = selectGeneratedListFoundation({
    confirmationOpenByControlId,
    entity,
    entityName,
    fieldStateByRecordId,
    id: listId,
    mediaAssetOptionsByRecordId,
    operationStateByExecutionKey,
    recordIds,
    recordsById,
    referenceOptionsByRecordId,
    result,
    schema,
  });
  const fieldStateRef = useRef(fieldStateByRecordId);
  fieldStateRef.current = fieldStateByRecordId;
  const recordVersionKey = recordIds
    .map((recordId) => `${recordId}:${recordsById[recordId]?.updatedAt ?? "unavailable"}`)
    .join("|");

  useEffect(() => {
    setFieldStateByRecordId((current) => {
      const next: Record<string, GeneratedListFieldRuntimeState | undefined> = {};
      let changed = Object.keys(current).length !== recordIds.length;

      for (const recordId of recordIds) {
        const record = recordsById[recordId];
        const existing = current[recordId];

        if (!record) {
          next[recordId] = undefined;
          changed ||= existing !== undefined;
          continue;
        }

        if (existing?.baselineUpdatedAt === record.updatedAt) {
          next[recordId] = existing;
          continue;
        }

        next[recordId] = initialFieldRuntimeState(record, result);
        changed = true;
      }

      return changed ? next : current;
    });
  }, [recordIds, recordsById, recordVersionKey, result]);

  useEffect(() => {
    let cancelled = false;

    void listCoreImageMediaAssets()
      .then((assets) => {
        if (!cancelled) {
          setMediaAssetOptions(assets);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMediaAssetOptions([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function updateFieldState(
    record: StoredRecord,
    update: (state: GeneratedListFieldRuntimeState) => GeneratedListFieldRuntimeState,
  ) {
    setFieldStateByRecordId((current) => {
      const state = current[record.id] ?? initialFieldRuntimeState(record, result);
      return { ...current, [record.id]: update(state) };
    });
  }

  async function commitFieldPatch(
    record: StoredRecord,
    fieldName: string,
    patchValues: Partial<RecordValues>,
    options: { autoSaveSource?: "media-reference" } = {},
  ): Promise<boolean> {
    if (result.updateOperation === undefined) {
      return false;
    }

    if (Object.keys(patchValues).length === 0) {
      return true;
    }

    updateFieldState(record, (state) => ({
      ...state,
      errorsByFieldName: { ...state.errorsByFieldName, [fieldName]: undefined },
      pendingByFieldName: { ...state.pendingByFieldName, [fieldName]: true },
    }));
    setSyncStatus({
      state: "syncing",
      message: `Updating ${Object.keys(patchValues).join(", ")}...`,
    });

    try {
      await submitOperation(
        appTarget,
        entityName,
        result.updateOperation.operationName,
        { input: patchValues, recordId: record.id },
        undefined,
        {
          ...writeOptions,
          ...(options.autoSaveSource ? { autoSaveSource: options.autoSaveSource } : {}),
        },
      );
      updateFieldState(record, (state) => ({
        ...state,
        errorsByFieldName: { ...state.errorsByFieldName, [fieldName]: undefined },
        pendingByFieldName: { ...state.pendingByFieldName, [fieldName]: false },
      }));
      setSyncStatus({ state: "idle", message: "Updated and synced." });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update failed.";
      const fieldConfig = generatedListFieldConfigs(result).find(
        (field) => field.fieldName === fieldName,
      );
      const resetDraft = fieldConfig
        ? fieldValueToRecordFieldEditorInputValue(
            fieldConfig.field,
            record.values[fieldName],
            fieldConfig.format ?? "plain",
          )
        : undefined;

      updateFieldState(record, (state) => ({
        ...state,
        editorDraftByFieldName: {
          ...state.editorDraftByFieldName,
          [fieldName]: resetDraft,
        },
        errorsByFieldName: { ...state.errorsByFieldName, [fieldName]: message },
        pendingByFieldName: { ...state.pendingByFieldName, [fieldName]: false },
        session: resetFailedFieldSession(state.session, fieldConfig),
      }));
      setSyncStatus({ state: "error", message });
      return false;
    }
  }

  async function handleMediaFileSelect(
    record: StoredRecord,
    fieldName: string,
    file: File | undefined,
  ): Promise<boolean> {
    const fieldConfig = generatedListFieldConfigs(result).find(
      (field) => field.fieldName === fieldName,
    );

    if (!file || !fieldConfig || result.updateOperation === undefined) {
      return false;
    }

    updateFieldState(record, (state) => ({
      ...state,
      pendingByFieldName: { ...state.pendingByFieldName, [fieldName]: true },
    }));
    setSyncStatus({ state: "syncing", message: "Uploading image..." });

    try {
      const upload = await uploadCoreImageMediaFile(file);
      const uploadedOption = imageMediaAssetOptionFromUpload(upload);

      if (!uploadedOption) {
        throw new Error("Image upload did not return a media asset id.");
      }

      const state = fieldStateRef.current[record.id] ?? initialFieldRuntimeState(record, result);
      const mediaAuthoring = selectGeneratedRecordFieldMediaAuthoring({
        draft: state.editorDraftByFieldName[fieldName] ?? "",
        entityName,
        fieldConfig,
        mediaAssetOptions,
        schema,
      });
      const resolution = resolveGeneratedMediaUploadUpdateDraftPatchValues({
        baselineValues: state.session.baselineValues,
        draft: state.session.draft,
        entityName,
        fieldConfig,
        fields: result.recordFields,
        schema,
        union: result.recordUnion,
        upload,
        uploadPatchFields: mediaAuthoring.uploadPatchFields,
      });

      setMediaAssetOptions((current) => upsertMediaAssetOption(current, uploadedOption));
      return await commitFieldPatch(record, fieldName, resolution.patchValues, {
        autoSaveSource: "media-reference",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image upload failed.";

      updateFieldState(record, (state) => ({
        ...state,
        errorsByFieldName: { ...state.errorsByFieldName, [fieldName]: message },
        pendingByFieldName: { ...state.pendingByFieldName, [fieldName]: false },
      }));
      setSyncStatus({ state: "error", message });
      return false;
    }
  }

  async function applyFieldIntentResult(
    record: StoredRecord,
    intentResult: GeneratedFormlessUiFieldIntentResult,
  ): Promise<boolean> {
    switch (intentResult.kind) {
      case "recordDraftChange":
      case "recordEditorDraftChange":
      case "recordDraftRevert":
        updateFieldState(record, (state) => ({
          ...state,
          ...(intentResult.state ? { session: intentResult.state } : {}),
          editorDraftByFieldName: {
            ...state.editorDraftByFieldName,
            ...(intentResult.editorDraftChange
              ? {
                  [intentResult.editorDraftChange.fieldName]: intentResult.editorDraftChange.value,
                }
              : {}),
          },
          errorsByFieldName: {
            ...state.errorsByFieldName,
            ...(intentResult.fieldErrorChange
              ? {
                  [intentResult.fieldErrorChange.fieldName]:
                    intentResult.fieldErrorChange.message ?? undefined,
                }
              : {}),
          },
        }));
        return true;
      case "recordValueCommit":
      case "recordValueUnitCommit":
        if (intentResult.fieldErrorChange) {
          updateFieldState(record, (state) => ({
            ...state,
            errorsByFieldName: {
              ...state.errorsByFieldName,
              [intentResult.fieldErrorChange!.fieldName]:
                intentResult.fieldErrorChange!.message ?? undefined,
            },
          }));
          return false;
        }
        return intentResult.noop
          ? true
          : await commitFieldPatch(record, intentResult.fieldName, intentResult.patchValues);
      case "fieldErrorChange":
        updateFieldState(record, (state) => ({
          ...state,
          errorsByFieldName: {
            ...state.errorsByFieldName,
            [intentResult.fieldErrorChange.fieldName]:
              intentResult.fieldErrorChange.message ?? undefined,
          },
        }));
        return true;
      case "iconDialogDraftChange":
        updateFieldState(record, (state) => ({
          ...state,
          iconDialogDraftByFieldName: {
            ...state.iconDialogDraftByFieldName,
            [intentResult.iconDialogDraftChange.fieldName]:
              intentResult.iconDialogDraftChange.value,
          },
        }));
        return true;
      case "iconDialogOpenChange":
        updateFieldState(record, (state) => ({
          ...state,
          iconDialogOpenByFieldName: {
            ...state.iconDialogOpenByFieldName,
            [intentResult.iconDialogOpenChange.fieldName]: intentResult.iconDialogOpenChange.open,
          },
        }));
        return true;
      case "iconDialogCancel":
        updateFieldState(record, (state) => ({
          ...state,
          iconDialogDraftByFieldName: {
            ...state.iconDialogDraftByFieldName,
            [intentResult.iconDialogDraftChange.fieldName]:
              intentResult.iconDialogDraftChange.value,
          },
          iconDialogOpenByFieldName: {
            ...state.iconDialogOpenByFieldName,
            [intentResult.iconDialogOpenChange.fieldName]: intentResult.iconDialogOpenChange.open,
          },
        }));
        return true;
      case "iconDialogSave":
        if (
          (await applyFieldIntentResult(record, intentResult.commit)) &&
          intentResult.onCommitSuccess
        ) {
          updateFieldState(record, (state) => ({
            ...state,
            editorDraftByFieldName: {
              ...state.editorDraftByFieldName,
              [intentResult.onCommitSuccess!.editorDraftChange.fieldName]:
                intentResult.onCommitSuccess!.editorDraftChange.value,
            },
            iconDialogOpenByFieldName: {
              ...state.iconDialogOpenByFieldName,
              [intentResult.onCommitSuccess!.iconDialogOpenChange.fieldName]:
                intentResult.onCommitSuccess!.iconDialogOpenChange.open,
            },
          }));
          return true;
        }
        return false;
      case "mediaAssetSelect":
        if (intentResult.editorDraftChange) {
          updateFieldState(record, (state) => ({
            ...state,
            editorDraftByFieldName: {
              ...state.editorDraftByFieldName,
              [intentResult.editorDraftChange!.fieldName]: intentResult.editorDraftChange!.value,
            },
          }));
        }
        return intentResult.commit
          ? await applyFieldIntentResult(record, intentResult.commit)
          : true;
      case "mediaFileSelect":
        return await handleMediaFileSelect(
          record,
          intentResult.fileSelect.fieldName,
          intentResult.fileSelect.file,
        );
      case "createDraftChange":
      case "operationDraftChange":
      case "stateTransitionDeferred":
      case "unsupported":
        return false;
    }
  }

  const onFieldIntent: LegacyListFieldIntentHandler = async (itemId, _field, intent) => {
    const record = recordsById[itemId];

    if (!record) {
      return;
    }

    const state = fieldStateRef.current[itemId] ?? initialFieldRuntimeState(record, result);
    const intentResult = adaptGeneratedFormlessUiFieldIntent(intent, {
      record: {
        editorDraftByFieldName: state.editorDraftByFieldName,
        fields: result.recordFields,
        iconDialogDraftByFieldName: state.iconDialogDraftByFieldName,
        state: state.session,
        union: result.recordUnion,
      },
    });

    await applyFieldIntentResult(record, intentResult);
  };

  const onOperationIntent: LegacyListOperationIntentHandler = async (action, intent) => {
    const runtime = runtimePlan.operationByControlId.get(action.control.id);

    if (!runtime || runtime.kind === "ordering") {
      return;
    }

    await handleGeneratedOperationFormlessUiIntent({
      binding: runtime.binding,
      confirmationOpen: confirmationOpenByControlId[runtime.binding.id] ?? false,
      controller,
      intent,
      invoke: (invokeIntent) =>
        executeListOperationRuntime(runtime, controller, invokeIntent.invocationSource),
      onConfirmationOpenChange: (open) =>
        setConfirmationOpenByControlId((current) => ({
          ...current,
          [runtime.binding.id]: open,
        })),
    });
  };

  async function onListIntent(intent: FormlessUiListIntent) {
    const runtime = selectGeneratedListRuntimeForIntent(runtimePlan, intent);

    if (!runtime || runtime.item.disabled || runtime.item.plan.kind === "unavailable") {
      return;
    }

    if (runtime.item.plan.kind === "rebalance") {
      setSyncStatus({ state: "error", message: "Rebalance required before reorder." });
      return;
    }

    await executeGeneratedOrderingMoveOperation({
      binding: runtime.binding,
      controller,
      failedMessage: "Move failed.",
      orderingContext: runtime.orderingContext,
      plan: runtime.item.plan,
      source: "menuItem",
      successMessage: "List item moved and synced.",
      syncingMessage: `${runtime.item.label}...`,
    });
  }

  return (
    <LegacyListRenderer
      list={foundation.list}
      onFieldIntent={onFieldIntent}
      onListIntent={onListIntent}
      onOperationIntent={onOperationIntent}
    />
  );
}

async function executeListOperationRuntime(
  runtime: Exclude<GeneratedListOperationRuntime, { kind: "ordering" }>,
  controller: ReturnType<typeof useGeneratedOperationController>,
  source: "button" | "confirmationDialog",
) {
  if (runtime.kind === "delete") {
    return executeRecordDeleteOperation({
      binding: runtime.binding,
      controller,
      recordId: runtime.recordId,
      recordLabel: runtime.recordLabel,
      source,
    });
  }

  return executeTransitionStateOperation({
    binding: runtime.binding,
    controller,
    operation: runtime.operation,
    recordId: runtime.recordId,
    source,
  });
}

function initialFieldRuntimeState(
  record: StoredRecord,
  result: Pick<ListResultModel, "recordFields" | "recordUnion">,
): GeneratedListFieldRuntimeState {
  return {
    ...createGeneratedListFieldAuthoringState(record, result),
    baselineUpdatedAt: record.updatedAt,
  };
}

function resetFailedFieldSession(
  session: GeneratedUpdateDraftSessionState,
  fieldConfig: RecordFieldConfig | undefined,
) {
  if (!fieldConfig) {
    return session;
  }

  const resetFieldSession = nextGeneratedUpdateDraftSessionState({
    fieldName: fieldConfig.fieldName,
    fieldValue: undefined,
    state: session,
  });
  const unitFieldName = fieldConfig.valueUnit?.unitFieldName;

  return unitFieldName === undefined
    ? resetFieldSession
    : nextGeneratedUpdateDraftSessionState({
        fieldName: unitFieldName,
        fieldValue: undefined,
        state: resetFieldSession,
      });
}

function generatedListFieldConfigs(
  result: Pick<ListResultModel, "recordFields" | "recordUnion">,
): RecordFieldConfig[] {
  return [
    ...result.recordFields,
    ...(result.recordUnion?.variants.flatMap((variant) =>
      variant.presentation.type === "fields" ? variant.presentation.fields : [],
    ) ?? []),
  ];
}

function generatedListReferenceOptions(
  recordIds: readonly string[],
  recordsById: Readonly<Record<string, StoredRecord>>,
  result: Pick<ListResultModel, "recordFields" | "recordUnion">,
) {
  const snapshot = getClientStoreSnapshot();

  if (snapshot.recordsById !== recordsById) {
    return {};
  }

  const byFieldName = Object.fromEntries(
    generatedListFieldConfigs(result).flatMap((fieldConfig) => {
      const field = fieldConfig.field;
      return field.type === "reference" && shouldUseAppReplicaReferenceOptions(field)
        ? [
            [
              fieldConfig.fieldName,
              createReferenceOptionsSelector(field.to, field.displayField)(snapshot),
            ],
          ]
        : [];
    }),
  );

  return Object.fromEntries(recordIds.map((recordId) => [recordId, byFieldName]));
}

function generatedListMediaOptions(
  recordIds: readonly string[],
  mediaAssetOptions: readonly ImageMediaAssetOption[],
  result: Pick<ListResultModel, "recordFields" | "recordUnion">,
) {
  const byFieldName = Object.fromEntries(
    generatedListFieldConfigs(result)
      .filter((fieldConfig) => fieldConfig.editor === "media")
      .map((fieldConfig) => [fieldConfig.fieldName, mediaAssetOptions]),
  );

  return Object.fromEntries(recordIds.map((recordId) => [recordId, byFieldName]));
}
