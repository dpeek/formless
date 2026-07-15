import { useEffect, useMemo, useRef, useState } from "react";
import type { FormlessUiRecordResultIntent } from "@dpeek/formless-astryx/contract";
import {
  listCoreImageMediaAssets,
  uploadCoreImageMediaFile,
  type ImageMediaAssetOption,
} from "@dpeek/formless-media/client";
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
import type { RecordResultModel } from "../../client/list-result-model.ts";
import type { HomeQueryTabConfig, RecordFieldConfig } from "../../client/views.ts";
import {
  adaptGeneratedFormlessUiFieldIntent,
  type GeneratedFormlessUiFieldIntentResult,
} from "./formless-ui-intents.ts";
import {
  createGeneratedRecordResultFieldAuthoringState,
  selectGeneratedRecordResultFoundation,
  selectGeneratedRecordResultRuntimeForIntent,
  type GeneratedRecordResultFieldAuthoringState,
  type GeneratedRecordResultOperationRuntime,
} from "./generated-record-result-foundation.ts";
import { LegacyRecordResultRenderer } from "./legacy-record-result-renderer.tsx";
import {
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

type GeneratedRecordResultFieldRuntimeState = GeneratedRecordResultFieldAuthoringState & {
  baselineRecordId: string;
  baselineUpdatedAt: string;
};

export function GeneratedRecordResultRuntime({
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
  result: RecordResultModel;
}) {
  const appTarget = useSchemaAppTarget();
  const writeOptions = useSchemaAppWriteOptions();
  const schema = useSchema();
  const recordIds = useEntityRecordIdsMatchingQuery(entityName, query, queryContext);
  const recordsById = useRecordsById();
  const recordId = recordIds[0];
  const record = recordId === undefined ? undefined : recordsById[recordId];
  const resultId = `${entityName}:${result.itemViewName}`;
  const [confirmationOpenByControlId, setConfirmationOpenByControlId] = useState<
    Record<string, boolean | undefined>
  >({});
  const [fieldState, setFieldState] = useState<
    GeneratedRecordResultFieldRuntimeState | undefined
  >();
  const [mediaAssetOptions, setMediaAssetOptions] = useState<ImageMediaAssetOption[]>([]);
  const runtimePlan = useMemo(
    () =>
      selectGeneratedRecordResultFoundation({
        entity,
        entityName,
        fieldState,
        id: resultId,
        recordIds,
        recordsById,
        result,
      }).runtimePlan,
    [entity, entityName, fieldState, recordIds, recordsById, result, resultId],
  );
  const bindings = useMemo(
    () => runtimePlan.operations.map((operation) => operation.binding),
    [runtimePlan],
  );
  const controller = useGeneratedOperationController(bindings);
  useGeneratedOperationControllerVersion(controller);
  const referenceOptionsByFieldName = useMemo(
    () => generatedRecordResultReferenceOptions(recordsById, result),
    [recordsById, result],
  );
  const mediaAssetOptionsByFieldName = useMemo(
    () => generatedRecordResultMediaOptions(mediaAssetOptions, result),
    [mediaAssetOptions, result],
  );
  const operationStateByExecutionKey = Object.fromEntries(
    runtimePlan.operations.flatMap((operation) => {
      const state = controller.getStateByExecutionKey(operation.binding.executionKey);
      return state ? [[operation.binding.executionKey, state]] : [];
    }),
  );
  const foundation = selectGeneratedRecordResultFoundation({
    confirmationOpenByControlId,
    entity,
    entityName,
    fieldState,
    id: resultId,
    mediaAssetOptionsByFieldName,
    operationStateByExecutionKey,
    recordIds,
    recordsById,
    referenceOptionsByFieldName,
    result,
    schema,
  });
  const fieldStateRef = useRef(fieldState);
  fieldStateRef.current = fieldState;
  const recordVersionKey = `${recordId ?? "empty"}:${record?.updatedAt ?? "unavailable"}`;

  useEffect(() => {
    setFieldState((current) => {
      if (!record) {
        return current === undefined ? current : undefined;
      }

      if (
        current?.baselineRecordId === record.id &&
        current.baselineUpdatedAt === record.updatedAt
      ) {
        return current;
      }

      return initialFieldRuntimeState(record, result);
    });
  }, [record, recordVersionKey, result]);

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
    selectedRecord: StoredRecord,
    update: (
      state: GeneratedRecordResultFieldRuntimeState,
    ) => GeneratedRecordResultFieldRuntimeState,
  ) {
    setFieldState((current) => {
      const state =
        current?.baselineRecordId === selectedRecord.id
          ? current
          : initialFieldRuntimeState(selectedRecord, result);
      return update(state);
    });
  }

  async function commitFieldPatch(
    selectedRecord: StoredRecord,
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

    updateFieldState(selectedRecord, (state) => ({
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
        { input: patchValues, recordId: selectedRecord.id },
        undefined,
        {
          ...writeOptions,
          ...(options.autoSaveSource ? { autoSaveSource: options.autoSaveSource } : {}),
        },
      );
      updateFieldState(selectedRecord, (state) => ({
        ...state,
        errorsByFieldName: { ...state.errorsByFieldName, [fieldName]: undefined },
        pendingByFieldName: { ...state.pendingByFieldName, [fieldName]: false },
      }));
      setSyncStatus({ state: "idle", message: "Updated and synced." });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update failed.";
      const fieldConfig = generatedRecordResultFieldConfigs(result).find(
        (field) => field.fieldName === fieldName,
      );
      const resetDraft = fieldConfig
        ? fieldValueToRecordFieldEditorInputValue(
            fieldConfig.field,
            selectedRecord.values[fieldName],
            fieldConfig.format ?? "plain",
          )
        : undefined;

      updateFieldState(selectedRecord, (state) => ({
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
    selectedRecord: StoredRecord,
    fieldName: string,
    file: File | undefined,
  ): Promise<boolean> {
    const fieldConfig = generatedRecordResultFieldConfigs(result).find(
      (field) => field.fieldName === fieldName,
    );

    if (!file || !fieldConfig || result.updateOperation === undefined) {
      return false;
    }

    updateFieldState(selectedRecord, (state) => ({
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

      const state =
        fieldStateRef.current?.baselineRecordId === selectedRecord.id
          ? fieldStateRef.current
          : initialFieldRuntimeState(selectedRecord, result);
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
      return await commitFieldPatch(selectedRecord, fieldName, resolution.patchValues, {
        autoSaveSource: "media-reference",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image upload failed.";

      updateFieldState(selectedRecord, (state) => ({
        ...state,
        errorsByFieldName: { ...state.errorsByFieldName, [fieldName]: message },
        pendingByFieldName: { ...state.pendingByFieldName, [fieldName]: false },
      }));
      setSyncStatus({ state: "error", message });
      return false;
    }
  }

  async function applyFieldIntentResult(
    selectedRecord: StoredRecord,
    intentResult: GeneratedFormlessUiFieldIntentResult,
  ): Promise<boolean> {
    switch (intentResult.kind) {
      case "recordDraftChange":
      case "recordEditorDraftChange":
      case "recordDraftRevert":
        updateFieldState(selectedRecord, (state) => ({
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
          updateFieldState(selectedRecord, (state) => ({
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
          : await commitFieldPatch(
              selectedRecord,
              intentResult.fieldName,
              intentResult.patchValues,
            );
      case "fieldErrorChange":
        updateFieldState(selectedRecord, (state) => ({
          ...state,
          errorsByFieldName: {
            ...state.errorsByFieldName,
            [intentResult.fieldErrorChange.fieldName]:
              intentResult.fieldErrorChange.message ?? undefined,
          },
        }));
        return true;
      case "iconDialogDraftChange":
        updateFieldState(selectedRecord, (state) => ({
          ...state,
          iconDialogDraftByFieldName: {
            ...state.iconDialogDraftByFieldName,
            [intentResult.iconDialogDraftChange.fieldName]:
              intentResult.iconDialogDraftChange.value,
          },
        }));
        return true;
      case "iconDialogOpenChange":
        updateFieldState(selectedRecord, (state) => ({
          ...state,
          iconDialogOpenByFieldName: {
            ...state.iconDialogOpenByFieldName,
            [intentResult.iconDialogOpenChange.fieldName]: intentResult.iconDialogOpenChange.open,
          },
        }));
        return true;
      case "iconDialogCancel":
        updateFieldState(selectedRecord, (state) => ({
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
          (await applyFieldIntentResult(selectedRecord, intentResult.commit)) &&
          intentResult.onCommitSuccess
        ) {
          updateFieldState(selectedRecord, (state) => ({
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
          updateFieldState(selectedRecord, (state) => ({
            ...state,
            editorDraftByFieldName: {
              ...state.editorDraftByFieldName,
              [intentResult.editorDraftChange!.fieldName]: intentResult.editorDraftChange!.value,
            },
          }));
        }
        return intentResult.commit
          ? await applyFieldIntentResult(selectedRecord, intentResult.commit)
          : true;
      case "mediaFileSelect":
        return await handleMediaFileSelect(
          selectedRecord,
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

  async function onIntent(intent: FormlessUiRecordResultIntent) {
    const runtime = selectGeneratedRecordResultRuntimeForIntent(runtimePlan, intent);

    if (!runtime) {
      return;
    }

    const selectedRecord = recordsById[runtime.recordId];

    if (!selectedRecord) {
      return;
    }

    if (runtime.kind === "field") {
      if (intent.type !== "recordResultFieldIntent") {
        return;
      }

      const state =
        fieldStateRef.current?.baselineRecordId === selectedRecord.id
          ? fieldStateRef.current
          : initialFieldRuntimeState(selectedRecord, result);
      const intentResult = adaptGeneratedFormlessUiFieldIntent(intent.intent, {
        record: {
          editorDraftByFieldName: state.editorDraftByFieldName,
          fields: result.recordFields,
          iconDialogDraftByFieldName: state.iconDialogDraftByFieldName,
          state: state.session,
          union: result.recordUnion,
        },
      });

      await applyFieldIntentResult(selectedRecord, intentResult);
      return;
    }

    if (intent.type !== "recordResultOperationIntent") {
      return;
    }

    await handleGeneratedOperationFormlessUiIntent({
      binding: runtime.binding,
      confirmationOpen: confirmationOpenByControlId[runtime.binding.id] ?? false,
      controller,
      intent: intent.intent,
      invoke: (invokeIntent) =>
        executeRecordResultOperationRuntime(runtime, controller, invokeIntent.invocationSource),
      onConfirmationOpenChange: (open) =>
        setConfirmationOpenByControlId((current) => ({
          ...current,
          [runtime.binding.id]: open,
        })),
    });
  }

  return <LegacyRecordResultRenderer onIntent={onIntent} recordResult={foundation.recordResult} />;
}

async function executeRecordResultOperationRuntime(
  runtime: GeneratedRecordResultOperationRuntime,
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
  result: Pick<RecordResultModel, "recordFields" | "recordUnion">,
): GeneratedRecordResultFieldRuntimeState {
  return {
    ...createGeneratedRecordResultFieldAuthoringState(record, result),
    baselineRecordId: record.id,
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

function generatedRecordResultFieldConfigs(
  result: Pick<RecordResultModel, "recordFields" | "recordUnion">,
): RecordFieldConfig[] {
  return [
    ...result.recordFields,
    ...(result.recordUnion?.variants.flatMap((variant) =>
      variant.presentation.type === "fields" ? variant.presentation.fields : [],
    ) ?? []),
  ];
}

function generatedRecordResultReferenceOptions(
  recordsById: Readonly<Record<string, StoredRecord>>,
  result: Pick<RecordResultModel, "recordFields" | "recordUnion">,
) {
  const snapshot = getClientStoreSnapshot();

  if (snapshot.recordsById !== recordsById) {
    return {};
  }

  return Object.fromEntries(
    generatedRecordResultFieldConfigs(result).flatMap((fieldConfig) => {
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
}

function generatedRecordResultMediaOptions(
  mediaAssetOptions: readonly ImageMediaAssetOption[],
  result: Pick<RecordResultModel, "recordFields" | "recordUnion">,
) {
  return Object.fromEntries(
    generatedRecordResultFieldConfigs(result)
      .filter((fieldConfig) => fieldConfig.editor === "media")
      .map((fieldConfig) => [fieldConfig.fieldName, mediaAssetOptions]),
  );
}
