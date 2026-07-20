import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";
import type {
  FormlessUiActionIntentHandler,
  FormlessUiActionTriggerContract,
  FormlessUiCreateIntent,
  FormlessUiCreateSurfaceContract,
  FormlessUiFieldIntent,
  FormlessUiOperationPresentationIntent,
  FormlessUiWorkspaceContract,
  FormlessUiWorkspaceIntent,
  FormlessUiWorkspaceIntentHandler,
  FormlessUiWorkspaceLinkActionContract,
} from "@dpeek/formless-presentation/contract";
import { FormlessUiContractHostProvider } from "@dpeek/formless-presentation/contract-host/react";
import {
  listCoreImageMediaAssets,
  uploadCoreImageMediaFile,
  type ImageMediaAssetOption,
} from "@dpeek/formless-media/client";
import type { QueryEvaluationContext, RecordValues } from "@dpeek/formless-schema";
import type { StoredRecord } from "@dpeek/formless-storage";
import {
  createEntityRecordCountMatchingQuerySelector,
  createReferenceOptionsSelector,
  type BrowserReplicaProjectionSnapshot,
} from "../../client/projections.ts";
import { getClientStoreSnapshot, subscribeToClientStore, useSchema } from "../../client/store.ts";
import { setSyncStatus } from "../../client/sync-status.ts";
import { submitOperation } from "../../client/sync.ts";
import type { EntityOperationPresentationConfig } from "../../client/operation-presentation-model.ts";
import type {
  GeneratedOperationControlBinding,
  GeneratedOperationController,
  GeneratedOperationExecutionResult,
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
} from "./generated-create-runtime.ts";
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
import type {
  GeneratedTreeChildCreateRuntime,
  GeneratedTreeCreateFieldProjectionState,
} from "./generated-tree-create-foundation.ts";
import {
  prepareGeneratedWorkspaceRuntimePublication,
  useGeneratedWorkspaceContractHost,
  type GeneratedWorkspaceRuntimePublication,
} from "./generated-workspace-contract-host.ts";
import { ApplicationPresentation } from "../application-presentation.tsx";
import {
  executeGeneratedOperationControl,
  executeGeneratedOrderingMoveOperation,
  handleGeneratedOperationFormlessUiIntent,
  useGeneratedOperationController,
  useGeneratedOperationControllerVersion,
} from "./operation-control-runtime.ts";
import { executeRecordDeleteOperation } from "./record-delete-runtime.ts";
import {
  imageMediaAssetOptionFromUpload,
  resolveGeneratedMediaUploadUpdateDraftPatchValues,
  selectGeneratedRecordFieldMediaAuthoring,
  upsertMediaAssetOption,
} from "./record-field-authoring.ts";
import { shouldUseAppReplicaReferenceOptions } from "./reference-field-options.ts";
import { useSchemaAppTarget, useSchemaAppWriteOptions } from "./schema-app-context.tsx";
import { executeTransitionStateOperation } from "./state-machine-operation-runtime.ts";
import type { OperationCommandOutput } from "../../shared/operation-invocation.ts";
import { selectRecordFieldsForActiveUnion } from "./union-presentation.ts";

const GENERATED_TREE_CREATE_FAILURE_MESSAGE = "Create failed. Try again.";
const GENERATED_TREE_MOVE_FAILURE_MESSAGE = "Move failed. Try again.";
const GENERATED_TREE_REMOVE_FAILURE_MESSAGE = "Remove failed. Try again.";

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

