import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type {
  FormlessUiActionIntentHandler,
  FormlessUiActionTriggerContract,
  FormlessUiCreateSurfaceContract,
  FormlessUiFieldIntent,
  FormlessUiOperationPresentationIntent,
  FormlessUiWorkspaceContract,
  FormlessUiWorkspaceIntent,
  FormlessUiWorkspaceIntentHandler,
  FormlessUiWorkspaceLinkActionContract,
} from "@dpeek/formless-astryx/contract";
import { FormlessUiContractHostProvider } from "@dpeek/formless-astryx/contract-host/react";
import type { QueryEvaluationContext, RecordValues } from "@dpeek/formless-schema";
import {
  createEntityRecordCountMatchingQuerySelector,
  createReferenceOptionsSelector,
  type BrowserReplicaProjectionSnapshot,
} from "../../client/projections.ts";
import { getClientStoreSnapshot, subscribeToClientStore, useSchema } from "../../client/store.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import { submitOperation } from "../../client/sync.ts";
import type {
  GeneratedOperationControlBinding,
  GeneratedOperationController,
  HomeOperationConfig,
  HomeScreenCollectionSectionModel,
  HomeScreenModel,
  RecordFieldConfig,
  RecordUnionPresentationConfig,
} from "../../client/views.ts";
import {
  createIdleGeneratedOperationExecutionState,
  projectCollectionOperationControlBinding,
} from "../../client/views.ts";
import {
  initialGeneratedCreateDraftSessionState,
  markGeneratedCreateDraftSessionSubmitted,
  selectGeneratedCreateDraftSession,
  type GeneratedCreateDraftSessionState,
} from "./create-field-authoring.ts";
import {
  executeCreateSubmitOperation,
  projectCreateSubmitBinding,
  type CreateHomeOperationConfig,
} from "./create.tsx";
import {
  adaptGeneratedCreateFormlessUiDraftChange,
  adaptGeneratedFormlessUiFieldIntent,
  applyGeneratedFormlessUiFieldIntentResult,
} from "./formless-ui-intents.ts";
import { projectGeneratedOperationFormlessUiControl } from "./formless-ui-operation-projection.ts";
import { projectGeneratedCreateFormlessUiSurface } from "./formless-ui-projection.ts";
import { generatedWorkspaceScopedId } from "./formless-ui-workspace-projection.ts";
import {
  type GeneratedListFieldAuthoringState,
  type GeneratedListOperationRuntime,
  selectGeneratedListRuntimeForIntent,
} from "./generated-list-foundation.ts";
import {
  type GeneratedRecordResultOperationRuntime,
  type GeneratedRecordResultRecordState,
  selectGeneratedRecordResultRuntimeForIntent,
} from "./generated-record-result-foundation.ts";
import {
  executeGeneratedTableRuntimeOperation,
  rebaseGeneratedTableFieldContextState,
  selectGeneratedWorkspaceTableFoundation,
  type GeneratedTableFieldContextState,
  type GeneratedTableRuntimePlan,
} from "./generated-table-foundation.tsx";
import { mergeGeneratedWorkspaceRecordFieldState } from "./generated-workspace-field-state.ts";
import {
  resolveGeneratedWorkspaceIntent,
  selectGeneratedWorkspaceFoundation,
  type GeneratedWorkspaceSectionFoundationInput,
  type GeneratedWorkspaceSectionSelection,
  type GeneratedWorkspaceSectionSelectionFacts,
} from "./generated-workspace-foundation.ts";
import {
  prepareGeneratedWorkspaceRuntimePublication,
  useGeneratedWorkspaceContractHost,
  type GeneratedWorkspaceRuntimePublication,
} from "./generated-workspace-contract-host.ts";
import { LegacySubscribedWorkspaceScreenRenderer } from "./legacy-workspace-screen-renderer.tsx";
import {
  executeGeneratedOperationControl,
  executeGeneratedOrderingMoveOperation,
  handleGeneratedOperationFormlessUiIntent,
  useGeneratedOperationController,
  useGeneratedOperationControllerVersion,
} from "./operation-control-runtime.ts";
import { executeRecordDeleteOperation } from "./record-delete.tsx";
import { shouldUseAppReplicaReferenceOptions } from "./reference-field-options.ts";
import { useSchemaAppTarget, useSchemaAppWriteOptions } from "./schema-app-context.tsx";
import { executeTransitionStateOperation } from "./state-machine-ui.tsx";

export type GeneratedWorkspaceSectionExternalAction = {
  action: FormlessUiActionTriggerContract;
  onIntent: FormlessUiActionIntentHandler;
};

export type GeneratedWorkspaceRuntimeProps = {
  getSectionSelection: (
    section: HomeScreenCollectionSectionModel,
  ) => GeneratedWorkspaceSectionSelection;
  onSelectContext: (section: HomeScreenCollectionSectionModel, recordId: string | null) => void;
  onSelectQuery: (section: HomeScreenCollectionSectionModel, queryName: string) => void;
  screen: HomeScreenModel;
  sectionExternalActions?: Readonly<
    Record<string, readonly GeneratedWorkspaceSectionExternalAction[] | undefined>
  >;
  today: string;
  workspaceActions?: readonly FormlessUiWorkspaceLinkActionContract[];
};

export type GeneratedWorkspaceRuntimeController = {
  dispatch: FormlessUiWorkspaceIntentHandler;
  publication: GeneratedWorkspaceRuntimePublication | undefined;
  workspace: FormlessUiWorkspaceContract | undefined;
};

type GeneratedWorkspaceExternalActionRuntime = {
  kind: "externalAction";
  onIntent: FormlessUiActionIntentHandler;
};

type GeneratedWorkspaceCreateRuntime = {
  binding: GeneratedOperationControlBinding;
  kind: "create";
  onSuccess?: (recordId: string) => void;
  operation: CreateHomeOperationConfig;
  queryContext: QueryEvaluationContext;
  surfaceId: string;
};

type GeneratedWorkspaceCommandRuntime = {
  binding: GeneratedOperationControlBinding;
  kind: "command";
  operation: Extract<HomeOperationConfig, { type: "command" }>;
};

