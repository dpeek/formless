import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type {
  FormlessUiButtonContent,
  FormlessUiCreateFieldIntentHandler,
  FormlessUiCreateIntent,
  FormlessUiCreateSurfaceContract,
} from "@dpeek/formless-astryx/contract";
import type { EntitySchema, QueryEvaluationContext } from "@dpeek/formless-schema";
import type { RecordValues } from "@dpeek/formless-storage";
import { setSyncStatus } from "../../client/sync-status.ts";
import { selectEntityOperationByKind } from "../../client/operation-presentation-model.ts";
import {
  createReferenceOptionsSelector,
  type BrowserReplicaProjectionSnapshot,
} from "../../client/projections.ts";
import { getClientStoreSnapshot, subscribeToClientStore } from "../../client/store.ts";
import {
  type CreateDefaultConfig,
  type CreateFieldConfig,
  type CreateUnionPresentationConfig,
  type GeneratedOperationControlBinding,
  type GeneratedOperationController,
  type GeneratedOperationExecutionResult,
  type HomeOperationConfig,
  projectCollectionOperationControlBinding,
} from "../../client/views.ts";
import {
  initialGeneratedCreateDraftSessionState,
  markGeneratedCreateDraftSessionSubmitted,
  resolveGeneratedCreateValues,
  selectGeneratedCreateDraftSession,
  type GeneratedCreateDraftSessionState,
} from "./create-field-authoring.ts";
import { adaptGeneratedCreateFormlessUiDraftChange } from "./formless-ui-intents.ts";
import { projectGeneratedCreateFormlessUiSurface } from "./formless-ui-projection.ts";
import {
  indexGeneratedCreateSurfaceFields,
  resolveGeneratedCreateFieldIntent,
} from "./generated-create-field-index.ts";
import {
  LegacyGeneratedCreateForm,
  LegacyGeneratedCreateSurface,
} from "./legacy-create-surface.tsx";
import {
  executeGeneratedOperationControl,
  useGeneratedOperationController,
  useGeneratedOperationControllerVersion,
} from "./operation-control-runtime.ts";
import { shouldUseAppReplicaReferenceOptions } from "./reference-field-options.ts";

export type CreateHomeOperationConfig = Extract<HomeOperationConfig, { type: "create" }>;

export type GeneratedCreateTriggerPresentation = {
  content: FormlessUiButtonContent;
  density: "default" | "compact";
  prominence: "primary" | "secondary" | "quiet";
};

export type GeneratedCreateSubmissionResult =
  | {
      recordId: string;
      state: GeneratedCreateDraftSessionState;
      type: "created";
    }
  | {
      displayError: string;
      state: GeneratedCreateDraftSessionState;
      type: "failed";
    };

const DEFAULT_CREATE_TRIGGER: GeneratedCreateTriggerPresentation = {
  content: { kind: "label", label: "Create" },
  density: "default",
  prominence: "primary",
};

const GENERATED_CREATE_FAILURE_MESSAGE = "Create failed. Try again.";

export type GeneratedCreateRuntimeOptions = {
  closeOnSuccess: boolean;
  displaySafeErrors?: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (recordId: string) => void;
  open: boolean;
  operation: CreateHomeOperationConfig;
  queryContext?: QueryEvaluationContext;
  submitValues?: (values: RecordValues) => Promise<{ recordId: string }>;
  surfaceId: string;
  trigger: GeneratedCreateTriggerPresentation;
};

export type GeneratedCreateRuntime = {
  onCreateIntent: (intent: FormlessUiCreateIntent) => Promise<void> | void;
  onFieldIntent: FormlessUiCreateFieldIntentHandler;
  surface: FormlessUiCreateSurfaceContract;
};

export function GeneratedCreateForm({
  createFields,
  defaults = [],
  entity,
  entityName,
  union,
}: {
  createFields: CreateFieldConfig[];
  defaults?: CreateDefaultConfig[];
  entity: EntitySchema;
  entityName: string;
  union?: CreateUnionPresentationConfig;
}) {
  const createOperation = selectEntityOperationByKind(entityName, entity, "create", "collection");
  const operation = useMemo<CreateHomeOperationConfig | undefined>(
    () =>
      createOperation === undefined
        ? undefined
        : {
            type: "create",
            label: `Create ${entity.label}`,
            entityName,
            entity,
            operationName: createOperation.operationName,
            operation: createOperation,
            fields: createFields,
            defaults,
            ...(union === undefined ? {} : { union }),
            enabled: true,
          },
    [createFields, createOperation, defaults, entity, entityName, union],
  );

  if (operation === undefined) {
    return <p className="text-sm text-slate-600">Create is disabled for {entity.label}.</p>;
  }

  return (
    <GeneratedCreateRuntime
      heading={`Create ${entity.label}`}
      mode="form"
      onOpenChange={() => {}}
      open={true}
      operation={operation}
      surfaceId={`create-form:${entityName}`}
      trigger={{
        ...DEFAULT_CREATE_TRIGGER,
        content: { kind: "label", label: operation.label },
      }}
    />
  );
}

