import { useEffect, useMemo, useRef, useState } from "react";
import type { FormlessUiTableIntent } from "@dpeek/formless-astryx/contract";
import {
  listCoreImageMediaAssets,
  uploadCoreImageMediaFile,
  type ImageMediaAssetOption,
} from "@dpeek/formless-media/client";
import type { EntitySchema, QueryEvaluationContext, RecordValues } from "@dpeek/formless-schema";
import { useEntityRecordIdsMatchingQuery, useRecordsById, useSchema } from "../../client/store.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import { submitOperation } from "../../client/sync.ts";
import type { HomeQueryTabConfig } from "../../client/views.ts";
import type { TableCollectionResultModel } from "../../client/collection-result-model.ts";
import {
  adaptGeneratedFormlessUiFieldIntent,
  type GeneratedFormlessUiFieldIntentResult,
} from "./formless-ui-intents.ts";
import {
  createGeneratedTableFieldContextState,
  executeGeneratedTableRuntimeOperation,
  projectGeneratedRecordTable,
  resetFailedFieldContextSession,
  resolveGeneratedTableFieldIntent,
  selectFieldTransitionRuntime,
  selectGeneratedTableRuntimePlan,
  type GeneratedTableFieldContext,
  type GeneratedTableFieldContextState,
  type GeneratedTableOperationRuntime,
} from "./generated-table-foundation.tsx";
import {
  LegacyTableRenderer,
  type LegacyTableFieldIntentHandler,
  type LegacyTableOperationIntentHandler,
} from "./legacy-table-renderer.tsx";
import {
  handleGeneratedOperationFormlessUiIntent,
  useGeneratedOperationController,
  useGeneratedOperationControllerVersion,
} from "./operation-control-runtime.ts";
import { selectResultOrderingContext } from "./ordering-ui.ts";
import {
  fieldValueToRecordFieldEditorInputValue,
  imageMediaAssetOptionFromUpload,
  resolveGeneratedMediaUploadUpdateDraftPatchValues,
  selectGeneratedRecordFieldMediaAuthoring,
  upsertMediaAssetOption,
} from "./record-field-authoring.ts";
import { useSchemaAppTarget, useSchemaAppWriteOptions } from "./schema-app-context.tsx";
import { selectGeneratedTablePresentation } from "./table-presentation.ts";