type GeneratedWorkspaceTableRuntime = {
  kind: "table";
  runtimePlan: GeneratedTableRuntimePlan;
};

type GeneratedWorkspaceKnownControlRuntime =
  | GeneratedWorkspaceCommandRuntime
  | GeneratedWorkspaceCreateRuntime
  | GeneratedWorkspaceExternalActionRuntime;

type GeneratedWorkspaceResolvedField = Extract<
  ReturnType<typeof resolveGeneratedWorkspaceIntent>,
  { kind: "field" }
>;

export function GeneratedWorkspaceRuntime(props: GeneratedWorkspaceRuntimeProps) {
  const controller = useGeneratedWorkspaceRuntimeController(props);
  return <GeneratedWorkspaceStandaloneBoundary controller={controller} />;
}

export function useGeneratedWorkspaceRuntimeController({
  getSectionSelection,
  onSelectContext,
  onSelectQuery,
  screen,
  sectionExternalActions = {},
  today,
  workspaceActions = [],
}: GeneratedWorkspaceRuntimeProps): GeneratedWorkspaceRuntimeController {
  const snapshot = useSyncExternalStore(
    subscribeToClientStore,
    getClientStoreSnapshot,
    getClientStoreSnapshot,
  );
  const schema = useSchema();
  const [createOpenBySurfaceId, setCreateOpenBySurfaceId] = useState<
    Record<string, boolean | undefined>
  >({});
  const [createStateBySurfaceId, setCreateStateBySurfaceId] = useState<
    Record<string, GeneratedCreateDraftSessionState | undefined>
  >({});
  const [confirmationOpenByControlId, setConfirmationOpenByControlId] = useState<
    Record<string, boolean | undefined>
  >({});
  const [recordStateByResultId, setRecordStateByResultId] = useState<
    Record<string, GeneratedRecordResultRecordState | undefined>
  >({});
  const [listStateByResultId, setListStateByResultId] = useState<
    Record<
      string,
      Readonly<Record<string, GeneratedListFieldAuthoringState | undefined>> | undefined
    >
  >({});
  const [tableStateByResultId, setTableStateByResultId] = useState<
    Record<
      string,
      Readonly<Record<string, GeneratedTableFieldContextState | undefined>> | undefined
    >
  >({});
  const [tableDialogOpenById, setTableDialogOpenById] = useState<
    Record<string, boolean | undefined>
  >({});
  const idleController = useGeneratedOperationController([]);
  const sectionSelection = Object.fromEntries(
    screen.layout.sections.map((section) => [section.id, getSectionSelection(section)]),
  );
  const base = selectWorkspaceRuntimeFoundation({
    confirmationOpenByControlId,
    controller: idleController,
    createOpenBySurfaceId,
    createStateBySurfaceId,
    listStateByResultId,
    recordStateByResultId,
    schema,
    screen,
    sectionExternalActions,
    sectionSelection,
    snapshot,
    tableDialogOpenById,
    tableStateByResultId,
    today,
    workspaceActions,
  });
  const bindings = useMemo(() => base.bindings, [base.bindingKey]);
  const controller = useGeneratedOperationController(bindings);
  useGeneratedOperationControllerVersion(controller);
  const selected = selectWorkspaceRuntimeFoundation({
    confirmationOpenByControlId,
    controller,
    createOpenBySurfaceId,
    createStateBySurfaceId,
    listStateByResultId,
    recordStateByResultId,
    schema,
    screen,
    sectionExternalActions,
    sectionSelection,
    snapshot,
    tableDialogOpenById,
    tableStateByResultId,
    today,
    workspaceActions,
  });
  const appTarget = useSchemaAppTarget();
  const writeOptions = useSchemaAppWriteOptions();

  useEffect(() => {
    for (const section of selected.foundation?.runtimePlan.sections ?? []) {
      if (!section.collection.context) {
        continue;
      }
      const requested = sectionSelection[section.section.id]?.selectedContextRecordId ?? null;
      if (requested !== section.selectedContextRecordId) {
        onSelectContext(section.section, section.selectedContextRecordId);
      }
    }
  }, [onSelectContext, sectionSelection, selected.foundation]);

  async function onIntent(intent: FormlessUiWorkspaceIntent) {
    if (!selected.foundation) {
      return;
    }
    const resolved = resolveGeneratedWorkspaceIntent(selected.foundation.runtimePlan, intent);
    if (!resolved) {
      return;
    }

    if (resolved.kind === "querySelection") {
      onSelectQuery(resolved.section.section, resolved.query.queryName);
      return;
    }
    if (resolved.kind === "contextSelection") {
      onSelectContext(resolved.section.section, resolved.option.id);
      return;
    }
    if (resolved.kind === "control") {
      const runtime = resolved.runtime.runtime as GeneratedWorkspaceKnownControlRuntime;
      if (runtime.kind === "externalAction") {
        await runtime.onIntent(
          intent.type === "workspaceExternalAction"
            ? intent.intent
            : {
                controlId: resolved.runtime.contract.id,
                invocationSource: "button",
              },
        );
        return;
      }
      if (runtime.kind === "create") {
        await handleCreateIntent(runtime, intent);
        return;
      }
      if (intent.type === "workspaceOperation") {
        await handleGeneratedOperationFormlessUiIntent({
          binding: runtime.binding,
          confirmationOpen: confirmationOpenByControlId[runtime.binding.id] ?? false,
          controller,
          intent: intent.intent,
          invoke: (invokeIntent) =>
            executeGeneratedOperationControl({
              binding: runtime.binding,
              callerInput: { bindingId: runtime.binding.id, source: invokeIntent.invocationSource },
              controller,
            }),
          onConfirmationOpenChange: (open) =>
            setConfirmationOpenByControlId((current) => ({
              ...current,
              [runtime.binding.id]: open,
            })),
        });
      }
      return;
    }

    if (resolved.kind === "field") {
      if (resolved.runtime?.runtime) {
        const runtime = resolved.runtime.runtime as GeneratedWorkspaceKnownControlRuntime;
        if (
          runtime.kind === "create" &&
          intent.type === "workspaceField" &&
          resolved.field !== undefined
        ) {
          const current =
            createStateBySurfaceId[runtime.surfaceId] ?? initialCreateState(runtime.operation);
          const next = adaptGeneratedCreateFormlessUiDraftChange(
            intent.intent as Extract<FormlessUiFieldIntent, { type: "createDraftChange" }>,
            { state: current },
          ).state;
          setCreateStateBySurfaceId((states) => ({
            ...states,
            [runtime.surfaceId]: next,
          }));
        }
      }
      if (resolved.result && intent.type === "workspaceField") {
        if (resolved.result.kind === "list") {
          await handleListFieldIntent(resolved.result, resolved.section, intent);
        } else if (resolved.result.kind === "table") {
          await handleTableFieldIntent(resolved.result, resolved.section, intent);
        }
      }
      return;
    }

    if (resolved.kind === "result") {
      await handleResultIntent(resolved.result, resolved.section, intent);
    }
  }

  async function handleCreateIntent(
    runtime: GeneratedWorkspaceCreateRuntime,
    intent: FormlessUiWorkspaceIntent,
  ) {
    if (intent.type !== "workspaceCreate") {
      return;
    }
    if (intent.intent.type === "createOpenChange") {
      const open = intent.intent.open;
      setCreateOpenBySurfaceId((current) => ({
        ...current,
        [runtime.surfaceId]: open,
      }));
      if (!open) {
        setCreateStateBySurfaceId((current) => ({
          ...current,
          [runtime.surfaceId]: initialCreateState(runtime.operation),
        }));
      }
      return;
    }

    const current =
      createStateBySurfaceId[runtime.surfaceId] ?? initialCreateState(runtime.operation);
    const submitted = markGeneratedCreateDraftSessionSubmitted(current);
    const session = selectGeneratedCreateDraftSession({
      defaults: runtime.operation.defaults,
      enabled: runtime.operation.enabled,
      fields: runtime.operation.fields,
      queryContext: runtime.queryContext,
      state: submitted,
      union: runtime.operation.union,
    });
    setCreateStateBySurfaceId((states) => ({ ...states, [runtime.surfaceId]: submitted }));
    if (!session.canSubmit) {
      return;
    }
    const result = await executeCreateSubmitOperation({
      binding: runtime.binding,
      controller,
      progressMessage: `Saving ${runtime.operation.entity.label.toLowerCase()}...`,
      values: session.values,
    });
    if (result.type === "failed") {
      return;
    }
    const recordId = createdRecordId(result.createdRecordIds);
    setCreateOpenBySurfaceId((states) => ({ ...states, [runtime.surfaceId]: false }));
    setCreateStateBySurfaceId((states) => ({
      ...states,
      [runtime.surfaceId]: initialCreateState(runtime.operation),
    }));
    if (recordId) {
      runtime.onSuccess?.(recordId);
    }
  }

  async function handleResultIntent(
    result: Extract<
      ReturnType<typeof resolveGeneratedWorkspaceIntent>,
      { kind: "result" }
    >["result"],
    section: Extract<
      ReturnType<typeof resolveGeneratedWorkspaceIntent>,
      { kind: "result" }
    >["section"],
    intent: FormlessUiWorkspaceIntent,
  ) {
    if (result.kind === "list") {
      if (intent.type === "workspaceList") {
        const runtime = selectGeneratedListRuntimeForIntent(
          result.foundation.runtimePlan,
          intent.intent,
        );
        if (runtime?.item.plan.kind === "patch") {
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
        return;
      }
      if (intent.type === "workspaceOperation") {
        const runtime = result.foundation.runtimePlan.operationByControlId.get(intent.controlId);
        if (runtime && runtime.kind !== "ordering") {
          await handleNestedOperation(runtime, intent.intent);
        }
      }
      return;
    }

    if (result.kind === "recordResult") {
      if (intent.type !== "workspaceRecordResult") {
        return;
      }
      const runtime = selectGeneratedRecordResultRuntimeForIntent(
        result.foundation.runtimePlan,
        intent.intent,
      );
      if (runtime?.kind === "field" && intent.intent.type === "recordResultFieldIntent") {
        await handleRecordResultFieldIntent(result, section, intent.resultId, intent.intent.intent);
        return;
      }
      if (
        (runtime?.kind === "delete" || runtime?.kind === "transition") &&
        intent.intent.type === "recordResultOperationIntent"
      ) {
        await handleNestedOperation(runtime, intent.intent.intent);
      }
      return;
    }

    const tableRuntime = result.runtime as GeneratedWorkspaceTableRuntime;
    if (intent.type === "workspaceTable") {
      const tableIntent = intent.intent;
      if (tableIntent.type === "tableEditDialogOpenChange") {
        setTableDialogOpenById((current) => ({
          ...current,
          [tableIntent.dialogId]: tableIntent.open,
        }));
        return;
      }
      const runtime =
        tableIntent.type === "tableReorder"
          ? tableRuntime.runtimePlan.operations.find(
              (candidate) =>
                candidate.kind === "ordering" &&
                candidate.recordId === tableIntent.rowId &&
                candidate.item.direction === tableIntent.direction,
            )
          : "actionId" in tableIntent
            ? tableRuntime.runtimePlan.operationById.get(tableIntent.actionId)
            : undefined;
      if (runtime) {
        await executeGeneratedTableRuntimeOperation(runtime, controller, "menuItem");
      }
      return;
    }
    if (intent.type === "workspaceOperation") {
      const runtime = tableRuntime.runtimePlan.operationById.get(intent.controlId);
      if (runtime) {
        await handleGeneratedOperationFormlessUiIntent({
          binding: runtime.binding,
          confirmationOpen: confirmationOpenByControlId[runtime.binding.id] ?? false,
          controller,
          intent: intent.intent,
          invoke: (invokeIntent) =>
            executeGeneratedTableRuntimeOperation(
              runtime,
              controller,
              invokeIntent.invocationSource,
            ),
          onConfirmationOpenChange: (open) =>
            setConfirmationOpenByControlId((current) => ({
              ...current,
              [runtime.binding.id]: open,
            })),
        });
      }
    }
  }

  async function handleRecordResultFieldIntent(
    result: Extract<
      Extract<ReturnType<typeof resolveGeneratedWorkspaceIntent>, { kind: "result" }>["result"],
      { kind: "recordResult" }
    >,
    section: Extract<
      ReturnType<typeof resolveGeneratedWorkspaceIntent>,
      { kind: "result" }
    >["section"],
    resultId: string,
    fieldIntent: FormlessUiFieldIntent,
  ) {
    const recordId = result.foundation.runtimePlan.recordId;
    const record = recordId ? snapshot.recordsById[recordId] : undefined;
    if (!record) {
      return;
    }
    const contextResult = section.contextResult?.contract.id === resultId;
    const model = contextResult
      ? section.collection.context
      : section.collection.result.type === "record"
        ? section.collection.result
        : undefined;
    if (!model) {
      return;
    }
    const fields = model.recordFields ?? [];
    const current =
      result.recordState ??
      recordStateByResultId[resultId] ??
      (result.foundation.fieldState
        ? {
            ...result.foundation.fieldState,
            baselineRecordId: record.id,
            baselineUpdatedAt: record.updatedAt,
            confirmationOpenByControlId: {},
          }
        : undefined);
    if (!current) {
      return;
    }

    let next = current;
    let patch: { fieldName: string; patchValues: Partial<RecordValues> } | undefined;
    const adapted = adaptGeneratedFormlessUiFieldIntent(fieldIntent, {
      record: {
        editorDraftByFieldName: current.editorDraftByFieldName,
        fields,
        iconDialogDraftByFieldName: current.iconDialogDraftByFieldName,
        state: current.session,
        union: model.recordUnion,
      },
    });
    applyGeneratedFormlessUiFieldIntentResult(adapted, {
      onFieldErrorChange: ({ fieldName, message }) => {
        next = {
          ...next,
          errorsByFieldName: { ...next.errorsByFieldName, [fieldName]: message ?? undefined },
        };
      },
      onIconDialogDraftChange: ({ fieldName, value }) => {
        next = {
          ...next,
          iconDialogDraftByFieldName: { ...next.iconDialogDraftByFieldName, [fieldName]: value },
        };
      },
      onIconDialogOpenChange: ({ fieldName, open }) => {
        next = {
          ...next,
          iconDialogOpenByFieldName: { ...next.iconDialogOpenByFieldName, [fieldName]: open },
        };
      },
      onRecordDraftChange: (_change, state) => {
        if (state) {
          next = { ...next, session: state };
        }
      },
      onRecordEditorDraftChange: ({ fieldName, value }) => {
        next = {
          ...next,
          editorDraftByFieldName: { ...next.editorDraftByFieldName, [fieldName]: value },
        };
      },
      onRecordPatchResolve: (fieldName, resolution) => {
        if (resolution.fieldErrorChange === undefined && !resolution.noop) {
          patch = { fieldName, patchValues: resolution.patchValues };
        }
      },
    });
    setRecordStateByResultId((states) => {
      const queued = states[resultId] ?? current;
      const merged = mergeGeneratedWorkspaceRecordFieldState(queued, current, next);

      return merged === queued ? states : { ...states, [resultId]: merged };
    });

    const updateOperation = model.updateOperation;
    if (!patch || !updateOperation || Object.keys(patch.patchValues).length === 0) {
      return;
    }
    const committedPatch = patch;
    setRecordStateByResultId((states) => ({
      ...states,
      [resultId]: {
        ...(states[resultId] ?? next),
        pendingByFieldName: {
          ...(states[resultId] ?? next).pendingByFieldName,
          [committedPatch.fieldName]: true,
        },
      },
    }));
    setSyncStatus({ state: "syncing", message: `Updating ${committedPatch.fieldName}...` });
    try {
      await submitOperation(
        appTarget,
        record.entity,
        updateOperation.operationName,
        { input: committedPatch.patchValues, recordId: record.id },
        undefined,
        writeOptions,
      );
      setRecordStateByResultId((states) => ({
        ...states,
        [resultId]: {
          ...(states[resultId] ?? next),
          pendingByFieldName: {
            ...(states[resultId] ?? next).pendingByFieldName,
            [committedPatch.fieldName]: false,
          },
        },
      }));
      setSyncStatus({ state: "idle", message: "Updated and synced." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update failed.";
      setRecordStateByResultId((states) => ({
        ...states,
        [resultId]: {
          ...(states[resultId] ?? next),
          errorsByFieldName: {
            ...(states[resultId] ?? next).errorsByFieldName,
            [committedPatch.fieldName]: message,
          },
          pendingByFieldName: {
            ...(states[resultId] ?? next).pendingByFieldName,
            [committedPatch.fieldName]: false,
          },
        },
      }));
      setSyncStatus({ state: "error", message });
    }
  }

  async function handleListFieldIntent(
    result: Extract<NonNullable<GeneratedWorkspaceResolvedField["result"]>, { kind: "list" }>,
    section: GeneratedWorkspaceResolvedField["section"],
    intent: Extract<FormlessUiWorkspaceIntent, { type: "workspaceField" }>,
  ) {
    const model = section.collection.result;
    const recordId = intent.recordId;
    if (model.type !== "list" || !recordId) {
      return;
    }
    const record = snapshot.recordsById[recordId];
    const current = result.foundation.fieldStateByRecordId[recordId];
    if (!record || !current) {
      return;
    }
    if (intent.intent.type === "stateTransitionInvoke") {
      const transitionIntent = intent.intent;
      const runtime = result.foundation.runtimePlan.operations.find(
        (candidate) =>
          candidate.kind === "transition" &&
          candidate.recordId === recordId &&
          candidate.operation.operationName === transitionIntent.operationName,
      );
      if (runtime?.kind === "transition") {
        await executeTransitionStateOperation({
          binding: runtime.binding,
          controller,
          operation: runtime.operation,
          recordId,
          source: transitionIntent.source,
        });
      }
      return;
    }
    const applied = applyWorkspaceRecordFieldIntent(
      current,
      model.recordFields,
      model.recordUnion,
      intent.intent,
    );
    setListStateByResultId((states) => {
      const queued = states[result.contract.id]?.[recordId] ?? current;
      const merged = mergeGeneratedWorkspaceRecordFieldState(queued, current, applied.state);

      return merged === queued
        ? states
        : {
            ...states,
            [result.contract.id]: {
              ...states[result.contract.id],
              [recordId]: merged,
            },
          };
    });
    if (!applied.patch || !model.updateOperation) {
      return;
    }
    const committedPatch = applied.patch;
    setListStateByResultId((states) => ({
      ...states,
      [result.contract.id]: {
        ...states[result.contract.id],
        [recordId]: {
          ...(states[result.contract.id]?.[recordId] ?? applied.state),
          pendingByFieldName: {
            ...(states[result.contract.id]?.[recordId] ?? applied.state).pendingByFieldName,
            [committedPatch.fieldName]: true,
          },
        },
      },
    }));
    try {
      await submitOperation(
        appTarget,
        record.entity,
        model.updateOperation.operationName,
        { input: committedPatch.patchValues, recordId },
        undefined,
        writeOptions,
      );
      setListStateByResultId((states) => ({
        ...states,
        [result.contract.id]: {
          ...states[result.contract.id],
          [recordId]: {
            ...(states[result.contract.id]?.[recordId] ?? applied.state),
            pendingByFieldName: {
              ...(states[result.contract.id]?.[recordId] ?? applied.state).pendingByFieldName,
              [committedPatch.fieldName]: false,
            },
          },
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update failed.";
      setListStateByResultId((states) => ({
        ...states,
        [result.contract.id]: {
          ...states[result.contract.id],
          [recordId]: {
            ...(states[result.contract.id]?.[recordId] ?? applied.state),
            errorsByFieldName: {
              ...(states[result.contract.id]?.[recordId] ?? applied.state).errorsByFieldName,
              [committedPatch.fieldName]: message,
            },
            pendingByFieldName: {
              ...(states[result.contract.id]?.[recordId] ?? applied.state).pendingByFieldName,
              [committedPatch.fieldName]: false,
            },
          },
        },
      }));
      setSyncStatus({ state: "error", message });
    }
  }

  async function handleTableFieldIntent(
    result: Extract<NonNullable<GeneratedWorkspaceResolvedField["result"]>, { kind: "table" }>,
    _section: GeneratedWorkspaceResolvedField["section"],
    intent: Extract<FormlessUiWorkspaceIntent, { type: "workspaceField" }>,
  ) {
    const runtime = result.runtime as GeneratedWorkspaceTableRuntime;
    const fieldRuntime = result.fieldsById.get(intent.fieldId);
    if (!fieldRuntime) {
      return;
    }
    const { context } = fieldRuntime;
    if (intent.intent.type === "stateTransitionInvoke") {
      const transitionIntent = intent.intent;
      const transition = (runtime.runtimePlan.transitionsByContextId.get(context.id) ?? []).find(
        (candidate) =>
          candidate.recordId === transitionIntent.recordId &&
          candidate.operation.operationName === transitionIntent.operationName,
      );
      if (transition) {
        await executeGeneratedTableRuntimeOperation(
          transition,
          controller,
          transitionIntent.source,
        );
      }
      return;
    }
    const current = rebaseGeneratedTableFieldContextState(
      context,
      tableStateByResultId[result.contract.id]?.[context.id],
    );
    const applied = applyWorkspaceRecordFieldIntent(
      current,
      context.fields,
      context.union,
      intent.intent,
    );
    setTableStateByResultId((states) => {
      const queued = states[result.contract.id]?.[context.id] ?? current;
      const merged = mergeGeneratedWorkspaceRecordFieldState(queued, current, applied.state);

      return merged === queued
        ? states
        : {
            ...states,
            [result.contract.id]: {
              ...states[result.contract.id],
              [context.id]: merged,
            },
          };
    });
    if (!applied.patch || !context.updateOperation) {
      return;
    }
    const committedPatch = applied.patch;
    setTableStateByResultId((states) => ({
      ...states,
      [result.contract.id]: {
        ...states[result.contract.id],
        [context.id]: {
          ...(states[result.contract.id]?.[context.id] ?? applied.state),
          pendingByFieldName: {
            ...(states[result.contract.id]?.[context.id] ?? applied.state).pendingByFieldName,
            [committedPatch.fieldName]: true,
          },
        },
      },
    }));
    try {
      await submitOperation(
        appTarget,
        context.entityName,
        context.updateOperation.operationName,
        { input: committedPatch.patchValues, recordId: context.recordId },
        undefined,
        writeOptions,
      );
      setTableStateByResultId((states) => ({
        ...states,
        [result.contract.id]: {
          ...states[result.contract.id],
          [context.id]: {
            ...(states[result.contract.id]?.[context.id] ?? applied.state),
            pendingByFieldName: {
              ...(states[result.contract.id]?.[context.id] ?? applied.state).pendingByFieldName,
              [committedPatch.fieldName]: false,
            },
          },
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update failed.";
      setTableStateByResultId((states) => ({
        ...states,
        [result.contract.id]: {
          ...states[result.contract.id],
          [context.id]: {
            ...(states[result.contract.id]?.[context.id] ?? applied.state),
            errorsByFieldName: {
              ...(states[result.contract.id]?.[context.id] ?? applied.state).errorsByFieldName,
              [committedPatch.fieldName]: message,
            },
            pendingByFieldName: {
              ...(states[result.contract.id]?.[context.id] ?? applied.state).pendingByFieldName,
              [committedPatch.fieldName]: false,
            },
          },
        },
      }));
      setSyncStatus({ state: "error", message });
    }
  }

  async function handleNestedOperation(
    runtime:
      | Exclude<GeneratedListOperationRuntime, { kind: "ordering" }>
      | GeneratedRecordResultOperationRuntime,
    intent: FormlessUiOperationPresentationIntent,
  ) {
    await handleGeneratedOperationFormlessUiIntent({
      binding: runtime.binding,
      confirmationOpen: confirmationOpenByControlId[runtime.binding.id] ?? false,
      controller,
      intent,
      invoke: (invokeIntent) =>
        runtime.kind === "delete"
          ? executeRecordDeleteOperation({
              binding: runtime.binding,
              controller,
              recordId: runtime.recordId,
              recordLabel: runtime.recordLabel,
              source: invokeIntent.invocationSource,
            })
          : executeTransitionStateOperation({
              binding: runtime.binding,
              controller,
              operation: runtime.operation,
              recordId: runtime.recordId,
              source: invokeIntent.invocationSource,
            }),
      onConfirmationOpenChange: (open) =>
        setConfirmationOpenByControlId((current) => ({
          ...current,
          [runtime.binding.id]: open,
        })),
    });
  }

  const workspace = selected.foundation?.workspace;

  return {
    dispatch: onIntent,
    publication: workspace
      ? prepareGeneratedWorkspaceRuntimePublication(workspace, onIntent)
      : undefined,
    workspace,
  };
}

export function GeneratedWorkspaceStandaloneBoundary({
  controller,
}: {
  controller: GeneratedWorkspaceRuntimeController;
}) {
  const { host, workspaceReference } = useGeneratedWorkspaceContractHost({
    dispatch: controller.dispatch,
    publication: controller.publication,
  });

  if (!workspaceReference) {
    return null;
  }

  return (
    <FormlessUiContractHostProvider host={host}>
      <LegacySubscribedWorkspaceScreenRenderer reference={workspaceReference} />
    </FormlessUiContractHostProvider>
  );
}

type GeneratedWorkspaceRecordFieldState = {
  editorDraftByFieldName: Readonly<Record<string, string | undefined>>;
  errorsByFieldName: Readonly<Record<string, string | undefined>>;
  iconDialogDraftByFieldName: Readonly<Record<string, string | undefined>>;
  iconDialogOpenByFieldName: Readonly<Record<string, boolean | undefined>>;
  pendingByFieldName: Readonly<Record<string, boolean | undefined>>;
  session: GeneratedListFieldAuthoringState["session"];
};

function applyWorkspaceRecordFieldIntent<T extends GeneratedWorkspaceRecordFieldState>(
  current: T,
  fields: readonly RecordFieldConfig[],
  union: RecordUnionPresentationConfig | undefined,
  intent: FormlessUiFieldIntent,
): {
  patch?: { fieldName: string; patchValues: Partial<RecordValues> };
  state: T;
} {
  let state = current;
  let patch: { fieldName: string; patchValues: Partial<RecordValues> } | undefined;
  const result = adaptGeneratedFormlessUiFieldIntent(intent, {
    record: {
      editorDraftByFieldName: current.editorDraftByFieldName,
      fields,
      iconDialogDraftByFieldName: current.iconDialogDraftByFieldName,
      state: current.session,
      union,
    },
  });
  applyGeneratedFormlessUiFieldIntentResult(result, {
    onFieldErrorChange: ({ fieldName, message }) => {
      state = {
        ...state,
        errorsByFieldName: { ...state.errorsByFieldName, [fieldName]: message ?? undefined },
      };
    },
    onIconDialogDraftChange: ({ fieldName, value }) => {
      state = {
        ...state,
        iconDialogDraftByFieldName: { ...state.iconDialogDraftByFieldName, [fieldName]: value },
      };
    },
    onIconDialogOpenChange: ({ fieldName, open }) => {
      state = {
        ...state,
        iconDialogOpenByFieldName: { ...state.iconDialogOpenByFieldName, [fieldName]: open },
      };
    },
    onRecordDraftChange: (_change, nextSession) => {
      if (nextSession) {
        state = { ...state, session: nextSession };
      }
    },
    onRecordEditorDraftChange: ({ fieldName, value }) => {
      state = {
        ...state,
        editorDraftByFieldName: { ...state.editorDraftByFieldName, [fieldName]: value },
      };
    },
    onRecordPatchResolve: (fieldName, resolution) => {
      if (resolution.fieldErrorChange === undefined && !resolution.noop) {
        patch = { fieldName, patchValues: resolution.patchValues };
      }
    },
  });
  return { ...(patch === undefined ? {} : { patch }), state };
}

function selectWorkspaceRuntimeFoundation({
  confirmationOpenByControlId,
  controller,
  createOpenBySurfaceId,
  createStateBySurfaceId,
  listStateByResultId,
  recordStateByResultId,
  schema,
  screen,
  sectionExternalActions,
  sectionSelection,
  snapshot,
  tableDialogOpenById,
  tableStateByResultId,
  today,
  workspaceActions,
}: {
  confirmationOpenByControlId: Readonly<Record<string, boolean | undefined>>;
  controller: GeneratedOperationController;
  createOpenBySurfaceId: Readonly<Record<string, boolean | undefined>>;
  createStateBySurfaceId: Readonly<Record<string, GeneratedCreateDraftSessionState | undefined>>;
  listStateByResultId: Readonly<
    Record<
      string,
      Readonly<Record<string, GeneratedListFieldAuthoringState | undefined>> | undefined
    >
  >;
  recordStateByResultId: Readonly<Record<string, GeneratedRecordResultRecordState | undefined>>;
  schema: ReturnType<typeof useSchema>;
  screen: HomeScreenModel;
  sectionExternalActions: Readonly<
    Record<string, readonly GeneratedWorkspaceSectionExternalAction[] | undefined>
  >;
  sectionSelection: Readonly<Record<string, GeneratedWorkspaceSectionSelection>>;
  snapshot: BrowserReplicaProjectionSnapshot;
  tableDialogOpenById: Readonly<Record<string, boolean | undefined>>;
  tableStateByResultId: Readonly<
    Record<
      string,
      Readonly<Record<string, GeneratedTableFieldContextState | undefined>> | undefined
    >
  >;
  today: string;
  workspaceActions: readonly FormlessUiWorkspaceLinkActionContract[];
}) {
  const bindings: GeneratedOperationControlBinding[] = [];
  const foundation = selectGeneratedWorkspaceFoundation({
    screen,
    sectionSelection,
    selectSectionFoundation: (facts) => {
      const input = selectWorkspaceSectionRuntimeInput({
        confirmationOpenByControlId,
        controller,
        createOpenBySurfaceId,
        createStateBySurfaceId,
        facts,
        listStateByResultId,
        recordStateByResultId,
        schema,
        sectionExternalActions: sectionExternalActions[facts.section.id] ?? [],
        snapshot,
        tableDialogOpenById,
        tableStateByResultId,
      });
      collectWorkspaceBindings(input, bindings);
      return input;
    },
    snapshot,
    today,
    workspaceActions,
  });

  for (const section of foundation?.runtimePlan.sections ?? []) {
    if (section.result.kind === "list" || section.result.kind === "recordResult") {
      bindings.push(
        ...section.result.foundation.runtimePlan.operations.map((item) => item.binding),
      );
    }
    if (section.contextResult) {
      bindings.push(
        ...section.contextResult.foundation.runtimePlan.operations.map((item) => item.binding),
      );
    }
  }

  return {
    bindingKey: bindings.map((binding) => `${binding.id}:${binding.executionKey}`).join("|"),
    bindings,
    foundation,
  };
}

function selectWorkspaceSectionRuntimeInput({
  confirmationOpenByControlId,
  controller,
  createOpenBySurfaceId,
  createStateBySurfaceId,
  facts,
  listStateByResultId,
  recordStateByResultId,
  schema,
  sectionExternalActions,
  snapshot,
  tableDialogOpenById,
  tableStateByResultId,
}: {
  confirmationOpenByControlId: Readonly<Record<string, boolean | undefined>>;
  controller: GeneratedOperationController;
  createOpenBySurfaceId: Readonly<Record<string, boolean | undefined>>;
  createStateBySurfaceId: Readonly<Record<string, GeneratedCreateDraftSessionState | undefined>>;
  facts: GeneratedWorkspaceSectionSelectionFacts;
  listStateByResultId: Readonly<
    Record<
      string,
      Readonly<Record<string, GeneratedListFieldAuthoringState | undefined>> | undefined
    >
  >;
  recordStateByResultId: Readonly<Record<string, GeneratedRecordResultRecordState | undefined>>;
  schema: ReturnType<typeof useSchema>;
  sectionExternalActions: readonly GeneratedWorkspaceSectionExternalAction[];
  snapshot: BrowserReplicaProjectionSnapshot;
  tableDialogOpenById: Readonly<Record<string, boolean | undefined>>;
  tableStateByResultId: Readonly<
    Record<
      string,
      Readonly<Record<string, GeneratedTableFieldContextState | undefined>> | undefined
    >
  >;
}): GeneratedWorkspaceSectionFoundationInput {
  const operationStateByExecutionKey = new Proxy(
    {} as Record<string, ReturnType<GeneratedOperationController["getStateByExecutionKey"]>>,
    {
      get: (_target, executionKey) =>
        typeof executionKey === "string"
          ? controller.getStateByExecutionKey(executionKey)
          : undefined,
    },
  );
  const input: GeneratedWorkspaceSectionFoundationInput = {
    externalActions: sectionExternalActions.map(({ action, onIntent }) => {
      const controlId = generatedWorkspaceScopedId(facts.scope, "control", action.id);
      return {
        action: {
          ...action,
          id: controlId,
          invoke: { ...action.invoke, controlId },
        },
        id: action.id,
        runtime: {
          kind: "externalAction",
          onIntent,
        } satisfies GeneratedWorkspaceExternalActionRuntime,
      };
    }),
    list: {
      confirmationOpenByControlId,
      fieldStateByRecordId: listStateByResultId[facts.resultId],
      operationStateByExecutionKey,
      schema,
    },
    recordResult: {
      confirmationOpenByControlId,
      operationStateByExecutionKey,
      recordState: recordStateByResultId[facts.resultId],
      schema,
    },
  };
  const collectionActions = facts.section.collection.operations.map((operation) =>
    selectWorkspaceCollectionAction({
      confirmationOpenByControlId,
      controller,
      createOpenBySurfaceId,
      createStateBySurfaceId,
      facts,
      operation,
      snapshot,
    }),
  );
  input.collectionActions = collectionActions;

  const context = facts.section.collection.context;
  if (context?.createOperation) {
    const selected = selectWorkspaceCreateAction({
      controller,
      createOpenBySurfaceId,
      createStateBySurfaceId,
      facts,
      onSuccess: undefined,
      operation: context.createOperation,
      snapshot,
      surfaceLocalId: `context:${context.name}:${context.createOperation.operation.canonicalKey}`,
    });
    input.contextCreate = { action: selected.action, runtime: selected.runtime };
  }
  if (context) {
    const contextResultId = generatedWorkspaceScopedId(
      facts.scope,
      "result",
      `${context.itemViewName ?? `${context.name}:detail`}:context`,
    );
    input.contextDetail = {
      confirmationOpenByControlId,
      operationStateByExecutionKey,
      recordState: recordStateByResultId[contextResultId],
      schema,
    };
  }

  if (facts.section.collection.result.type === "table") {
    const table = selectGeneratedWorkspaceTableFoundation({
      confirmationOpenById: confirmationOpenByControlId,
      controller,
      dialogOpenById: tableDialogOpenById,
      entity: facts.section.collection.entity,
      entityName: facts.section.collection.entityName,
      fieldStateByContextId: tableStateByResultId[facts.resultId],
      id: facts.resultId,
      query: facts.selectedQuery.query,
      queryContext: facts.queryContext,
      queryName: facts.selectedQuery.queryName,
      recordIds: facts.recordIds,
      recordsById: facts.snapshot.recordsById,
      result: facts.section.collection.result,
      schema,
    });
    input.table = {
      fieldsById: table.fieldsById,
      runtime: {
        kind: "table",
        runtimePlan: table.runtimePlan,
      } satisfies GeneratedWorkspaceTableRuntime,
      table: table.table,
    };
  }

  return input;
}

function selectWorkspaceCollectionAction({
  confirmationOpenByControlId,
  controller,
  createOpenBySurfaceId,
  createStateBySurfaceId,
  facts,
  operation,
  snapshot,
}: {
  confirmationOpenByControlId: Readonly<Record<string, boolean | undefined>>;
  controller: GeneratedOperationController;
  createOpenBySurfaceId: Readonly<Record<string, boolean | undefined>>;
  createStateBySurfaceId: Readonly<Record<string, GeneratedCreateDraftSessionState | undefined>>;
  facts: GeneratedWorkspaceSectionSelectionFacts;
  operation: HomeOperationConfig;
  snapshot: BrowserReplicaProjectionSnapshot;
}) {
  if (operation.type === "create") {
    const selected = selectWorkspaceCreateAction({
      controller,
      createOpenBySurfaceId,
      createStateBySurfaceId,
      facts,
      operation,
      snapshot,
      surfaceLocalId: `collection:${operation.operation.canonicalKey}`,
    });
    return { ...selected, placement: "primary" as const };
  }

  const controlId = generatedWorkspaceScopedId(
    facts.scope,
    "control",
    `collection:${operation.operation.canonicalKey}`,
  );
  const binding = projectCollectionOperationControlBinding(operation, { id: controlId });
  const state =
    controller.getStateByExecutionKey(binding.executionKey) ??
    createIdleGeneratedOperationExecutionState(binding.executionKey);
  const targetCount = operation.ui.targetCount
    ? {
        accessibilityLabel: operation.ui.targetCount.ariaLabel,
        count: createEntityRecordCountMatchingQuerySelector(
          operation.entityName,
          operation.ui.targetCount.query,
          facts.actionQueryContext,
        )(snapshot),
      }
    : undefined;
  const control = projectGeneratedOperationFormlessUiControl({
    binding,
    confirmationOpen: confirmationOpenByControlId[binding.id] ?? false,
    presentation: {
      accessibilityLabel: operation.label,
      content: { kind: "label", label: operation.label },
      density: "default",
      pendingLabel: `${operation.label}...`,
      prominence: "secondary",
    },
    state,
    ...(targetCount === undefined ? {} : { targetCount }),
  });
  return {
    action: { control, kind: "operationAction" as const },
    placement: "secondary" as const,
    runtime: { binding, kind: "command", operation } satisfies GeneratedWorkspaceCommandRuntime,
  };
}

function selectWorkspaceCreateAction({
  controller,
  createOpenBySurfaceId,
  createStateBySurfaceId,
  facts,
  onSuccess,
  operation,
  snapshot,
  surfaceLocalId,
}: {
  controller: GeneratedOperationController;
  createOpenBySurfaceId: Readonly<Record<string, boolean | undefined>>;
  createStateBySurfaceId: Readonly<Record<string, GeneratedCreateDraftSessionState | undefined>>;
  facts: GeneratedWorkspaceSectionSelectionFacts;
  onSuccess?: (recordId: string) => void;
  operation: CreateHomeOperationConfig;
  snapshot: BrowserReplicaProjectionSnapshot;
  surfaceLocalId: string;
}) {
  const surfaceId = generatedWorkspaceScopedId(facts.scope, "surface", surfaceLocalId);
  const binding = projectCreateSubmitBinding(operation, surfaceId);
  const state = createStateBySurfaceId[surfaceId] ?? initialCreateState(operation);
  const session = selectGeneratedCreateDraftSession({
    defaults: operation.defaults,
    enabled: operation.enabled,
    fields: operation.fields,
    queryContext: facts.actionQueryContext,
    state,
    union: operation.union,
  });
  const referenceOptionsByFieldName = Object.fromEntries(
    operation.fields.map((fieldConfig) => {
      const field = fieldConfig.field;
      return [
        fieldConfig.fieldName,
        field.type === "reference" && shouldUseAppReplicaReferenceOptions(field)
          ? createReferenceOptionsSelector(field.to, field.displayField)(snapshot)
          : [],
      ];
    }),
  );
  const operationState = controller.getStateByExecutionKey(binding.executionKey);
  const surface: FormlessUiCreateSurfaceContract = projectGeneratedCreateFormlessUiSurface({
    enabled: operation.enabled,
    entityLabel: operation.entity.label,
    id: surfaceId,
    isSubmitting: operationState?.status === "pending",
    open: createOpenBySurfaceId[surfaceId] ?? false,
    referenceOptionsByFieldName,
    session,
    state,
    submitLabel: operation.label,
    trigger: {
      content: { kind: "label", label: operation.label },
      density: "default",
      prominence: "primary",
    },
    triggerLabel: operation.label,
  });

  return {
    action: { kind: "createAction" as const, surface },
    runtime: {
      binding,
      kind: "create",
      onSuccess,
      operation,
      queryContext: facts.actionQueryContext,
      surfaceId,
    } satisfies GeneratedWorkspaceCreateRuntime,
  };
}

function collectWorkspaceBindings(
  input: GeneratedWorkspaceSectionFoundationInput,
  bindings: GeneratedOperationControlBinding[],
) {
  for (const action of input.collectionActions ?? []) {
    const runtime = action.runtime as GeneratedWorkspaceKnownControlRuntime;
    if (runtime.kind === "create" || runtime.kind === "command") {
      bindings.push(runtime.binding);
    }
  }
  if (input.contextCreate) {
    bindings.push((input.contextCreate.runtime as GeneratedWorkspaceCreateRuntime).binding);
  }
  const tableRuntime = input.table?.runtime as GeneratedWorkspaceTableRuntime | undefined;
  if (tableRuntime) {
    bindings.push(...tableRuntime.runtimePlan.operations.map((operation) => operation.binding));
  }
}

function initialCreateState(operation: CreateHomeOperationConfig) {
  return initialGeneratedCreateDraftSessionState({
    defaults: operation.defaults,
    fields: operation.fields,
    union: operation.union,
  });
}

function createdRecordId(recordIds: readonly string[] | undefined) {
  return recordIds?.length === 1 ? recordIds[0] : undefined;
}