export function GeneratedCreateSurface({
  onSuccess,
  operation,
  queryContext,
  surfaceId,
  trigger,
}: {
  onSuccess?: (recordId: string) => void;
  operation: CreateHomeOperationConfig;
  queryContext?: QueryEvaluationContext;
  surfaceId: string;
  trigger: GeneratedCreateTriggerPresentation;
}) {
  const [open, setOpen] = useState(false);

  return (
    <GeneratedCreateRuntime
      mode="surface"
      onOpenChange={setOpen}
      onSuccess={onSuccess}
      open={open}
      operation={operation}
      queryContext={queryContext}
      renderTrigger={true}
      surfaceId={surfaceId}
      trigger={trigger}
    />
  );
}

export function GeneratedCreateDialog({
  onOpenChange,
  onSuccess,
  open,
  operation,
  queryContext,
  submitValues,
}: {
  onOpenChange: (open: boolean) => void;
  onSuccess?: (recordId: string) => void;
  open: boolean;
  operation: CreateHomeOperationConfig;
  queryContext?: QueryEvaluationContext;
  submitValues?: (values: RecordValues) => Promise<{ recordId: string }>;
}) {
  return (
    <GeneratedCreateRuntime
      mode="surface"
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
      open={open}
      operation={operation}
      queryContext={queryContext}
      renderTrigger={false}
      submitValues={submitValues}
      surfaceId={`create-dialog:${operation.operation.canonicalKey}`}
      trigger={{
        ...DEFAULT_CREATE_TRIGGER,
        content: { kind: "label", label: operation.label },
      }}
    />
  );
}

export function GeneratedCreateDialogForm({
  onSuccess,
  operation,
  queryContext,
  renderDialogCancel = true,
  submitValues,
}: {
  onSuccess?: (recordId: string) => void;
  operation: CreateHomeOperationConfig;
  queryContext?: QueryEvaluationContext;
  renderDialogCancel?: boolean;
  submitValues?: (values: RecordValues) => Promise<{ recordId: string }>;
}) {
  void renderDialogCancel;

  return (
    <GeneratedCreateRuntime
      mode="form"
      onOpenChange={() => {}}
      onSuccess={onSuccess}
      open={true}
      operation={operation}
      queryContext={queryContext}
      submitValues={submitValues}
      surfaceId={`create-dialog-form:${operation.operation.canonicalKey}`}
      trigger={{
        ...DEFAULT_CREATE_TRIGGER,
        content: { kind: "label", label: operation.label },
      }}
    />
  );
}

function GeneratedCreateRuntime({
  heading,
  mode,
  onOpenChange,
  onSuccess,
  open,
  operation,
  queryContext,
  renderTrigger = false,
  submitValues,
  surfaceId,
  trigger,
}: {
  heading?: string;
  mode: "form" | "surface";
  onOpenChange: (open: boolean) => void;
  onSuccess?: (recordId: string) => void;
  open: boolean;
  operation: CreateHomeOperationConfig;
  queryContext?: QueryEvaluationContext;
  renderTrigger?: boolean;
  submitValues?: (values: RecordValues) => Promise<{ recordId: string }>;
  surfaceId: string;
  trigger: GeneratedCreateTriggerPresentation;
}) {
  const runtime = useGeneratedCreateRuntime({
    closeOnSuccess: mode === "surface",
    onOpenChange,
    onSuccess,
    open,
    operation,
    queryContext,
    submitValues,
    surfaceId,
    trigger,
  });

  if (mode === "form") {
    return (
      <LegacyGeneratedCreateForm
        form={runtime.surface.dialog.form}
        heading={heading}
        onCreateIntent={runtime.onCreateIntent}
        onFieldIntent={runtime.onFieldIntent}
        surfaceId={runtime.surface.id}
      />
    );
  }

  return (
    <LegacyGeneratedCreateSurface
      onCreateIntent={runtime.onCreateIntent}
      onFieldIntent={runtime.onFieldIntent}
      renderTrigger={renderTrigger}
      surface={runtime.surface}
    />
  );
}