export function GeneratedWorkspaceRuntimeRegistration({
  onController,
  ...props
}: GeneratedWorkspaceRuntimeProps & {
  onController: (controller: GeneratedWorkspaceRuntimeController | undefined) => void;
}) {
  const controller = useGeneratedWorkspaceRuntimeController(props);

  useLayoutEffect(() => {
    onController(controller);
  }, [controller, onController]);

  useLayoutEffect(() => () => onController(undefined), [onController]);

  return null;
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
  const [treeSelectedPlacementIdByResultId, setTreeSelectedPlacementIdByResultId] = useState<
    Record<string, string | null | undefined>
  >({});
  const [treeDisclosureOpenByItemId, setTreeDisclosureOpenByItemId] = useState<
    Record<string, boolean | undefined>
  >({});
  const [treeActiveChildVariantIdByCreationId, setTreeActiveChildVariantIdByCreationId] = useState<
    Record<string, string | null | undefined>
  >({});
  const [treeCreateErrorBySurfaceId, setTreeCreateErrorBySurfaceId] = useState<
    Record<string, string | undefined>
  >({});
  const [treeCreateFieldStateBySurfaceId, setTreeCreateFieldStateBySurfaceId] = useState<
    Record<string, GeneratedTreeCreateFieldProjectionState | undefined>
  >({});
  const [mediaAssetOptions, setMediaAssetOptions] = useState<ImageMediaAssetOption[]>([]);
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
    treeActiveChildVariantIdByCreationId,
    treeCreateErrorBySurfaceId,
    treeCreateFieldStateBySurfaceId,
    treeDisclosureOpenByItemId,
    treeSelectedPlacementIdByResultId,
    mediaAssetOptions,
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
    treeActiveChildVariantIdByCreationId,
    treeCreateErrorBySurfaceId,
    treeCreateFieldStateBySurfaceId,
    treeDisclosureOpenByItemId,
    treeSelectedPlacementIdByResultId,
    mediaAssetOptions,
    workspaceActions,
  });
  const appTarget = useSchemaAppTarget();
  const writeOptions = useSchemaAppWriteOptions();
  const hasTreeMediaFields = generatedWorkspaceHasTreeMediaFields(screen);

  useEffect(() => {
    let cancelled = false;

    if (!hasTreeMediaFields) {
      setMediaAssetOptions([]);
      return;
    }

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
  }, [hasTreeMediaFields]);

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

  useEffect(() => {
    setTreeSelectedPlacementIdByResultId((current) => {
      let next = current;

      for (const section of selected.foundation?.runtimePlan.sections ?? []) {
        if (section.result.kind !== "treeResult") {
          continue;
        }
        const resultId = section.result.contract.id;
        const selectedPlacementId = section.result.foundation.runtimePlan.selectedPlacementId;
        if (current[resultId] === selectedPlacementId) {
          continue;
        }
        if (next === current) {
          next = { ...current };
        }
        next[resultId] = selectedPlacementId;
      }

      return next;
    });
  }, [selected.foundation]);

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
    if (resolved.kind === "treeContextNavigation") {
      onSelectContext(resolved.section.section, resolved.navigation.recordId);
      return;
    }
    if (resolved.kind === "treeSelection") {
      setTreeSelectedPlacementIdByResultId((current) =>
        current[resolved.result.contract.id] === resolved.selection.placementId
          ? current
          : {
              ...current,
              [resolved.result.contract.id]: resolved.selection.placementId,
            },
      );
      return;
    }
    if (resolved.kind === "treeDisclosure") {
      setTreeDisclosureOpenByItemId((current) =>
        current[resolved.disclosure.itemId] === resolved.disclosure.open
          ? current
          : {
              ...current,
              [resolved.disclosure.itemId]: resolved.disclosure.open,
            },
      );
      return;
    }
    if (resolved.kind === "treeChildVariant") {
      const operation = resolved.runtime.operation;
      if (operation === undefined) {
        return;
      }
      setTreeActiveChildVariantIdByCreationId((current) => ({
        ...current,
        [resolved.runtime.creationId]: resolved.runtime.variantId,
      }));
      setCreateOpenBySurfaceId((current) => ({
        ...current,
        [resolved.runtime.surfaceId]: true,
      }));
      setCreateStateBySurfaceId((current) => ({
        ...current,
        [resolved.runtime.surfaceId]: initialCreateState(operation),
      }));
      setTreeCreateErrorBySurfaceId((current) => ({
        ...current,
        [resolved.runtime.surfaceId]: undefined,
      }));
      setTreeCreateFieldStateBySurfaceId((current) => ({
        ...current,
        [resolved.runtime.surfaceId]: undefined,
      }));
      return;
    }
    if (resolved.kind === "treeCreate") {
      if (intent.type === "workspaceTree" && intent.intent.type === "treeCreate") {
        await handleTreeCreateIntent(
          resolved.runtime,
          intent.intent.intent,
          resolved.result.contract.id,
        );
      }
      return;
    }
    if (resolved.kind === "treeCreateField") {
      if (intent.type !== "workspaceTree" || intent.intent.type !== "treeField") {
        return;
      }
      if (intent.intent.intent.type === "mediaFileSelect") {
        await handleTreeCreateMediaFileSelect(
          resolved.runtime,
          resolved.field.fieldName,
          intent.intent.intent.file,
        );
        return;
      }
      if (intent.intent.intent.type !== "createDraftChange") {
        return;
      }
      const current =
        createStateBySurfaceId[resolved.runtime.surfaceId] ??
        initialCreateState(resolved.runtime.operation);
      const next = adaptGeneratedCreateFormlessUiDraftChange(intent.intent.intent, {
        state: current,
      }).state;
      setCreateStateBySurfaceId((states) => ({
        ...states,
        [resolved.runtime.surfaceId]: next,
      }));
      setTreeCreateErrorBySurfaceId((errors) => ({
        ...errors,
        [resolved.runtime.surfaceId]: undefined,
      }));
      setTreeCreateFieldStateBySurfaceId((states) => ({
        ...states,
        [resolved.runtime.surfaceId]: clearGeneratedTreeCreateFieldError(
          states[resolved.runtime.surfaceId],
          resolved.field.fieldName,
        ),
      }));
      return;
    }
    if (resolved.kind === "treeField") {
      if (intent.type !== "workspaceTree" || intent.intent.type !== "treeField") {
        return;
      }
      await handleGeneratedRecordFieldIntent({
        current: resolved.runtime.target.recordState,
        fieldIntent: intent.intent.intent,
        fields: resolved.runtime.target.result.recordFields,
        recordId: resolved.runtime.target.recordId,
        resultId: resolved.runtime.target.fieldSetId,
        union: resolved.runtime.target.result.recordUnion,
        updateOperation: resolved.runtime.target.result.updateOperation,
      });
      return;
    }
    if (resolved.kind === "treeOrdering") {
      if (intent.type !== "workspaceTree" || intent.intent.type !== "treeReorder") {
        return;
      }
      const runtime = resolved.runtime;
      if (runtime.item.plan.kind !== "patch" || controller.isPending(runtime.binding.id)) {
        return;
      }
      await executeGeneratedOrderingMoveOperation({
        binding: runtime.binding,
        controller,
        failedMessage: GENERATED_TREE_MOVE_FAILURE_MESSAGE,
        orderingContext: runtime.orderingContext,
        plan: runtime.item.plan,
        source: "menuItem",
        successMessage: "Placement moved and synced.",
        syncingMessage: "Moving placement...",
      });
      return;
    }
    if (resolved.kind === "treeOperation") {
      if (intent.type !== "workspaceTree" || intent.intent.type !== "treeOperation") {
        return;
      }
      const runtime = resolved.runtime;
      await handleGeneratedOperationFormlessUiIntent({
        binding: runtime.binding,
        confirmationOpen: confirmationOpenByControlId[runtime.binding.id] ?? false,
        controller,
        intent: intent.intent.intent,
        invoke: (invokeIntent) =>
          executeGeneratedOperationControl({
            binding: runtime.binding,
            callerInput: {
              bindingId: runtime.binding.id,
              recordId: runtime.placementId,
              source: invokeIntent.invocationSource,
            },
            controller,
            feedback: {
              committedMessage: "Placement removed and synced.",
              failedMessage: GENERATED_TREE_REMOVE_FAILURE_MESSAGE,
              progressMessage: "Removing placement...",
              replayedMessage: "Placement removed and synced.",
            },
          }),
        onConfirmationOpenChange: (open) =>
          setConfirmationOpenByControlId((current) => ({
            ...current,
            [runtime.binding.id]: open,
          })),
        onSuccess: () =>
          setTreeSelectedPlacementIdByResultId((current) => ({
            ...current,
            [resolved.result.contract.id]: runtime.fallbackPlacementId,
          })),
      });
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

  async function handleTreeCreateIntent(
    runtime: GeneratedTreeChildCreateRuntime,
    intent: FormlessUiCreateIntent,
    resultId: string,
  ) {
    if (intent.type === "createOpenChange") {
      if (intent.open && runtime.surface.trigger.disabled) {
        return;
      }
      setCreateOpenBySurfaceId((current) => ({
        ...current,
        [runtime.surfaceId]: intent.open,
      }));
      if (!intent.open) {
        resetTreeCreate(runtime);
      }
      return;
    }

    if (controller.isPending(runtime.binding.id)) {
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
    setTreeCreateErrorBySurfaceId((errors) => ({
      ...errors,
      [runtime.surfaceId]: undefined,
    }));
    if (!session.canSubmit) {
      return;
    }

    const result = await executeGeneratedOperationControl({
      binding: runtime.binding,
      callerInput: {
        bindingId: runtime.binding.id,
        input: {
          childValues: session.values,
          ...(runtime.placementValues === undefined
            ? {}
            : { placementValues: runtime.placementValues }),
        },
        recordId: runtime.parentRecordId,
        source: "submitButton",
      },
      controller,
      feedback: {
        committedMessage: "Child created and synced.",
        failedMessage: GENERATED_TREE_CREATE_FAILURE_MESSAGE,
        progressMessage: `Saving ${runtime.operation.entity.label.toLowerCase()}...`,
        replayedMessage: "Child created and synced.",
      },
    });
    if (result.type === "failed") {
      setTreeCreateErrorBySurfaceId((errors) => ({
        ...errors,
        [runtime.surfaceId]: GENERATED_TREE_CREATE_FAILURE_MESSAGE,
      }));
      return;
    }

    const placementId = selectCreatedTreePlacementId(
      result,
      runtime.operation.entityName,
      runtime.placementEntityName,
    );
    resetTreeCreate(runtime);
    if (placementId !== undefined) {
      setTreeSelectedPlacementIdByResultId((currentSelection) => ({
        ...currentSelection,
        [resultId]: placementId,
      }));
    }
  }

  function resetTreeCreate(runtime: GeneratedTreeChildCreateRuntime) {
    setCreateOpenBySurfaceId((current) => ({
      ...current,
      [runtime.surfaceId]: false,
    }));
    setCreateStateBySurfaceId((current) => ({
      ...current,
      [runtime.surfaceId]: initialCreateState(runtime.operation),
    }));
    setTreeCreateErrorBySurfaceId((current) => ({
      ...current,
      [runtime.surfaceId]: undefined,
    }));
    setTreeCreateFieldStateBySurfaceId((current) => ({
      ...current,
      [runtime.surfaceId]: undefined,
    }));
    setTreeActiveChildVariantIdByCreationId((current) => ({
      ...current,
      [runtime.creationId]: null,
    }));
  }

  async function handleTreeCreateMediaFileSelect(
    runtime: GeneratedTreeChildCreateRuntime,
    fieldName: string,
    file: File | undefined,
  ) {
    const fieldConfig = runtime.operation.fields.find(
      (field) => field.fieldName === fieldName && field.editor === "media",
    );
    const fieldState = treeCreateFieldStateBySurfaceId[runtime.surfaceId];
    if (!file || !fieldConfig || fieldState?.pendingByFieldName[fieldName] === true) {
      return;
    }

    setTreeCreateFieldStateBySurfaceId((states) => ({
      ...states,
      [runtime.surfaceId]: updateGeneratedTreeCreateFieldState(
        states[runtime.surfaceId],
        fieldName,
        { error: undefined, pending: true },
      ),
    }));
    setSyncStatus({ state: "syncing", message: "Uploading image..." });

    try {
      const upload = await uploadCoreImageMediaFile(file);
      const uploadedOption = imageMediaAssetOptionFromUpload(upload);
      if (!uploadedOption) {
        throw new Error("Image upload did not return a media asset id.");
      }

      setMediaAssetOptions((options) => upsertMediaAssetOption(options, uploadedOption));
      setCreateStateBySurfaceId((states) => ({
        ...states,
        [runtime.surfaceId]: adaptGeneratedCreateFormlessUiDraftChange(
          {
            fieldName,
            fieldValue: { kind: "input", value: uploadedOption.id },
            type: "createDraftChange",
          },
          {
            state: states[runtime.surfaceId] ?? initialCreateState(runtime.operation),
          },
        ).state,
      }));
      setSyncStatus({ state: "idle", message: "Image uploaded." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image upload failed.";
      setTreeCreateFieldStateBySurfaceId((states) => ({
        ...states,
        [runtime.surfaceId]: updateGeneratedTreeCreateFieldState(
          states[runtime.surfaceId],
          fieldName,
          { error: message, pending: false },
        ),
      }));
      setSyncStatus({ state: "error", message });
      return;
    }

    setTreeCreateFieldStateBySurfaceId((states) => ({
      ...states,
      [runtime.surfaceId]: updateGeneratedTreeCreateFieldState(
        states[runtime.surfaceId],
        fieldName,
        { error: undefined, pending: false },
      ),
    }));
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

    if (result.kind !== "table") {
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
    await handleGeneratedRecordFieldIntent({
      current,
      fieldIntent,
      fields,
      recordId: record.id,
      resultId,
      union: model.recordUnion,
      updateOperation: model.updateOperation,
    });
  }

  async function handleGeneratedRecordFieldIntent({
    current,
    fieldIntent,
    fields,
    recordId,
    resultId,
    union,
    updateOperation,
  }: {
    current: GeneratedRecordResultRecordState;
    fieldIntent: FormlessUiFieldIntent;
    fields: readonly RecordFieldConfig[];
    recordId: string;
    resultId: string;
    union: RecordUnionPresentationConfig | undefined;
    updateOperation: EntityOperationPresentationConfig | undefined;
  }) {
    const record = snapshot.recordsById[recordId];
    if (record === undefined) {
      return;
    }

    if (fieldIntent.type === "mediaFileSelect") {
      await handleGeneratedRecordMediaFileSelect({
        current,
        fieldName: fieldIntent.fieldName,
        fields,
        file: fieldIntent.file,
        record,
        resultId,
        union,
        updateOperation,
      });
      return;
    }

    const applied = applyWorkspaceRecordFieldIntent(current, fields, union, fieldIntent);
    const next = applied.state;
    setRecordStateByResultId((states) => {
      const queued = states[resultId] ?? current;
      const merged = mergeGeneratedWorkspaceRecordFieldState(queued, current, next);
      return merged === queued ? states : { ...states, [resultId]: merged };
    });

    if (!applied.patch || !updateOperation) {
      return;
    }

    await commitGeneratedWorkspaceRecordFieldPatch({
      current: next,
      fieldName: applied.patch.fieldName,
      patchValues: applied.patch.patchValues,
      record,
      resultId,
      updateOperation,
    });
  }

  async function handleGeneratedRecordMediaFileSelect({
    current,
    fieldName,
    fields,
    file,
    record,
    resultId,
    union,
    updateOperation,
  }: {
    current: GeneratedRecordResultRecordState;
    fieldName: string;
    fields: readonly RecordFieldConfig[];
    file: File | undefined;
    record: StoredRecord;
    resultId: string;
    union: RecordUnionPresentationConfig | undefined;
    updateOperation: EntityOperationPresentationConfig | undefined;
  }) {
    const fieldConfig = selectRecordFieldsForActiveUnion([...fields], union, record).find(
      (field) => field.fieldName === fieldName && field.editor === "media",
    );
    if (
      !file ||
      !fieldConfig ||
      !updateOperation ||
      current.pendingByFieldName[fieldName] === true
    ) {
      return;
    }

    setRecordStateByResultId((states) => ({
      ...states,
      [resultId]: {
        ...(states[resultId] ?? current),
        errorsByFieldName: {
          ...(states[resultId] ?? current).errorsByFieldName,
          [fieldName]: undefined,
        },
        pendingByFieldName: {
          ...(states[resultId] ?? current).pendingByFieldName,
          [fieldName]: true,
        },
      },
    }));
    setSyncStatus({ state: "syncing", message: "Uploading image..." });

    try {
      const upload = await uploadCoreImageMediaFile(file);
      const uploadedOption = imageMediaAssetOptionFromUpload(upload);
      if (!uploadedOption) {
        throw new Error("Image upload did not return a media asset id.");
      }

      const mediaAuthoring = selectGeneratedRecordFieldMediaAuthoring({
        draft: current.editorDraftByFieldName[fieldName] ?? "",
        entityName: record.entity,
        fieldConfig,
        mediaAssetOptions,
        schema,
      });
      const resolution = resolveGeneratedMediaUploadUpdateDraftPatchValues({
        baselineValues: current.session.baselineValues,
        draft: current.session.draft,
        entityName: record.entity,
        fieldConfig,
        fields: [...fields],
        schema,
        union,
        upload,
        uploadPatchFields: mediaAuthoring.uploadPatchFields,
      });
      setMediaAssetOptions((options) => upsertMediaAssetOption(options, uploadedOption));
      await commitGeneratedWorkspaceRecordFieldPatch({
        autoSaveSource: "media-reference",
        current,
        fieldName,
        patchValues: resolution.patchValues,
        record,
        resultId,
        updateOperation,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image upload failed.";
      setRecordStateByResultId((states) => ({
        ...states,
        [resultId]: {
          ...(states[resultId] ?? current),
          errorsByFieldName: {
            ...(states[resultId] ?? current).errorsByFieldName,
            [fieldName]: message,
          },
          pendingByFieldName: {
            ...(states[resultId] ?? current).pendingByFieldName,
            [fieldName]: false,
          },
        },
      }));
      setSyncStatus({ state: "error", message });
    }
  }

  async function commitGeneratedWorkspaceRecordFieldPatch({
    autoSaveSource,
    current,
    fieldName,
    patchValues,
    record,
    resultId,
    updateOperation,
  }: {
    autoSaveSource?: "media-reference";
    current: GeneratedRecordResultRecordState;
    fieldName: string;
    patchValues: Partial<RecordValues>;
    record: StoredRecord;
    resultId: string;
    updateOperation: EntityOperationPresentationConfig;
  }) {
    if (Object.keys(patchValues).length === 0) {
      setRecordStateByResultId((states) => ({
        ...states,
        [resultId]: {
          ...(states[resultId] ?? current),
          errorsByFieldName: {
            ...(states[resultId] ?? current).errorsByFieldName,
            [fieldName]: undefined,
          },
          pendingByFieldName: {
            ...(states[resultId] ?? current).pendingByFieldName,
            [fieldName]: false,
          },
        },
      }));
      if (autoSaveSource === "media-reference") {
        setSyncStatus({ state: "idle", message: "Image uploaded." });
      }
      return;
    }

    setRecordStateByResultId((states) => ({
      ...states,
      [resultId]: {
        ...(states[resultId] ?? current),
        pendingByFieldName: {
          ...(states[resultId] ?? current).pendingByFieldName,
          [fieldName]: true,
        },
      },
    }));
    setSyncStatus({ state: "syncing", message: `Updating ${fieldName}...` });
    try {
      await submitOperation(
        appTarget,
        record.entity,
        updateOperation.operationName,
        { input: patchValues, recordId: record.id },
        undefined,
        {
          ...writeOptions,
          ...(autoSaveSource === undefined ? {} : { autoSaveSource }),
        },
      );
      setRecordStateByResultId((states) => ({
        ...states,
        [resultId]: {
          ...(states[resultId] ?? current),
          errorsByFieldName: {
            ...(states[resultId] ?? current).errorsByFieldName,
            [fieldName]: undefined,
          },
          pendingByFieldName: {
            ...(states[resultId] ?? current).pendingByFieldName,
            [fieldName]: false,
          },
        },
      }));
      setSyncStatus({ state: "idle", message: "Updated and synced." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update failed.";
      setRecordStateByResultId((states) => ({
        ...states,
        [resultId]: {
          ...(states[resultId] ?? current),
          errorsByFieldName: {
            ...(states[resultId] ?? current).errorsByFieldName,
            [fieldName]: message,
          },
          pendingByFieldName: {
            ...(states[resultId] ?? current).pendingByFieldName,
            [fieldName]: false,
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
      <ApplicationPresentation
        presentation={{ kind: "workspace", reference: workspaceReference }}
      />
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
  treeActiveChildVariantIdByCreationId,
  treeCreateErrorBySurfaceId,
  treeCreateFieldStateBySurfaceId,
  treeDisclosureOpenByItemId,
  treeSelectedPlacementIdByResultId,
  mediaAssetOptions,
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
  treeActiveChildVariantIdByCreationId: Readonly<Record<string, string | null | undefined>>;
  treeCreateErrorBySurfaceId: Readonly<Record<string, string | undefined>>;
  treeCreateFieldStateBySurfaceId: Readonly<
    Record<string, GeneratedTreeCreateFieldProjectionState | undefined>
  >;
  treeDisclosureOpenByItemId: Readonly<Record<string, boolean | undefined>>;
  treeSelectedPlacementIdByResultId: Readonly<Record<string, string | null | undefined>>;
  mediaAssetOptions: readonly ImageMediaAssetOption[];
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
        treeActiveChildVariantIdByCreationId,
        treeCreateErrorBySurfaceId,
        treeCreateFieldStateBySurfaceId,
        treeDisclosureOpenByItemId,
        treeSelectedPlacementIdByResultId,
        mediaAssetOptions,
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
    if (section.result.kind === "treeResult") {
      bindings.push(
        ...Array.from(section.result.foundation.runtimePlan.childCreateBySurfaceId.values()).map(
          (runtime) => runtime.binding,
        ),
        ...section.result.foundation.runtimePlan.orderings.map((runtime) => runtime.binding),
        ...section.result.foundation.runtimePlan.removePlacements.map((runtime) => runtime.binding),
      );
    }
    if (section.contextResult) {
      bindings.push(
        ...section.contextResult.foundation.runtimePlan.operations.map((item) => item.binding),
      );
    }
  }

  return {
    bindingKey: bindings
      .map((binding) => `${binding.id}:${binding.executionKey}`)
      .sort()
      .join("|"),
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
  treeActiveChildVariantIdByCreationId,
  treeCreateErrorBySurfaceId,
  treeCreateFieldStateBySurfaceId,
  treeDisclosureOpenByItemId,
  treeSelectedPlacementIdByResultId,
  mediaAssetOptions,
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
  treeActiveChildVariantIdByCreationId: Readonly<Record<string, string | null | undefined>>;
  treeCreateErrorBySurfaceId: Readonly<Record<string, string | undefined>>;
  treeCreateFieldStateBySurfaceId: Readonly<
    Record<string, GeneratedTreeCreateFieldProjectionState | undefined>
  >;
  treeDisclosureOpenByItemId: Readonly<Record<string, boolean | undefined>>;
  treeSelectedPlacementIdByResultId: Readonly<Record<string, string | null | undefined>>;
  mediaAssetOptions: readonly ImageMediaAssetOption[];
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
    tree: {
      disclosureOpenByItemId: treeDisclosureOpenByItemId,
      childCreation: {
        activeVariantIdByCreationId: treeActiveChildVariantIdByCreationId,
        createErrorBySurfaceId: treeCreateErrorBySurfaceId,
        createOpenBySurfaceId,
        createStateBySurfaceId,
        fieldStateBySurfaceId: treeCreateFieldStateBySurfaceId,
        mediaAssetOptionsByFieldName: selectWorkspaceRecordMediaOptions(
          collectRecordPresentationFields(
            facts.section.collection.result.type === "tree"
              ? facts.section.collection.result.childRecordFields
              : [],
            facts.section.collection.result.type === "tree"
              ? facts.section.collection.result.childRecordUnion
              : undefined,
          ),
          mediaAssetOptions,
        ),
        operationStateByExecutionKey,
        queryContext: facts.actionQueryContext,
        referenceOptionsByFieldName: selectWorkspaceRecordReferenceOptions(
          collectRecordPresentationFields(
            facts.section.collection.result.type === "tree"
              ? facts.section.collection.result.childRecordFields
              : [],
            facts.section.collection.result.type === "tree"
              ? facts.section.collection.result.childRecordUnion
              : undefined,
          ),
          snapshot,
        ),
      },
      childFields: {
        mediaAssetOptionsByFieldName: selectWorkspaceRecordMediaOptions(
          collectRecordPresentationFields(
            facts.section.collection.result.type === "tree"
              ? facts.section.collection.result.childRecordFields
              : [],
            facts.section.collection.result.type === "tree"
              ? facts.section.collection.result.childRecordUnion
              : undefined,
          ),
          mediaAssetOptions,
        ),
        referenceOptionsByFieldName: selectWorkspaceRecordReferenceOptions(
          collectRecordPresentationFields(
            facts.section.collection.result.type === "tree"
              ? facts.section.collection.result.childRecordFields
              : [],
            facts.section.collection.result.type === "tree"
              ? facts.section.collection.result.childRecordUnion
              : undefined,
          ),
          snapshot,
        ),
      },
      fieldStateByFieldSetId: recordStateByResultId,
      placementFields: {
        mediaAssetOptionsByFieldName: selectWorkspaceRecordMediaOptions(
          collectRecordPresentationFields(
            facts.section.collection.result.type === "tree"
              ? (facts.section.collection.result.placementRecordFields ?? [])
              : [],
            facts.section.collection.result.type === "tree"
              ? facts.section.collection.result.placementRecordUnion
              : undefined,
          ),
          mediaAssetOptions,
        ),
        referenceOptionsByFieldName: selectWorkspaceRecordReferenceOptions(
          collectRecordPresentationFields(
            facts.section.collection.result.type === "tree"
              ? (facts.section.collection.result.placementRecordFields ?? [])
              : [],
            facts.section.collection.result.type === "tree"
              ? facts.section.collection.result.placementRecordUnion
              : undefined,
          ),
          snapshot,
        ),
      },
      ordering: {
        operationStateByExecutionKey,
      },
      placementRemoval: {
        confirmationOpenByControlId,
        operationStateByExecutionKey,
      },
      schema,
      selectedPlacementId: treeSelectedPlacementIdByResultId[facts.resultId],
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

function collectRecordPresentationFields(
  fields: readonly RecordFieldConfig[],
  union: RecordUnionPresentationConfig | undefined,
): RecordFieldConfig[] {
  const byName = new Map(fields.map((field) => [field.fieldName, field]));
  for (const presentation of [
    ...(union?.variants ?? []),
    ...(union?.fallback ? [union.fallback] : []),
  ]) {
    if (presentation.presentation.type !== "fields") {
      continue;
    }
    for (const field of presentation.presentation.fields) {
      byName.set(field.fieldName, field);
    }
  }
  return [...byName.values()];
}

function generatedWorkspaceHasTreeMediaFields(screen: HomeScreenModel): boolean {
  return screen.layout.sections.some(({ collection }) => {
    const result = collection.result;
    if (result.type !== "tree") {
      return false;
    }

    return [
      ...collectRecordPresentationFields(result.childRecordFields, result.childRecordUnion),
      ...collectRecordPresentationFields(
        result.placementRecordFields ?? [],
        result.placementRecordUnion,
      ),
    ].some((field) => field.editor === "media");
  });
}

function selectWorkspaceRecordMediaOptions(
  fields: readonly RecordFieldConfig[],
  mediaAssetOptions: readonly ImageMediaAssetOption[],
) {
  return Object.fromEntries(
    fields.flatMap((field) =>
      field.editor === "media" ? [[field.fieldName, mediaAssetOptions] as const] : [],
    ),
  );
}

function selectWorkspaceRecordReferenceOptions(
  fields: readonly RecordFieldConfig[],
  snapshot: BrowserReplicaProjectionSnapshot,
) {
  return Object.fromEntries(
    fields.map((fieldConfig) => {
      const field = fieldConfig.field;
      return [
        fieldConfig.fieldName,
        field.type === "reference" && shouldUseAppReplicaReferenceOptions(field)
          ? createReferenceOptionsSelector(field.to, field.displayField)(snapshot)
          : [],
      ];
    }),
  );
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

function updateGeneratedTreeCreateFieldState(
  current: GeneratedTreeCreateFieldProjectionState | undefined,
  fieldName: string,
  update: { error: string | undefined; pending: boolean },
): GeneratedTreeCreateFieldProjectionState {
  return {
    errorsByFieldName: {
      ...current?.errorsByFieldName,
      [fieldName]: update.error,
    },
    pendingByFieldName: {
      ...current?.pendingByFieldName,
      [fieldName]: update.pending,
    },
  };
}

function clearGeneratedTreeCreateFieldError(
  current: GeneratedTreeCreateFieldProjectionState | undefined,
  fieldName: string,
): GeneratedTreeCreateFieldProjectionState {
  return updateGeneratedTreeCreateFieldState(current, fieldName, {
    error: undefined,
    pending: current?.pendingByFieldName[fieldName] ?? false,
  });
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

function selectCreatedTreePlacementId(
  result: GeneratedOperationExecutionResult,
  childEntityName: string,
  placementEntityName: string,
): string | undefined {
  if (result.type === "failed" || !isOperationCommandOutput(result.output)) {
    return undefined;
  }

  const createdRecords = result.output.changes
    .filter((change) => change.operationKind === "create" && !change.payload.deletedAt)
    .map((change) => change.payload);
  const child = createdRecords.find((record) => record.entity === childEntityName);
  const placement = createdRecords.find((record) => record.entity === placementEntityName);

  if (child !== undefined && placement !== undefined) {
    return placement.id;
  }

  const steps = result.output.recordPlan?.steps.filter((step) => step.kind === "create") ?? [];
  const childStep = steps.find((step) => step.entity === childEntityName);
  const placementStep = steps.find((step) => step.entity === placementEntityName);
  return childStep === undefined ? undefined : placementStep?.recordId;
}

function isOperationCommandOutput(output: unknown): output is OperationCommandOutput {
  return (
    typeof output === "object" && output !== null && "type" in output && output.type === "command"
  );
}