export function GeneratedRecordTableFoundation({
  entity,
  entityName,
  query,
  queryName,
  queryContext,
  result,
}: {
  entity: EntitySchema;
  entityName: string;
  query: HomeQueryTabConfig["query"];
  queryName?: string;
  queryContext?: QueryEvaluationContext;
  result: TableCollectionResultModel;
}) {
  const appTarget = useSchemaAppTarget();
  const writeOptions = useSchemaAppWriteOptions();
  const schema = useSchema();
  const recordsById = useRecordsById();
  const recordIds = useEntityRecordIdsMatchingQuery(entityName, query, queryContext);
  const orderingContext = useMemo(
    () =>
      selectResultOrderingContext({
        entityName,
        ordering: result.ordering,
        recordIds,
        recordsById,
        updateOperation: result.updateOperation,
      }),
    [entityName, recordIds, recordsById, result.ordering, result.updateOperation],
  );
  const orderedRecordIds = orderingContext?.orderedRecordIds ?? recordIds;
  const presentation = useMemo(
    () =>
      selectGeneratedTablePresentation({
        canDelete: result.deleteOperation !== undefined,
        canPatch: result.updateOperation !== undefined,
        columns: result.columns,
        footer: result.footer ?? [],
        orderedRecordIds,
        orderingDragPatchEnabled: false,
        query,
        queryName,
        transitionOperations: result.transitionOperations,
      }),
    [orderedRecordIds, query, queryName, result],
  );
  const tableId = `${entityName}:${queryName ?? "table"}`;
  const runtimePlan = useMemo(
    () =>
      selectGeneratedTableRuntimePlan({
        entity,
        orderingContext,
        presentation,
        recordsById,
        result,
        tableId,
      }),
    [entity, orderingContext, presentation, recordsById, result, tableId],
  );
  const bindings = useMemo(
    () => runtimePlan.operations.map((operation) => operation.binding),
    [runtimePlan],
  );
  const controller = useGeneratedOperationController(bindings);
  useGeneratedOperationControllerVersion(controller);
  const [confirmationOpenById, setConfirmationOpenById] = useState<
    Record<string, boolean | undefined>
  >({});
  const [dialogOpenById, setDialogOpenById] = useState<Record<string, boolean | undefined>>({});
  const [fieldStateByContextId, setFieldStateByContextId] = useState<
    Record<string, GeneratedTableFieldContextState | undefined>
  >({});
  const [mediaAssetOptions, setMediaAssetOptions] = useState<ImageMediaAssetOption[]>([]);
  const projected = projectGeneratedRecordTable({
    confirmationOpenById,
    controller,
    dialogOpenById,
    entity,
    entityName,
    fieldStateByContextId,
    mediaAssetOptions,
    presentation,
    query,
    queryContext,
    recordsById,
    result,
    runtimePlan,
    schema,
    tableId,
  });
  const fieldContextsRef = useRef(projected.fieldContexts);
  const fieldStateRef = useRef(fieldStateByContextId);

  fieldContextsRef.current = projected.fieldContexts;
  fieldStateRef.current = fieldStateByContextId;

  const contextVersionKey = [...projected.fieldContexts.values()]
    .map(
      (context) =>
        `${context.id}:${context.record.updatedAt}:${context.fields.map((field) => field.fieldName).join(",")}`,
    )
    .join("|");

  useEffect(() => {
    setFieldStateByContextId((current) => {
      const next = { ...current };
      let changed = false;

      for (const context of fieldContextsRef.current.values()) {
        const existing = current[context.id];

        if (existing?.baselineUpdatedAt === context.record.updatedAt) {
          continue;
        }

        next[context.id] = createGeneratedTableFieldContextState(context);
        changed = true;
      }

      return changed ? next : current;
    });
  }, [contextVersionKey]);

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

  async function commitFieldPatch(
    context: GeneratedTableFieldContext,
    fieldName: string,
    patchValues: Partial<RecordValues>,
    options: {
      autoSaveSource?: "media-reference";
    } = {},
  ): Promise<boolean> {
    if (context.updateOperation === undefined) {
      return false;
    }

    if (Object.keys(patchValues).length === 0) {
      return true;
    }

    updateFieldContextState(context, (state) => ({
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
        context.entityName,
        context.updateOperation.operationName,
        { input: patchValues, recordId: context.recordId },
        undefined,
        {
          ...writeOptions,
          ...(options.autoSaveSource ? { autoSaveSource: options.autoSaveSource } : {}),
        },
      );
      updateFieldContextState(context, (state) => ({
        ...state,
        errorsByFieldName: { ...state.errorsByFieldName, [fieldName]: undefined },
        pendingByFieldName: { ...state.pendingByFieldName, [fieldName]: false },
      }));
      setSyncStatus({ state: "idle", message: "Updated and synced." });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update failed.";
      const fieldConfig = context.fields.find((field) => field.fieldName === fieldName);
      const recordValue = context.record.values[fieldName];
      const resetDraft = fieldConfig
        ? fieldValueToRecordFieldEditorInputValue(
            fieldConfig.field,
            recordValue,
            fieldConfig.format ?? "plain",
          )
        : undefined;

      updateFieldContextState(context, (state) => ({
        ...state,
        editorDraftByFieldName: {
          ...state.editorDraftByFieldName,
          [fieldName]: resetDraft,
        },
        errorsByFieldName: { ...state.errorsByFieldName, [fieldName]: message },
        pendingByFieldName: { ...state.pendingByFieldName, [fieldName]: false },
        session: resetFailedFieldContextSession(state.session, fieldConfig),
      }));
      setSyncStatus({ state: "error", message });
      return false;
    }
  }

  function updateFieldContextState(
    context: GeneratedTableFieldContext,
    update: (state: GeneratedTableFieldContextState) => GeneratedTableFieldContextState,
  ) {
    setFieldStateByContextId((current) => {
      const state = current[context.id] ?? createGeneratedTableFieldContextState(context);
      return { ...current, [context.id]: update(state) };
    });
  }

  async function handleMediaFileSelect(
    context: GeneratedTableFieldContext,
    fieldName: string,
    file: File | undefined,
  ): Promise<boolean> {
    const fieldConfig = context.fields.find((field) => field.fieldName === fieldName);

    if (!file || !fieldConfig || context.updateOperation === undefined) {
      return false;
    }

    updateFieldContextState(context, (state) => ({
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
        fieldStateRef.current[context.id] ?? createGeneratedTableFieldContextState(context);
      const mediaAuthoring = selectGeneratedRecordFieldMediaAuthoring({
        draft: state.editorDraftByFieldName[fieldName] ?? "",
        entityName: context.entityName,
        fieldConfig,
        mediaAssetOptions,
        schema,
      });
      const resolution = resolveGeneratedMediaUploadUpdateDraftPatchValues({
        baselineValues: state.session.baselineValues,
        draft: state.session.draft,
        entityName: context.entityName,
        fieldConfig,
        fields: context.fields,
        schema,
        union: context.union,
        upload,
        uploadPatchFields: mediaAuthoring.uploadPatchFields,
      });

      setMediaAssetOptions((current) => upsertMediaAssetOption(current, uploadedOption));
      return await commitFieldPatch(context, fieldName, resolution.patchValues, {
        autoSaveSource: "media-reference",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image upload failed.";

      updateFieldContextState(context, (state) => ({
        ...state,
        errorsByFieldName: { ...state.errorsByFieldName, [fieldName]: message },
        pendingByFieldName: { ...state.pendingByFieldName, [fieldName]: false },
      }));
      setSyncStatus({ state: "error", message });
      return false;
    }
  }

  async function applyFieldIntentResult(
    context: GeneratedTableFieldContext,
    result: GeneratedFormlessUiFieldIntentResult,
  ): Promise<boolean> {
    switch (result.kind) {
      case "recordDraftChange":
      case "recordEditorDraftChange":
      case "recordDraftRevert":
        updateFieldContextState(context, (state) => ({
          ...state,
          ...(result.state ? { session: result.state } : {}),
          editorDraftByFieldName: {
            ...state.editorDraftByFieldName,
            ...(result.editorDraftChange
              ? { [result.editorDraftChange.fieldName]: result.editorDraftChange.value }
              : {}),
          },
          errorsByFieldName: {
            ...state.errorsByFieldName,
            ...(result.fieldErrorChange
              ? {
                  [result.fieldErrorChange.fieldName]: result.fieldErrorChange.message ?? undefined,
                }
              : {}),
          },
        }));
        return true;
      case "recordValueCommit":
      case "recordValueUnitCommit": {
        if (result.fieldErrorChange) {
          updateFieldContextState(context, (state) => ({
            ...state,
            errorsByFieldName: {
              ...state.errorsByFieldName,
              [result.fieldErrorChange!.fieldName]: result.fieldErrorChange!.message ?? undefined,
            },
          }));
          return false;
        }

        return result.noop
          ? true
          : await commitFieldPatch(context, result.fieldName, result.patchValues);
      }
      case "fieldErrorChange":
        updateFieldContextState(context, (state) => ({
          ...state,
          errorsByFieldName: {
            ...state.errorsByFieldName,
            [result.fieldErrorChange.fieldName]: result.fieldErrorChange.message ?? undefined,
          },
        }));
        return true;
      case "iconDialogDraftChange":
        updateFieldContextState(context, (state) => ({
          ...state,
          iconDialogDraftByFieldName: {
            ...state.iconDialogDraftByFieldName,
            [result.iconDialogDraftChange.fieldName]: result.iconDialogDraftChange.value,
          },
        }));
        return true;
      case "iconDialogOpenChange":
        updateFieldContextState(context, (state) => ({
          ...state,
          iconDialogOpenByFieldName: {
            ...state.iconDialogOpenByFieldName,
            [result.iconDialogOpenChange.fieldName]: result.iconDialogOpenChange.open,
          },
        }));
        return true;
      case "iconDialogCancel":
        updateFieldContextState(context, (state) => ({
          ...state,
          iconDialogDraftByFieldName: {
            ...state.iconDialogDraftByFieldName,
            [result.iconDialogDraftChange.fieldName]: result.iconDialogDraftChange.value,
          },
          iconDialogOpenByFieldName: {
            ...state.iconDialogOpenByFieldName,
            [result.iconDialogOpenChange.fieldName]: result.iconDialogOpenChange.open,
          },
        }));
        return true;
      case "iconDialogSave":
        if ((await applyFieldIntentResult(context, result.commit)) && result.onCommitSuccess) {
          updateFieldContextState(context, (state) => ({
            ...state,
            editorDraftByFieldName: {
              ...state.editorDraftByFieldName,
              [result.onCommitSuccess!.editorDraftChange.fieldName]:
                result.onCommitSuccess!.editorDraftChange.value,
            },
            iconDialogOpenByFieldName: {
              ...state.iconDialogOpenByFieldName,
              [result.onCommitSuccess!.iconDialogOpenChange.fieldName]:
                result.onCommitSuccess!.iconDialogOpenChange.open,
            },
          }));
          return true;
        }
        return false;
      case "mediaAssetSelect":
        if (result.editorDraftChange) {
          updateFieldContextState(context, (state) => ({
            ...state,
            editorDraftByFieldName: {
              ...state.editorDraftByFieldName,
              [result.editorDraftChange!.fieldName]: result.editorDraftChange!.value,
            },
          }));
        }
        if (result.commit) {
          return await applyFieldIntentResult(context, result.commit);
        }
        return true;
      case "mediaFileSelect":
        return await handleMediaFileSelect(
          context,
          result.fileSelect.fieldName,
          result.fileSelect.file,
        );
      case "createDraftChange":
      case "operationDraftChange":
      case "stateTransitionDeferred":
      case "unsupported":
        return false;
    }
  }

  const onFieldIntent: LegacyTableFieldIntentHandler = async (
    contextId,
    fieldId,
    recordId,
    intent,
  ) => {
    const fieldRuntime = resolveGeneratedTableFieldIntent(projected.fieldsById, {
      contextId,
      fieldId,
      intent,
      recordId,
      tableId: projected.table.id,
    });

    if (!fieldRuntime) {
      return;
    }

    const { context } = fieldRuntime;

    if (intent.type === "stateTransitionInvoke") {
      const runtime = selectFieldTransitionRuntime(context.id, intent, runtimePlan);

      if (runtime) {
        await executeGeneratedTableRuntimeOperation(runtime, controller, intent.source);
      }
      return;
    }

    const state =
      fieldStateRef.current[contextId] ?? createGeneratedTableFieldContextState(context);
    const result = adaptGeneratedFormlessUiFieldIntent(intent, {
      record: {
        editorDraftByFieldName: state.editorDraftByFieldName,
        fields: context.fields,
        iconDialogDraftByFieldName: state.iconDialogDraftByFieldName,
        state: state.session,
        union: context.union,
      },
    });

    await applyFieldIntentResult(context, result);
  };

  const onOperationIntent: LegacyTableOperationIntentHandler = async (action, intent) => {
    const runtime = runtimePlan.operationById.get(action.control.id);

    if (!runtime) {
      return;
    }

    const confirmationOpen = confirmationOpenById[runtime.binding.id] ?? false;
    await handleGeneratedOperationFormlessUiIntent({
      binding: runtime.binding,
      confirmationOpen,
      controller,
      intent,
      invoke: (invokeIntent) =>
        executeGeneratedTableRuntimeOperation(runtime, controller, invokeIntent.invocationSource),
      onConfirmationOpenChange: (open) =>
        setConfirmationOpenById((current) => ({ ...current, [runtime.binding.id]: open })),
    });
  };

  async function onTableIntent(intent: FormlessUiTableIntent) {
    if (intent.type === "tableEditDialogOpenChange") {
      setDialogOpenById((current) => ({ ...current, [intent.dialogId]: intent.open }));
      return;
    }

    if (intent.type === "tableReorder") {
      const runtime = runtimePlan.operations.find(
        (operation): operation is Extract<GeneratedTableOperationRuntime, { kind: "ordering" }> =>
          operation.kind === "ordering" &&
          operation.recordId === intent.rowId &&
          operation.item.direction === intent.direction,
      );

      if (runtime?.kind === "ordering") {
        await executeGeneratedTableRuntimeOperation(runtime, controller, "menuItem");
      }
      return;
    }

    const runtime = runtimePlan.operationById.get(intent.actionId);
    if (runtime) {
      await executeGeneratedTableRuntimeOperation(runtime, controller, intent.invocationSource);
    }
  }

  return (
    <LegacyTableRenderer
      onFieldIntent={onFieldIntent}
      onOperationIntent={onOperationIntent}
      onTableIntent={onTableIntent}
      table={projected.table}
    />
  );
}