export function useGeneratedCreateRuntime({
  closeOnSuccess,
  displaySafeErrors = false,
  onOpenChange,
  onSuccess,
  open,
  operation,
  queryContext,
  submitValues,
  surfaceId,
  trigger,
}: GeneratedCreateRuntimeOptions): GeneratedCreateRuntime {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | undefined>();
  const [draftSessionState, setDraftSessionState] = useState(() => initialCreateState(operation));
  const draftSession = selectGeneratedCreateDraftSession({
    defaults: operation.defaults,
    enabled: operation.enabled,
    fields: operation.fields,
    queryContext,
    state: draftSessionState,
    union: operation.union,
  });
  const binding = useMemo(
    () =>
      submitValues === undefined ? projectCreateSubmitBinding(operation, surfaceId) : undefined,
    [operation, submitValues, surfaceId],
  );
  const bindings = useMemo(() => (binding === undefined ? [] : [binding]), [binding]);
  const controller = useGeneratedOperationController(bindings);
  useGeneratedOperationControllerVersion(controller);
  const operationPending = binding === undefined ? false : controller.isPending(binding.id);
  const submitPending = isSubmitting || operationPending;
  const referenceOptionsByFieldName = useCreateReferenceOptionsByFieldName(operation.fields);
  const surface = projectGeneratedCreateFormlessUiSurface({
    enabled: operation.enabled,
    entityLabel: operation.entity.label,
    ...(submissionError === undefined ? {} : { formErrors: [submissionError] }),
    id: surfaceId,
    isSubmitting: submitPending,
    open,
    referenceOptionsByFieldName,
    session: draftSession,
    state: draftSessionState,
    submitLabel: operation.label,
    trigger,
    triggerLabel: operation.label,
  });
  const fieldsById = indexGeneratedCreateSurfaceFields(surface);

  useEffect(() => {
    setDraftSessionState(initialCreateState(operation));
    setSubmissionError(undefined);
  }, [operation.defaults, operation.fields, operation.union]);

  useEffect(() => {
    if (!open && closeOnSuccess) {
      setDraftSessionState(initialCreateState(operation));
    }
  }, [closeOnSuccess, open, operation.defaults, operation.fields, operation.union]);

  function onFieldIntent(
    fieldId: string,
    intent: Parameters<FormlessUiCreateFieldIntentHandler>[1],
  ) {
    if (
      intent.type !== "createDraftChange" ||
      resolveGeneratedCreateFieldIntent(fieldsById, fieldId, intent) === undefined
    ) {
      return;
    }

    setSubmissionError(undefined);
    setDraftSessionState((state) => {
      const result = adaptGeneratedCreateFormlessUiDraftChange(intent, { state });
      return result.state ?? state;
    });
  }

  async function submit() {
    if (submitPending) {
      return;
    }

    const submittedState = markGeneratedCreateDraftSessionSubmitted(draftSessionState);
    const submittedSession = selectGeneratedCreateDraftSession({
      defaults: operation.defaults,
      enabled: operation.enabled,
      fields: operation.fields,
      queryContext,
      state: submittedState,
      union: operation.union,
    });
    setDraftSessionState(submittedState);
    setSubmissionError(undefined);

    if (!submittedSession.canSubmit) {
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await executeGeneratedCreateSubmission({
        resetState: initialCreateState(operation),
        state: submittedState,
        submitValues: (values) =>
          submitCreateValues({
            binding,
            controller,
            operation,
            submitValues,
            values,
          }),
        values: submittedSession.values,
      });
      setDraftSessionState(result.state);

      if (result.type === "failed") {
        if (displaySafeErrors) {
          setSubmissionError(GENERATED_CREATE_FAILURE_MESSAGE);
        }
        setSyncStatus({
          state: "error",
          message: displaySafeErrors ? GENERATED_CREATE_FAILURE_MESSAGE : result.displayError,
        });
        return;
      }

      onSuccess?.(result.recordId);

      if (closeOnSuccess) {
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function onCreateIntent(intent: FormlessUiCreateIntent) {
    if (intent.surfaceId !== surface.id) {
      return;
    }

    if (intent.type === "createSubmit") {
      return submit();
    }

    if (intent.open && surface.trigger.disabled) {
      return;
    }

    onOpenChange(intent.open);
  }

  return { onCreateIntent, onFieldIntent, surface };
}

export function projectInitialGeneratedCreateRuntimeSurface({
  operation,
  queryContext,
  snapshot,
  surfaceId,
  trigger,
}: {
  operation: CreateHomeOperationConfig;
  queryContext?: QueryEvaluationContext;
  snapshot: BrowserReplicaProjectionSnapshot;
  surfaceId: string;
  trigger: GeneratedCreateTriggerPresentation;
}): FormlessUiCreateSurfaceContract {
  const state = initialCreateState(operation);
  const session = selectGeneratedCreateDraftSession({
    defaults: operation.defaults,
    enabled: operation.enabled,
    fields: operation.fields,
    queryContext,
    state,
    union: operation.union,
  });

  return projectGeneratedCreateFormlessUiSurface({
    enabled: operation.enabled,
    entityLabel: operation.entity.label,
    id: surfaceId,
    isSubmitting: false,
    open: false,
    referenceOptionsByFieldName: selectCreateReferenceOptionsByFieldName(
      operation.fields,
      snapshot,
    ),
    session,
    state,
    submitLabel: operation.label,
    trigger,
    triggerLabel: operation.label,
  });
}

function useCreateReferenceOptionsByFieldName(fields: readonly CreateFieldConfig[]) {
  const snapshot = useSyncExternalStore(
    subscribeToClientStore,
    getClientStoreSnapshot,
    getClientStoreSnapshot,
  );

  return useMemo(
    () => selectCreateReferenceOptionsByFieldName(fields, snapshot),
    [fields, snapshot],
  );
}

export function selectCreateReferenceOptionsByFieldName(
  fields: readonly CreateFieldConfig[],
  snapshot: BrowserReplicaProjectionSnapshot,
) {
  return Object.fromEntries(
    fields.map((fieldConfig) => {
      const field = fieldConfig.field;

      if (field.type !== "reference" || !shouldUseAppReplicaReferenceOptions(field)) {
        return [fieldConfig.fieldName, []];
      }

      return [
        fieldConfig.fieldName,
        createReferenceOptionsSelector(field.to, field.displayField)(snapshot),
      ];
    }),
  );
}

function initialCreateState(
  operation: CreateHomeOperationConfig,
): GeneratedCreateDraftSessionState {
  return initialGeneratedCreateDraftSessionState({
    defaults: operation.defaults,
    fields: operation.fields,
    union: operation.union,
  });
}

export async function executeGeneratedCreateSubmission({
  resetState,
  state,
  submitValues,
  values,
}: {
  resetState: GeneratedCreateDraftSessionState;
  state: GeneratedCreateDraftSessionState;
  submitValues: (values: RecordValues) => Promise<{ recordId: string }>;
  values: RecordValues;
}): Promise<GeneratedCreateSubmissionResult> {
  try {
    const response = await submitValues(values);

    return {
      recordId: response.recordId,
      state: resetState,
      type: "created",
    };
  } catch (error) {
    return {
      displayError: error instanceof Error ? error.message : "Save failed.",
      state,
      type: "failed",
    };
  }
}

async function submitCreateValues({
  binding,
  controller,
  operation,
  submitValues,
  values,
}: {
  binding: GeneratedOperationControlBinding | undefined;
  controller: GeneratedOperationController;
  operation: CreateHomeOperationConfig;
  submitValues?: (values: RecordValues) => Promise<{ recordId: string }>;
  values: RecordValues;
}): Promise<{ recordId: string }> {
  if (submitValues !== undefined) {
    setSyncStatus({
      state: "syncing",
      message: `Saving ${operation.entity.label.toLowerCase()}...`,
    });
    const response = await submitValues(values);
    setSyncStatus({ state: "idle", message: "Saved and synced." });
    return response;
  }

  if (binding === undefined) {
    throw new Error(`Create operation is unavailable for ${operation.entity.label}.`);
  }

  const result = await executeCreateSubmitOperation({
    binding,
    controller,
    progressMessage: `Saving ${operation.entity.label.toLowerCase()}...`,
    values,
  });

  if (result.type === "failed") {
    throw new Error(result.displayError);
  }

  return { recordId: selectCreatedOperationRecordId(result) };
}

export function resolveCreateValues(
  formData: FormData,
  operation: CreateHomeOperationConfig,
  queryContext?: QueryEvaluationContext,
): RecordValues {
  return resolveGeneratedCreateValues({
    formData,
    fields: operation.fields,
    union: operation.union,
    defaults: operation.defaults,
    queryContext,
  });
}

export function projectCreateSubmitBinding(
  operation: CreateHomeOperationConfig,
  idPrefix: string,
): GeneratedOperationControlBinding {
  return projectCollectionOperationControlBinding(operation, { idPrefix });
}

export async function executeCreateSubmitOperation({
  binding,
  controller,
  progressMessage,
  values,
}: {
  binding: GeneratedOperationControlBinding;
  controller: GeneratedOperationController;
  progressMessage: string;
  values: RecordValues;
}): Promise<GeneratedOperationExecutionResult> {
  return executeGeneratedOperationControl({
    binding,
    callerInput: {
      bindingId: binding.id,
      input: values,
      source: "submitButton",
    },
    controller,
    feedback: {
      committedMessage: "Saved and synced.",
      progressMessage,
      replayedMessage: "Saved and synced.",
    },
  });
}

function selectCreatedOperationRecordId(result: GeneratedOperationExecutionResult) {
  if (result.type === "failed") {
    throw new Error(result.displayError);
  }

  const recordId = result.createdRecordIds?.[0];

  if (recordId === undefined) {
    throw new Error("Create operation did not return a created record.");
  }

  return recordId;
}
